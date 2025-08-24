// Polyfill fetch for Node.js 16 compatibility
if (!globalThis.fetch) {
    const fetch = require('node-fetch');
    globalThis.fetch = fetch;
    globalThis.Headers = fetch.Headers;
    globalThis.Request = fetch.Request;
    globalThis.Response = fetch.Response;
}

const app = require('./app');
const models = require('./models');
const SchedulerService = require('./services/schedulerService');
const jobProcessorService = require('./services/jobProcessorService');
const port = process.env.PORT || 3000;

(async () => {
    try {
        await models.sequelize.sync({ alter: true });
        console.log('Database synchronized.');

        // Initialize scheduled tasks
        SchedulerService.init();

        // Initialize job processor service
        jobProcessorService.start();

        // Schedule periodic cleanup of old jobs (every 6 hours)
        const cron = require('node-cron');
        cron.schedule('0 */6 * * *', () => {
            jobProcessorService.cleanupOldJobs(24); // Remove jobs older than 24 hours
        });

        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });

        // Graceful shutdown handlers
        const gracefulShutdown = () => {
            console.log('Shutting down gracefully...');
            jobProcessorService.stop();
            SchedulerService.stop();
            process.exit(0);
        };

        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);

    } catch (error) {
        console.error('Failed to synchronize database:', error);
        process.exit(1);
    }
})();
