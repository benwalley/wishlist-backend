const puppeteerService = require('./puppeteerService');
const geminiAIService = require('./geminiAIService');
const imageProcessingService = require('./imageProcessingService');
const urlImportService = require('./urlImportService');
const aiWishlistParser = require('./aiWishlistParser');
const { Job } = require('../models');
const { Op } = require('sequelize');

class JobProcessorService {
    constructor() {
        this.processingInterval = null;
    }

    /**
     * Start the job processor
     */
    start() {
        console.log('[JOB_PROCESSOR] Starting job processor');
        this.processingInterval = setInterval(() => {
            this.processNextJob();
        }, 2000); // Check for jobs every 2 seconds
    }

    /**
     * Stop the job processor
     */
    stop() {
        console.log('[JOB_PROCESSOR] Stopping job processor...');
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
    }

    /**
     * Process the next available job from the database
     */
    async processNextJob() {
        try {
            // Find the oldest pending job
            const job = await Job.findOne({
                where: { status: 'pending' },
                order: [['queuedAt', 'ASC']]
            });

            if (!job) {
                return; // No jobs available
            }

            console.log(`[JOB_PROCESSOR] Processing job ${job.id} for URL: ${job.url}`);
            await this.processJob(job);

        } catch (error) {
            console.error('[JOB_PROCESSOR] Error in processNextJob:', error);
        }
    }

    /**
     * Process a single job
     * @param {Object} job - The job object to process
     */
    async processJob(job) {
        try {
            // Update status to processing
            await job.update({ status: 'processing' });

            console.log(`[JOB_PROCESSOR] Processing job ${job.id} for URL: ${job.url}`);

            // Determine job type based on URL or metadata
            const jobType = this.determineJobType(job);
            console.log(`[JOB_PROCESSOR] Job ${job.id}: Detected job type: ${jobType}`);

            let result;
            if (jobType === 'wishlist_import') {
                result = await this.processWishlistImportJob(job);
            } else {
                result = await this.processItemFetchJob(job);
            }

            await job.update({
                status: 'completed',
                result: result
            });

            console.log(`[JOB_PROCESSOR] Job ${job.id} completed successfully`);

        } catch (error) {
            console.error(`[JOB_PROCESSOR] Job ${job.id} failed:`, error);

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
        console.log(`[JOB_PROCESSOR] Job ${job.id}: Starting wishlist import...`);

        // Step 1: Extract HTML content from the page
        console.log(`[JOB_PROCESSOR] Job ${job.id}: Extracting HTML content...`);
        const htmlExtraction = await urlImportService.extractPageHTML(job.url);

        console.log(`[JOB_PROCESSOR] Job ${job.id}: HTML extracted successfully`);
        console.log(`[JOB_PROCESSOR] - Content length: ${htmlExtraction.htmlContent.length} characters`);

        // Step 2: Parse wishlist content with AI
        console.log(`[JOB_PROCESSOR] Job ${job.id}: Processing HTML with AI parser...`);
        const parseResult = await aiWishlistParser.parseWithFallback(
            htmlExtraction.htmlContent,
            async () => {
                throw new Error('Traditional scraping not supported for generic URLs');
            }
        );

        console.log(`[JOB_PROCESSOR] Job ${job.id}: Parsing completed - Found ${parseResult.items?.length || 0} items`);

        if (!parseResult.success || !parseResult.items || parseResult.items.length === 0) {
            console.log(`[JOB_PROCESSOR] Job ${job.id}: No items found on page`);
            return {
                totalItems: 0,
                items: [],
                pageTitle: htmlExtraction.pageTitle || 'No Products Found',
                sourceUrl: htmlExtraction.sourceUrl,
                processingMethod: parseResult.processingMethod || 'unknown'
            };
        }

        // Step 3: Process images
        console.log(`[JOB_PROCESSOR] Job ${job.id}: Processing images...`);
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
                console.log(`[JOB_PROCESSOR] Job ${job.id}: Image processing complete: ${successCount}/${imageUrls.length} successful`);
            } catch (error) {
                console.error(`[JOB_PROCESSOR] Job ${job.id}: Image processing failed:`, error);
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
                console.warn(`[JOB_PROCESSOR] Job ${job.id}: No processed image for URL: ${item.imageUrl}`);
            }

            return processedItem;
        });

        const imageSuccessCount = imageProcessingResults.filter(r => r.imageId !== null).length;

        console.log(`[JOB_PROCESSOR] Job ${job.id}: Wishlist import completed - ${parseResult.items.length} items, ${imageSuccessCount} images processed`);

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
        console.log(`[JOB_PROCESSOR] Job ${job.id}: Starting item fetch...`);

        // Step 1: Scrape page content with Puppeteer
        console.log(`[JOB_PROCESSOR] Job ${job.id}: Starting Puppeteer scraping...`);
        const htmlContent = await this.scrapePageContent(job.url);

        // Step 2: Parse content with Gemini AI
        console.log(`[JOB_PROCESSOR] Job ${job.id}: Starting Gemini AI parsing...`);
        const parsedData = await this.parseItemData(htmlContent);

        // Step 3: Process image if found
        let imageId = null;
        if (parsedData.imageUrl) {
            console.log(`[JOB_PROCESSOR] Job ${job.id}: Processing image...`);
            try {
                imageId = await this.processImage(parsedData.imageUrl, job.userId);
                console.log(`[JOB_PROCESSOR] Job ${job.id}: Image processed with ID: ${imageId}`);
            } catch (error) {
                console.error(`[JOB_PROCESSOR] Job ${job.id}: Image processing failed:`, error);
                // Continue without image - don't fail the entire job
            }
        }

        console.log(`[JOB_PROCESSOR] Job ${job.id}: Item fetch completed`);

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
     * Get queue status
     * @returns {Object} Queue status information
     */
    async getStatus() {
        const pendingJobs = await Job.count({ where: { status: 'pending' } });
        const processingJobs = await Job.count({ where: { status: 'processing' } });

        return {
            pendingJobs: pendingJobs,
            processingJobs: processingJobs,
            isRunning: this.processingInterval !== null
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

            const deletedCount = await Job.destroy({
                where: {
                    status: ['completed', 'failed'],
                    updatedAt: {
                        [Op.lt]: cutoffDate
                    }
                }
            });

            if (deletedCount > 0) {
                console.log(`[JOB_PROCESSOR] Cleaned up ${deletedCount} old jobs`);
            }
        } catch (error) {
            console.error('[JOB_PROCESSOR] Error cleaning up old jobs:', error);
        }
    }
}

// Export singleton instance
module.exports = new JobProcessorService();
