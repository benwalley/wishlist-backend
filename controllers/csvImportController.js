const csvImportService = require('../services/csvImportService');
const imageProcessingService = require('../services/imageProcessingService');
const { Job } = require('../models');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Process CSV file and return items without saving to database
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.fetchFromCsv = async (req, res, next) => {
    const startTime = Date.now();
    try {
        const userId = req.user.id;
        const file = req.file;

        console.log(`[CSV-FETCH] Starting CSV processing for user ${userId}`);
        console.log(`[CSV-FETCH] File: ${file?.originalname}, Size: ${file?.size} bytes`);

        // Step 1: Validate file
        console.log(`[CSV-FETCH] Step 1/4: Validating uploaded file...`);
        csvImportService.validateFile(file);
        console.log(`[CSV-FETCH] Step 1/4: ✅ File validation passed`);

        // Step 2: Parse CSV content
        console.log(`[CSV-FETCH] Step 2/4: Parsing CSV content...`);
        const items = await csvImportService.parseCsv(file.buffer);
        console.log(`[CSV-FETCH] Step 2/4: ✅ CSV parsed successfully - ${items.length} items found`);

        if (items.length === 0) {
            console.log(`[CSV-FETCH] ⚠️  No valid items found in CSV`);
            return res.status(200).json({
                success: true,
                message: 'CSV processed but no valid items found',
                data: {
                    totalItems: 0,
                    items: [],
                    fileName: file.originalname,
                    processingMethod: 'csv_parsing'
                }
            });
        }

        // Step 3: Process images
        console.log(`[CSV-FETCH] Step 3/4: Processing images...`);
        const imageUrls = csvImportService.extractImageUrls(items);
        
        let imageProcessingResults = [];
        let imageProcessingTime = 0;

        if (imageUrls.length > 0) {
            console.log(`[CSV-FETCH] Processing ${imageUrls.length} images...`);
            const imageStartTime = Date.now();
            
            try {
                imageProcessingResults = await imageProcessingService.processBatchImages(
                    imageUrls,
                    'csv_import',
                    512 // 512x512 square images
                );
                imageProcessingTime = Date.now() - imageStartTime;
                
                const successCount = imageProcessingResults.filter(r => r.imageId !== null).length;
                console.log(`[CSV-FETCH] ✅ Image processing complete: ${successCount}/${imageUrls.length} successful (${imageProcessingTime}ms)`);
            } catch (error) {
                console.error(`[CSV-FETCH] ❌ Image processing failed:`, error);
                imageProcessingResults = imageUrls.map(url => ({
                    url: url,
                    imageId: null,
                    error: 'Image processing failed'
                }));
            }
        }

        // Step 4: Map images to items
        console.log(`[CSV-FETCH] Step 4/4: Mapping images to items...`);
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
                delete processedItem.imageUrl; // Remove imageUrl, replace with imageId
            } else if (item.imageUrl) {
                console.warn(`[CSV-FETCH] ⚠️  No processed image for URL: ${item.imageUrl}`);
            }
            
            return processedItem;
        });

        const imageSuccessCount = imageProcessingResults.filter(r => r.imageId !== null).length;
        
        console.log(`[CSV-FETCH] Step 4/4: ✅ Processing complete`);
        console.log(`[CSV-FETCH] 🎉 COMPLETE: Processed ${items.length} items from CSV, uploaded ${imageSuccessCount} images`);
        console.log(`[CSV-FETCH] Total processing time: ${Date.now() - startTime}ms (images: ${imageProcessingTime}ms)`);
        
        res.status(200).json({
            success: true,
            message: `Successfully processed ${items.length} items from CSV${imageSuccessCount > 0 ? ` and processed ${imageSuccessCount} images` : ''}`,
            data: {
                fileName: file.originalname,
                totalItems: items.length,
                items: processedItems,
                processingMethod: 'csv_parsing',
                imageProcessing: {
                    totalImages: imageUrls.length,
                    successfulImages: imageSuccessCount,
                    failedImages: imageUrls.length - imageSuccessCount,
                    processingTimeMs: imageProcessingTime
                }
            }
        });

    } catch (error) {
        console.error('Error processing CSV file:', error);
        next(error);
    }
};

/**
 * Start an async CSV import job
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.startCsvImport = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'CSV file is required'
            });
        }

        // Validate file
        csvImportService.validateFile(file);

        // Encode CSV data as base64 for storage in job metadata
        const csvData = file.buffer.toString('base64');

        // Check for existing pending/processing CSV jobs for this user
        const existingJob = await Job.findOne({
            where: {
                userId: userId,
                status: ['pending', 'processing'],
                metadata: {
                    jobType: 'csv_import'
                }
            }
        });

        if (existingJob) {
            return res.status(200).json({
                success: true,
                message: 'CSV import job already in progress',
                jobId: existingJob.id,
                status: existingJob.status
            });
        }

        // Create new CSV import job
        const job = await Job.create({
            userId: userId,
            url: `https://csv-import.local/${encodeURIComponent(file.originalname)}`, // Valid URL format for CSV imports
            status: 'pending',
            metadata: {
                jobType: 'csv_import',
                fileName: file.originalname,
                fileSize: file.size,
                csvData: csvData
            }
        });

        console.log(`User ${userId} started CSV import job ${job.id} for file: ${file.originalname}`);

        res.status(201).json({
            success: true,
            message: 'CSV import job started',
            jobId: job.id,
            status: job.status,
            fileName: file.originalname
        });

    } catch (error) {
        console.error('Error starting CSV import job:', error);
        next(error);
    }
};