const csvImportService = require('./csvImportService');
const itemFetchService = require('./itemFetchService');
const wishlistImportService = require('./wishlistImportService');
const { Job } = require('../models');
const { Op } = require('sequelize');

const ITEM_FETCH_JOB_TIMEOUT_MS = 70000;
const WISHLIST_IMPORT_JOB_TIMEOUT_MS = 4 * 60 * 1000;

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
     * @returns {Promise<Object>} Wishlist import result (items carry imageUrl; images are processed at import time)
     */
    async processWishlistImportJob(job) {
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Starting wishlist import...`);

        return itemFetchService.withTimeout(
            wishlistImportService.importFromUrl(job.url, {
                onProgress: (percent, message) => this.updateProgress(job, percent, message)
            }),
            WISHLIST_IMPORT_JOB_TIMEOUT_MS,
            'Importing that list took too long. Please try again, or export the list to CSV and import that.'
        );
    }

    /**
     * Save progress on the job. Also acts as a heartbeat (updatedAt) for stale-job detection.
     * Never throws — progress is best-effort.
     */
    async updateProgress(job, percent, message) {
        try {
            await job.update({
                progress: Math.max(0, Math.min(100, Math.round(percent))),
                metadata: { ...(job.metadata || {}), progressMessage: message }
            });
        } catch (error) {
            console.warn(`[ON_DEMAND_JOB] Job ${job.id}: Failed to save progress: ${error.message}`);
        }
    }

    /**
     * Process a single item fetch job
     * @param {Object} job - Job object
     * @returns {Promise<Object>} Item fetch result
     */
    async processItemFetchJob(job) {
        const metadata = job.metadata || {};
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: Starting item fetch...`);

        // Hard cap so a hung page/AI call can never leave the job "processing" forever
        return itemFetchService.withTimeout(
            itemFetchService.fetchItem(metadata.resolvedUrl || job.url, job.userId, {
                skipFastPath: !!metadata.skipFastPath,
                partial: metadata.partial || null
            }),
            ITEM_FETCH_JOB_TIMEOUT_MS,
            'Fetching product details took too long. You can still fill them in manually.'
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

        // Images are processed at import time, only for the items the user selects
        console.log(`[ON_DEMAND_JOB] Job ${job.id}: CSV import completed - ${items.length} items`);

        return {
            fileName: job.metadata.fileName || 'unknown.csv',
            totalItems: items.length,
            items,
            processingMethod: 'csv_parsing'
        };
    }

    /**
     * Mark pending/processing jobs as failed if they haven't been updated recently.
     * Running jobs have a hard timeout (and wishlist imports update progress as they go),
     * so a job that has been silent this long was interrupted, e.g. by a server restart.
     * @param {Object} where - Extra where conditions (e.g. userId, url, id)
     * @param {number} staleMs - How long without an update counts as dead
     */
    async failStaleJobs(where, staleMs) {
        await Job.update({
            status: 'failed',
            error: 'This was interrupted. Please try again.'
        }, {
            where: {
                ...where,
                status: ['pending', 'processing'],
                updatedAt: { [Op.lt]: new Date(Date.now() - staleMs) }
            }
        });
    }

    /**
     * Clean up old completed/failed jobs (run periodically)
     * @param {number} olderThanHours - Remove jobs older than this many hours
     */
    async cleanupOldJobs(olderThanHours = 24) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

            // Includes pending/processing jobs this old — those were interrupted (e.g. by a restart)
            const deletedCount = await Job.destroy({
                where: {
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