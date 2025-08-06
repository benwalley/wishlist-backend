const { Notification } = require('../models');
const { Op } = require('sequelize');
const { ApiError } = require('../middleware/errorHandler');

class NotificationService {
    /**
     * Create a new notification
     * @param {Object} notificationData - { message, notificationType, metadata }
     * @returns {Promise<Object>} Created notification
     */
    static async createNotification({ message, notificationType = 'general', metadata = null }) {
        try {
            const notification = await Notification.create({
                message,
                notificationType,
                metadata,
                read: false
            });

            return notification;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw new ApiError('Failed to create notification', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to create notification'
            });
        }
    }

    /**
     * Get all notifications
     * @param {Object} filters - { unreadOnly, notificationType, limit, offset }
     * @returns {Promise<Object>} { notifications, total, unreadCount }
     */
    static async getAllNotifications({ unreadOnly = false, notificationType = null, limit = 50, offset = 0 } = {}) {
        try {
            const whereClause = {};
            
            if (unreadOnly) {
                whereClause.read = false;
            }
            
            if (notificationType) {
                whereClause.notificationType = notificationType;
            }

            const { count, rows: notifications } = await Notification.findAndCountAll({
                where: whereClause,
                order: [['createdAt', 'DESC']],
                limit: Math.min(limit, 100), // Cap at 100 to prevent abuse
                offset
            });

            // Get unread count separately
            const unreadCount = await Notification.count({
                where: {
                    read: false
                }
            });

            return {
                notifications,
                total: count,
                unreadCount,
                hasMore: (offset + limit) < count
            };
        } catch (error) {
            console.error('Error getting notifications:', error);
            throw new ApiError('Failed to get notifications', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve notifications'
            });
        }
    }

    /**
     * Mark a notification as read
     * @param {number} notificationId - Notification ID
     * @returns {Promise<Object>} Updated notification
     */
    static async markAsRead(notificationId) {
        try {
            const notification = await Notification.findByPk(notificationId);

            if (!notification) {
                throw new ApiError('Notification not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'Notification not found'
                });
            }

            if (notification.read) {
                return notification; // Already read, no need to update
            }

            await notification.update({ read: true });
            return notification;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            
            console.error('Error marking notification as read:', error);
            throw new ApiError('Failed to mark notification as read', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to update notification'
            });
        }
    }

    /**
     * Mark all notifications as read
     * @returns {Promise<number>} Number of notifications marked as read
     */
    static async markAllAsRead() {
        try {
            const [updatedCount] = await Notification.update(
                { read: true },
                {
                    where: {
                        read: false
                    }
                }
            );

            return updatedCount;
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            throw new ApiError('Failed to mark all notifications as read', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to update notifications'
            });
        }
    }

    /**
     * Delete a notification
     * @param {number} notificationId - Notification ID
     * @returns {Promise<boolean>} Success status
     */
    static async deleteNotification(notificationId) {
        try {
            const deletedCount = await Notification.destroy({
                where: {
                    id: notificationId
                }
            });

            if (deletedCount === 0) {
                throw new ApiError('Notification not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'Notification not found'
                });
            }

            return true;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            
            console.error('Error deleting notification:', error);
            throw new ApiError('Failed to delete notification', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to delete notification'
            });
        }
    }

    /**
     * Delete old notifications (cleanup function)
     * @param {number} daysOld - Delete notifications older than this many days
     * @returns {Promise<number>} Number of notifications deleted
     */
    static async cleanupOldNotifications(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const deletedCount = await Notification.destroy({
                where: {
                    createdAt: {
                        [Op.lt]: cutoffDate
                    },
                    read: true // Only delete read notifications
                }
            });

            console.log(`Cleaned up ${deletedCount} old notifications (older than ${daysOld} days)`);
            return deletedCount;
        } catch (error) {
            console.error('Error cleaning up old notifications:', error);
            throw new ApiError('Failed to cleanup old notifications', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to cleanup notifications'
            });
        }
    }

    /**
     * Get unread notification count
     * @returns {Promise<number>} Unread count
     */
    static async getUnreadCount() {
        try {
            const count = await Notification.count({
                where: {
                    read: false
                }
            });

            return count;
        } catch (error) {
            console.error('Error getting unread count:', error);
            throw new ApiError('Failed to get unread count', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to get notification count'
            });
        }
    }

    /**
     * Bulk create notifications
     * @param {Array} notifications - Array of { message, notificationType, metadata }
     * @returns {Promise<Array>} Created notifications
     */
    static async createBulkNotifications(notifications) {
        try {
            if (!notifications || notifications.length === 0) {
                throw new ApiError('No notifications provided', {
                    status: 400,
                    errorType: 'VALIDATION_ERROR',
                    publicMessage: 'No notifications provided'
                });
            }

            const createdNotifications = await Notification.bulkCreate(
                notifications.map(n => ({
                    message: n.message,
                    notificationType: n.notificationType || 'general',
                    metadata: n.metadata || null,
                    read: false
                }))
            );

            return createdNotifications;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            
            console.error('Error creating bulk notifications:', error);
            throw new ApiError('Failed to create bulk notifications', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to create notifications'
            });
        }
    }
}

module.exports = NotificationService;