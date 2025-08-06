const cron = require('node-cron');
const ListItemService = require('./listItemService');
const NotificationService = require('./notificationService');

class SchedulerService {
    static scheduledTasks = [];

    /**
     * Initialize all scheduled tasks
     */
    static init() {
        try {
            // Check if scheduler is enabled via environment variable
            const schedulerEnabled = process.env.SCHEDULER_ENABLED !== 'false';
            
            if (!schedulerEnabled) {
                console.log('Scheduler is disabled via SCHEDULER_ENABLED environment variable');
                return;
            }

            console.log('Initializing scheduled tasks...');
            
            // Initialize daily cleanup task
            this.initDailyCleanup();
            
            // Initialize weekly notification cleanup
            this.initNotificationCleanup();
            
            console.log('Scheduled tasks initialized successfully');
        } catch (error) {
            console.error('Error initializing scheduler:', error);
        }
    }

    /**
     * Initialize daily cleanup task for expired list items
     */
    static initDailyCleanup() {
        // Get cleanup schedule from environment variable or default to 2 AM daily
        const cleanupSchedule = process.env.CLEANUP_SCHEDULE || '0 2 * * *';
        
        console.log(`Setting up daily cleanup task with schedule: ${cleanupSchedule}`);
        
        // Schedule the task
        const task = cron.schedule(cleanupSchedule, async () => {
            console.log('Running daily cleanup task for expired list items...');
            try {
                const cleanedCount = await ListItemService.cleanupExpiredItems();
                console.log(`Daily cleanup completed successfully. ${cleanedCount} items cleaned up.`);
            } catch (error) {
                console.error('Error during daily cleanup:', error);
            }
        }, {
            scheduled: true,
            timezone: process.env.CLEANUP_TIMEZONE || 'America/New_York'
        });

        this.scheduledTasks.push({
            name: 'dailyCleanup',
            task: task,
            schedule: cleanupSchedule
        });

        console.log('Daily cleanup task scheduled successfully');
    }

    /**
     * Initialize weekly notification cleanup task
     */
    static initNotificationCleanup() {
        // Get notification cleanup schedule from environment variable or default to weekly on Sunday at 3 AM
        const notificationCleanupSchedule = process.env.NOTIFICATION_CLEANUP_SCHEDULE || '0 3 * * 0';
        const notificationRetentionDays = parseInt(process.env.NOTIFICATION_RETENTION_DAYS) || 30;
        
        console.log(`Setting up notification cleanup task with schedule: ${notificationCleanupSchedule}`);
        console.log(`Notifications will be deleted after ${notificationRetentionDays} days`);
        
        // Schedule the task
        const task = cron.schedule(notificationCleanupSchedule, async () => {
            console.log('Running notification cleanup task...');
            try {
                const cleanedCount = await NotificationService.cleanupOldNotifications(notificationRetentionDays);
                console.log(`Notification cleanup completed successfully. ${cleanedCount} notifications cleaned up.`);
            } catch (error) {
                console.error('Error during notification cleanup:', error);
            }
        }, {
            scheduled: true,
            timezone: process.env.CLEANUP_TIMEZONE || 'America/New_York'
        });

        this.scheduledTasks.push({
            name: 'notificationCleanup',
            task: task,
            schedule: notificationCleanupSchedule
        });

        console.log('Notification cleanup task scheduled successfully');
    }

    /**
     * Manually trigger the cleanup task (useful for testing)
     */
    static async triggerCleanup() {
        try {
            console.log('Manually triggering cleanup task...');
            const cleanedCount = await ListItemService.cleanupExpiredItems();
            console.log(`Manual cleanup completed successfully. ${cleanedCount} items cleaned up.`);
            return cleanedCount;
        } catch (error) {
            console.error('Error during manual cleanup:', error);
            throw error;
        }
    }

    /**
     * Stop all scheduled tasks
     */
    static stop() {
        console.log('Stopping all scheduled tasks...');
        this.scheduledTasks.forEach(({ name, task }) => {
            task.stop();
            console.log(`Stopped task: ${name}`);
        });
        this.scheduledTasks = [];
        console.log('All scheduled tasks stopped');
    }

    /**
     * Get status of all scheduled tasks
     */
    static getStatus() {
        return this.scheduledTasks.map(({ name, schedule, task }) => ({
            name,
            schedule,
            running: task.running
        }));
    }
}

module.exports = SchedulerService;