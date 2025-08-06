const express = require('express');
const SchedulerService = require('../services/schedulerService');
const NotificationService = require('../services/notificationService');
const router = express.Router();

/**
 * Manually trigger cleanup task (for testing)
 * POST /api/admin/cleanup
 */
router.post('/cleanup', async (req, res) => {
    try {
        const cleanedCount = await SchedulerService.triggerCleanup();
        res.json({
            success: true,
            message: `Manual cleanup completed successfully`,
            itemsDeleted: cleanedCount
        });
    } catch (error) {
        console.error('Error during manual cleanup:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to run cleanup task'
        });
    }
});

/**
 * Get scheduler status
 * GET /api/admin/scheduler/status
 */
router.get('/scheduler/status', (req, res) => {
    try {
        const status = SchedulerService.getStatus();
        res.json({
            success: true,
            scheduledTasks: status
        });
    } catch (error) {
        console.error('Error getting scheduler status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get scheduler status'
        });
    }
});

/**
 * Manually trigger notification cleanup (for testing)
 * POST /api/admin/notification-cleanup
 */
router.post('/notification-cleanup', async (req, res) => {
    try {
        const daysOld = parseInt(req.body.daysOld) || 30;
        const cleanedCount = await NotificationService.cleanupOldNotifications(daysOld);
        res.json({
            success: true,
            message: `Notification cleanup completed successfully`,
            notificationsDeleted: cleanedCount,
            daysOld: daysOld
        });
    } catch (error) {
        console.error('Error during notification cleanup:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to run notification cleanup task'
        });
    }
});

module.exports = router;