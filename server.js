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
const port = process.env.PORT || 3000;

(async () => {
    try {
        await models.sequelize.sync({ alter: true });
        console.log('Database synchronized.');

        // Initialize scheduled tasks
        SchedulerService.init();

        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Failed to synchronize database:', error);
        process.exit(1);
    }
})();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Received SIGINT. Graceful shutdown...');
    SchedulerService.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Graceful shutdown...');
    SchedulerService.stop();
    process.exit(0);
});
