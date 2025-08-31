const NotificationService = require('../services/notificationService');

/**
 * Get all notifications
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getNotifications = async (req, res) => {
    try {
        const {
            unreadOnly = true,
            notificationType = null,
            limit = 50,
            offset = 0
        } = req.query;

        const result = await NotificationService.getAllNotifications({
            userId: req.user.id, // Filter notifications for the current user
            unreadOnly: true, // Always filter to unread only
            notificationType: notificationType || null,
            limit: parseInt(limit) || 50,
            offset: parseInt(offset) || 0
        });

        return res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error in getNotifications:', error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.publicMessage || 'Failed to get notifications'
        });
    }
};

/**
 * Get unread notification count
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getUnreadCount = async (req, res) => {
    try {
        const count = await NotificationService.getUnreadCount(req.user.id);

        return res.json({
            success: true,
            unreadCount: count
        });
    } catch (error) {
        console.error('Error in getUnreadCount:', error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.publicMessage || 'Failed to get unread count'
        });
    }
};

/**
 * Mark a notification as read
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.markAsRead = async (req, res) => {
    try {
        const notificationId = req.params.id;

        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: 'Notification ID is required'
            });
        }

        const notification = await NotificationService.markAsRead(parseInt(notificationId));

        return res.json({
            success: true,
            message: 'Notification marked as read',
            data: notification
        });
    } catch (error) {
        console.error('Error in markAsRead:', error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.publicMessage || 'Failed to mark notification as read'
        });
    }
};

/**
 * Mark all notifications as read
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.markAllAsRead = async (req, res) => {
    try {
        const updatedCount = await NotificationService.markAllAsRead(req.user.id);

        return res.json({
            success: true,
            message: `Marked ${updatedCount} notifications as read`,
            updatedCount
        });
    } catch (error) {
        console.error('Error in markAllAsRead:', error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.publicMessage || 'Failed to mark all notifications as read'
        });
    }
};

/**
 * Delete a notification
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deleteNotification = async (req, res) => {
    try {
        const notificationId = req.params.id;

        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: 'Notification ID is required'
            });
        }

        await NotificationService.deleteNotification(parseInt(notificationId));

        return res.json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        console.error('Error in deleteNotification:', error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.publicMessage || 'Failed to delete notification'
        });
    }
};

/**
 * Create a notification (mainly for testing - in production this will be called internally)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.createNotification = async (req, res) => {
    try {
        const { message, notificationType, metadata, userId } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        const notification = await NotificationService.createNotification({
            message,
            notificationType: notificationType || 'general',
            metadata: metadata || null,
            userId: userId || null // Allow targeting specific users or creating global notifications
        });

        return res.status(201).json({
            success: true,
            message: 'Notification created successfully',
            data: notification
        });
    } catch (error) {
        console.error('Error in createNotification:', error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.publicMessage || 'Failed to create notification'
        });
    }
};