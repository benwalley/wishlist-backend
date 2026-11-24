const { Job } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const onDemandJobService = require('../services/onDemandJobService');
const itemFetchService = require('../services/itemFetchService');
const imageProcessingService = require('../services/imageProcessingService');

// Imports report progress at least every ~minute; silence this long means the job died
const STALE_JOB_MS = 3 * 60 * 1000;
const MAX_IMPORT_IMAGES = 300;

/**
 * Start an async wishlist import job
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function startWishlistImport(req, res, next) {
    try {
        const { url } = req.body;
        const userId = req.user.id;

        let cleanUrl;
        try {
            cleanUrl = itemFetchService.normalizeUrl(url);
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: error.publicMessage || 'Please provide a valid URL'
            });
        }

        await onDemandJobService.failStaleJobs({ userId, url: cleanUrl }, STALE_JOB_MS);

        // Check for existing pending/processing jobs for this URL and user
        const existingJob = await Job.findOne({
            where: {
                userId: userId,
                url: cleanUrl,
                status: ['pending', 'processing']
            }
        });

        if (existingJob) {
            return res.status(200).json({
                success: true,
                message: 'Job already in progress',
                jobId: existingJob.id,
                status: existingJob.status
            });
        }

        // Create new job
        const job = await Job.create({
            userId: userId,
            url: cleanUrl,
            status: 'pending',
            metadata: {
                jobType: 'wishlist_import'
            }
        });

        console.log(`User ${userId} started wishlist import job ${job.id} for URL: ${cleanUrl}`);

        // Execute the job immediately (non-blocking)
        onDemandJobService.executeJob(job);

        res.status(201).json({
            success: true,
            message: 'Wishlist import job started',
            jobId: job.id,
            status: job.status
        });

    } catch (error) {
        console.error('Error starting wishlist import job:', error);
        next(error);
    }
}

/**
 * Get status of a wishlist import job
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getJobStatus(req, res, next) {
    try {
        const { jobId } = req.params;
        const userId = req.user.id;

        await onDemandJobService.failStaleJobs({ id: jobId, userId }, STALE_JOB_MS);

        const job = await Job.findOne({
            where: {
                id: jobId,
                userId: userId
            }
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        const response = {
            success: true,
            jobId: job.id,
            status: job.status,
            progress: job.progress,
            progressMessage: job.metadata?.progressMessage || null,
            url: job.url,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt
        };

        // Include result if completed
        if (job.status === 'completed' && job.result) {
            response.data = job.result;
        }

        // Include error if failed
        if (job.status === 'failed' && job.error) {
            response.error = job.error;
        }

        res.status(200).json(response);

    } catch (error) {
        console.error('Error getting job status:', error);
        next(error);
    }
}

/**
 * Cancel a pending wishlist import job
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function cancelJob(req, res, next) {
    try {
        const { jobId } = req.params;
        const userId = req.user.id;

        const job = await Job.findOne({
            where: {
                id: jobId,
                userId: userId
            }
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        if (job.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel completed job'
            });
        }

        if (job.status === 'processing') {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel job that is currently processing'
            });
        }

        if (job.status === 'failed') {
            return res.status(400).json({
                success: false,
                message: 'Job has already failed'
            });
        }

        // Update job status to failed with cancellation message
        await job.update({
            status: 'failed',
            error: 'Job cancelled by user'
        });

        console.log(`User ${userId} cancelled job ${jobId}`);

        res.status(200).json({
            success: true,
            message: 'Job cancelled successfully'
        });

    } catch (error) {
        console.error('Error cancelling job:', error);
        next(error);
    }
}

/**
 * Get all jobs for the current user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getUserJobs(req, res, next) {
    try {
        const userId = req.user.id;
        const { limit = 10, offset = 0 } = req.query;

        const jobs = await Job.findAll({
            where: {
                userId: userId
            },
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            attributes: ['id', 'url', 'status', 'createdAt', 'updatedAt']
        });

        res.status(200).json({
            success: true,
            jobs: jobs
        });

    } catch (error) {
        console.error('Error getting user jobs:', error);
        next(error);
    }
}

/**
 * Download and store images for items the user chose to import.
 * Body: { imageUrls: string[] } -> data: { [url]: imageId | null }
 */
async function processImportImages(req, res, next) {
    try {
        const { imageUrls } = req.body;
        const userId = req.user.id;

        if (!Array.isArray(imageUrls)) {
            return res.status(400).json({ success: false, message: 'imageUrls must be an array' });
        }

        const urls = [...new Set(imageUrls.filter(url => typeof url === 'string' && url.trim()))]
            .filter(url => {
                const safe = itemFetchService.safeNormalize(url);
                return safe && /^https?:/i.test(url);
            })
            .slice(0, MAX_IMPORT_IMAGES);

        const results = await imageProcessingService.processBatchImages(urls, 'wishlist_item', 512, 8, {
            timeout: 10000,
            recordId: userId
        });

        const data = {};
        results.forEach(result => { data[result.url] = result.imageId; });

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Error processing import images:', error);
        next(error);
    }
}

module.exports = {
    processImportImages,
    startWishlistImport,
    getJobStatus,
    cancelJob,
    getUserJobs
};