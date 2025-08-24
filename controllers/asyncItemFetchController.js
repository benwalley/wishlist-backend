const { Job } = require('../models');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Start an async item fetch job
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function startItemFetch(req, res, next) {
    try {
        const { url } = req.body;
        const userId = req.user.id;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'URL is required'
            });
        }

        if (typeof url !== 'string' || url.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid URL'
            });
        }

        const cleanUrl = url.trim();

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
            status: 'pending'
        });

        console.log(`User ${userId} started item fetch job ${job.id} for URL: ${cleanUrl}`);

        res.status(201).json({
            success: true,
            message: 'Item fetch job started',
            jobId: job.id,
            status: job.status
        });

    } catch (error) {
        console.error('Error starting item fetch job:', error);
        next(error);
    }
}

/**
 * Get status of an item fetch job
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getJobStatus(req, res, next) {
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

        const response = {
            success: true,
            jobId: job.id,
            status: job.status,
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
 * Cancel a pending item fetch job
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
 * Get job processor status (admin endpoint)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getProcessorStatus(req, res, next) {
    try {
        // Get database stats
        const pendingJobs = await Job.count({ where: { status: 'pending' } });
        const processingJobs = await Job.count({ where: { status: 'processing' } });
        const completedJobs = await Job.count({ where: { status: 'completed' } });
        const failedJobs = await Job.count({ where: { status: 'failed' } });

        res.status(200).json({
            success: true,
            database: {
                pending: pendingJobs,
                processing: processingJobs,
                completed: completedJobs,
                failed: failedJobs
            }
        });

    } catch (error) {
        console.error('Error getting processor status:', error);
        next(error);
    }
}

module.exports = {
    startItemFetch,
    getJobStatus,
    cancelJob,
    getUserJobs,
    getProcessorStatus
};