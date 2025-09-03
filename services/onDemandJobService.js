const puppeteerService = require('./puppeteerService');
const geminiAIService = require('./geminiAIService');
const imageProcessingService = require('./imageProcessingService');
const urlImportService = require('./urlImportService');
const aiWishlistParser = require('./aiWishlistParser');
const csvImportService = require('./csvImportService');
const { Job } = require('../models');

class OnDemandJobService {
    /**
     * Execute a job immediately (non-blocking)
     * @param {Object} job - The job object to process
     */
    async executeJob(job) {
        // Execute the job in the background without blocking the response
        setImmediate(async () => {
            try {
                await this.processJob(job);
            } catch (error) {
                console.error(`[ON_DEMAND_JOB] Error executing job ${job.id}:`, error);
            }
        });
    }

    /**
     * Process a single job
     * @param {Object} job - The job object to process
     */
    async processJob(job) {
        try {
            // Update status to processing
            await job.update({ status: 'processing' });

            console.log(`[ON_DEMAND_JOB] Processing job ${job.id} for URL: ${job.url}`);

            // Determine job type based on URL or metadata
            const jobType = this.determineJobType(job);
            console.log(`[ON_DEMAND_JOB] Job ${job.id}: Detected job type: ${jobType}`);

            let result;
            if (jobType === 'wishlist_import') {
                result = await this.processWishlistImportJob(job);
            } else if (jobType === 'csv_import') {
                result = await this.processCsvImportJob(job);
            } else {
                result = await this.processItemFetchJob(job);
            }

            await job.update({
                status: 'completed',
                result: result
            });

            console.log(`[ON_DEMAND_JOB] Job ${job.id} completed successfully`);

        } catch (error) {
            console.error(`[ON_DEMAND_JOB] Job ${job.id} failed:`, error);

            await job.update({
                status: 'failed',
                error: error.message || 'Unknown error occurred'
            });
        }
    }

    /**
     * Determine job type based on job data
     * @param {Object} job - Job object
     * @returns {string} Job type
     */
    determineJobType(job) {
        // Check metadata first if available
        if (job.metadata && job.metadata.jobType) {
            return job.metadata.jobType;
        }

        // Default to single item fetch for backward compatibility
        return 'item_fetch';
    }

    /**
     * Process a wishlist import job
     * @param {Object} job - Job object
     * @returns {Promise<Object>} Wishlist import result
     */
    async processWishlistImportJob(job) {
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Starting wishlist import...`);

        // Step 1: Extract HTML content from the page
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Extracting HTML content...`);
        const htmlExtraction = await urlImportService.extractPageHTML(job.url);

        console.log(`[ON_DEMAND_JOB] Job ${job.id}: HTML extracted successfully`);
        console.log(`[ON_DEMAND_JOB] - Content length: ${htmlExtraction.htmlContent.length} characters`);

        // Step 2: Parse wishlist content with AI
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Processing HTML with AI parser...`);
        const parseResult = await aiWishlistParser.parseWithFallback(
            htmlExtraction.htmlContent,
            async () => {
                throw new Error('Traditional scraping not supported for generic URLs');
            }
        );

        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Parsing completed - Found ${parseResult.items?.length || 0} items`);

        if (!parseResult.success || !parseResult.items || parseResult.items.length === 0) {
            console.log(`[ON_DEMAND_JOB] Job ${job.id}: No items found on page`);
            return {
                totalItems: 0,
                items: [],
                pageTitle: htmlExtraction.pageTitle || 'No Products Found',
                sourceUrl: htmlExtraction.sourceUrl,
                processingMethod: parseResult.processingMethod || 'unknown'
            };
        }

        // Step 3: Process images
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Processing images...`);
        const imageUrls = parseResult.items
            .map(item => item.imageUrl)
            .filter(url => url && url.trim().length > 0);

        let imageProcessingResults = [];
        if (imageUrls.length > 0) {
            try {
                imageProcessingResults = await imageProcessingService.processBatchImages(
                    imageUrls,
                    'wishlist_item',
                    512
                );
                const successCount = imageProcessingResults.filter(r => r.imageId !== null).length;
                console.log(`[ON_DEMAND_JOB] Job ${job.id}: Image processing complete: ${successCount}/${imageUrls.length} successful`);
            } catch (error) {
                console.error(`[ON_DEMAND_JOB] Job ${job.id}: Image processing failed:`, error);
                imageProcessingResults = imageUrls.map(url => ({
                    url: url,
                    imageId: null,
                    error: 'Image processing failed'
                }));
            }
        }

        // Step 4: Map images to items
        const urlToImageId = {};
        imageProcessingResults.forEach(result => {
            if (result.imageId !== null) {
                urlToImageId[result.url] = result.imageId;
            }
        });

        const processedItems = parseResult.items.map(item => {
            const processedItem = { ...item };

            if (item.imageUrl && urlToImageId[item.imageUrl]) {
                processedItem.imageId = urlToImageId[item.imageUrl];
                delete processedItem.imageUrl;
            } else if (item.imageUrl) {
                console.warn(`[ON_DEMAND_JOB] Job ${job.id}: No processed image for URL: ${item.imageUrl}`);
            }

            return processedItem;
        });

        const imageSuccessCount = imageProcessingResults.filter(r => r.imageId !== null).length;

        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Wishlist import completed - ${parseResult.items.length} items, ${imageSuccessCount} images processed`);

        return {
            pageTitle: htmlExtraction.pageTitle,
            totalItems: parseResult.items.length,
            items: processedItems,
            sourceUrl: htmlExtraction.sourceUrl,
            processingMethod: parseResult.processingMethod,
            extractionMethod: htmlExtraction.extractionMethod,
            imageProcessing: {
                totalImages: imageUrls.length,
                successfulImages: imageSuccessCount,
                failedImages: imageUrls.length - imageSuccessCount
            },
            ...(parseResult.aiMetadata && { aiMetadata: parseResult.aiMetadata }),
            ...(parseResult.fallbackReason && { fallbackReason: parseResult.fallbackReason })
        };
    }

    /**
     * Process a single item fetch job
     * @param {Object} job - Job object
     * @returns {Promise<Object>} Item fetch result
     */
    async processItemFetchJob(job) {
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Starting item fetch...`);

        // Step 1: Scrape page content with Puppeteer
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Starting Puppeteer scraping...`);
        const htmlContent = await this.scrapePageContent(job.url);

        // Step 2: Parse content with Gemini AI
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Starting Gemini AI parsing...`);
        const parsedData = await this.parseItemData(htmlContent);

        // Step 3: Process image if found
        let imageId = null;
        if (parsedData.imageUrl) {
            console.log(`[ON_DEMAND_JOB] Job ${job.id}: Processing image...`);
            try {
                imageId = await this.processImage(parsedData.imageUrl, job.userId);
                console.log(`[ON_DEMAND_JOB] Job ${job.id}: Image processed with ID: ${imageId}`);
            } catch (error) {
                console.error(`[ON_DEMAND_JOB] Job ${job.id}: Image processing failed:`, error);
                // Continue without image - don't fail the entire job
            }
        }

        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Item fetch completed`);

        return {
            name: parsedData.name || null,
            price: parsedData.price || null,
            imageUrl: parsedData.imageUrl || null,
            linkLabel: parsedData.linkLabel || null,
            imageId: imageId
        };
    }

    /**
     * Scrape page content using Puppeteer
     * @param {string} url - URL to scrape
     * @returns {Promise<string>} HTML content
     */
    async scrapePageContent(url) {
        const htmlContent = await puppeteerService.withPage(async (page) => {
            await puppeteerService.navigateToPage(page, url, {
                waitUntil: 'domcontentloaded', // Faster than networkidle2
                timeout: 20000 // Reasonable timeout for background job
            });
            return await page.evaluate(() => document.body.innerHTML);
        }, { blockImages: true }); // Block images for faster loading

        if (!htmlContent) {
            throw new Error('Unable to extract content from the provided URL');
        }

        return htmlContent;
    }

    /**
     * Parse item data using Gemini AI
     * @param {string} htmlContent - HTML content to parse
     * @returns {Promise<Object>} Parsed item data
     */
    async parseItemData(htmlContent) {
        return await geminiAIService.parseItemData(htmlContent);
    }

    /**
     * Process and save image
     * @param {string} imageUrl - Image URL to process
     * @param {number} userId - User ID for the image
     * @returns {Promise<string>} Image ID
     */
    async processImage(imageUrl, userId) {
        return await imageProcessingService.downloadAndSaveImage(
            imageUrl,
            userId,
            'item_fetch',
            512 // 512x512 square images
        );
    }

    /**
     * Process a CSV import job
     * @param {Object} job - Job object
     * @returns {Promise<Object>} CSV import result
     */
    async processCsvImportJob(job) {
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Starting CSV import...`);

        // CSV data should be stored in job metadata
        if (!job.metadata || !job.metadata.csvData) {
            throw new Error('No CSV data found in job metadata');
        }

        // Step 1: Parse CSV data from metadata
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Processing CSV data...`);
        const csvBuffer = Buffer.from(job.metadata.csvData, 'base64');
        const items = await csvImportService.parseCsv(csvBuffer);

        console.log(`[ON_DEMAND_JOB] Job ${job.id}: CSV parsed successfully - Found ${items.length} items`);

        if (items.length === 0) {
            console.log(`[ON_DEMAND_JOB] Job ${job.id}: No items found in CSV`);
            return {
                totalItems: 0,
                items: [],
                fileName: job.metadata.fileName || 'unknown.csv',
                processingMethod: 'csv_parsing'
            };
        }

        // Step 2: Process images
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Processing images...`);
        const imageUrls = csvImportService.extractImageUrls(items);

        let imageProcessingResults = [];
        if (imageUrls.length > 0) {
            try {
                imageProcessingResults = await imageProcessingService.processBatchImages(
                    imageUrls,
                    'csv_import',
                    512
                );
                const successCount = imageProcessingResults.filter(r => r.imageId !== null).length;
                console.log(`[ON_DEMAND_JOB] Job ${job.id}: Image processing complete: ${successCount}/${imageUrls.length} successful`);
            } catch (error) {
                console.error(`[ON_DEMAND_JOB] Job ${job.id}: Image processing failed:`, error);
                imageProcessingResults = imageUrls.map(url => ({
                    url: url,
                    imageId: null,
                    error: 'Image processing failed'
                }));
            }
        }

        // Step 3: Map images to items
        const urlToImageId = {};
        imageProcessingResults.forEach(result => {
            if (result.imageId !== null) {
                urlToImageId[result.url] = result.imageId;
            }
        });

        const processedItems = items.map(item => {
            const processedItem = { ...item };

            if (item.imageUrl && urlToImageId[item.imageUrl]) {
                processedItem.imageId = urlToImageId[item.imageUrl];
                delete processedItem.imageUrl;
            } else if (item.imageUrl) {
                console.warn(`[ON_DEMAND_JOB] Job ${job.id}: No processed image for URL: ${item.imageUrl}`);
            }

            return processedItem;
        });

        const imageSuccessCount = imageProcessingResults.filter(r => r.imageId !== null).length;

        console.log(`[ON_DEMAND_JOB] Job ${job.id}: CSV import completed - ${items.length} items, ${imageSuccessCount} images processed`);

        return {
            fileName: job.metadata.fileName || 'unknown.csv',
            totalItems: items.length,
            items: processedItems,
            processingMethod: 'csv_parsing',
            imageProcessing: {
                totalImages: imageUrls.length,
                successfulImages: imageSuccessCount,
                failedImages: imageUrls.length - imageSuccessCount
            }
        };
    }

    /**
     * Clean up old completed/failed jobs (run periodically)
     * @param {number} olderThanHours - Remove jobs older than this many hours
     */
    async cleanupOldJobs(olderThanHours = 24) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

            const { Op } = require('sequelize');
            const deletedCount = await Job.destroy({
                where: {
                    status: ['completed', 'failed'],
                    updatedAt: {
                        [Op.lt]: cutoffDate
                    }
                }
            });

            if (deletedCount > 0) {
                console.log(`[ON_DEMAND_JOB] Cleaned up ${deletedCount} old jobs`);
            }
        } catch (error) {
            console.error('[ON_DEMAND_JOB] Error cleaning up old jobs:', error);
        }
    }
}

// Export singleton instance
module.exports = new OnDemandJobService();