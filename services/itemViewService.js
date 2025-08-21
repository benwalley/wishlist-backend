const { ItemView } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const PermissionService = require('./permissionService');

class ItemViewService {
    /**
     * Mark multiple items as viewed by a user
     * @param {number} userId - ID of the user
     * @param {Array<number>} itemIds - Array of item IDs to mark as viewed
     * @returns {Promise<Object>} - Result with count of items marked
     */
    static async markItemsAsViewed(userId, itemIds) {
        try {
            if (!userId || !Array.isArray(itemIds) || itemIds.length === 0) {
                throw new ApiError('User ID and item IDs array are required', {
                    status: 400,
                    errorType: 'VALIDATION_ERROR',
                    publicMessage: 'User ID and item IDs are required'
                });
            }

            // Create bulk rows for insertion
            const bulkRows = itemIds.map(item_id => ({
                user_id: userId,
                item_id: item_id
            }));

            // Bulk create with ignore duplicates
            const result = await ItemView.bulkCreate(bulkRows, {
                ignoreDuplicates: true
            });

            return {
                success: true,
                markedCount: result.length,
                totalRequested: itemIds.length
            };
        } catch (error) {
            console.error('Error marking items as viewed:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to mark items as viewed', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to mark items as viewed. Please try again.'
            });
        }
    }

    /**
     * Check if a user has seen a specific item
     * @param {number} userId - ID of the user
     * @param {number} itemId - ID of the item
     * @returns {Promise<boolean>} - Whether the user has seen the item
     */
    static async hasUserSeenItem(userId, itemId) {
        try {
            const view = await ItemView.findByPk({
                user_id: userId,
                item_id: itemId
            });

            return !!view;
        } catch (error) {
            console.error('Error checking if user has seen item:', error);
            return false;
        }
    }

    /**
     * Get all item IDs viewed by a user
     * @param {number} userId - ID of the user
     * @returns {Promise<Array>} - Array of item IDs
     */
    static async getUserViewedItems(userId) {
        try {
            const viewedItems = await ItemView.findAll({
                where: {
                    user_id: userId
                },
                attributes: ['item_id'],
                order: [['viewed_at', 'DESC']]
            });

            return viewedItems.map(view => view.item_id);
        } catch (error) {
            console.error('Error fetching user viewed items:', error);
            throw new ApiError('Failed to fetch viewed items', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to fetch viewed items. Please try again.'
            });
        }
    }

    /**
     * Get all users who have viewed a specific item
     * @param {number} itemId - ID of the item
     * @param {Object} options - Query options (limit, offset, etc.)
     * @returns {Promise<Array>} - Array of users who viewed the item
     */
    static async getItemViewers(itemId, options = {}) {
        try {
            const {
                limit = 100,
                offset = 0,
                orderBy = 'viewed_at',
                order = 'DESC'
            } = options;

            const viewers = await ItemView.findAll({
                where: {
                    item_id: itemId
                },
                order: [[orderBy, order]],
                limit,
                offset
            });

            return viewers;
        } catch (error) {
            console.error('Error fetching item viewers:', error);
            throw new ApiError('Failed to fetch item viewers', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to fetch item viewers. Please try again.'
            });
        }
    }

    /**
     * Get view count for a specific item
     * @param {number} itemId - ID of the item
     * @returns {Promise<number>} - Number of unique users who viewed the item
     */
    static async getItemViewCount(itemId) {
        try {
            const count = await ItemView.count({
                where: {
                    item_id: itemId
                }
            });

            return count;
        } catch (error) {
            console.error('Error getting item view count:', error);
            return 0;
        }
    }

    /**
     * Get view counts for multiple items
     * @param {Array<number>} itemIds - Array of item IDs
     * @returns {Promise<Object>} - Object with itemId as key and count as value
     */
    static async getBulkItemViewCounts(itemIds) {
        try {
            if (!Array.isArray(itemIds) || itemIds.length === 0) {
                return {};
            }

            const { QueryTypes } = require('sequelize');
            const { sequelize } = require('../models');

            const results = await sequelize.query(`
                SELECT item_id, COUNT(*) as view_count
                FROM item_views
                WHERE item_id IN (:itemIds)
                GROUP BY item_id
            `, {
                replacements: { itemIds },
                type: QueryTypes.SELECT
            });

            // Convert to object with itemId as key
            const viewCounts = {};
            results.forEach(result => {
                viewCounts[result.item_id] = parseInt(result.view_count);
            });

            // Ensure all requested items have a count (0 if not viewed)
            itemIds.forEach(itemId => {
                if (!(itemId in viewCounts)) {
                    viewCounts[itemId] = 0;
                }
            });

            return viewCounts;
        } catch (error) {
            console.error('Error getting bulk item view counts:', error);
            return {};
        }
    }

    /**
     * Check which items from a list the user has seen
     * @param {number} userId - ID of the user
     * @param {Array<number>} itemIds - Array of item IDs to check
     * @returns {Promise<Array>} - Array of item IDs the user has seen
     */
    static async getUserSeenItemsFromList(userId, itemIds) {
        try {
            if (!Array.isArray(itemIds) || itemIds.length === 0) {
                return [];
            }

            const seenViews = await ItemView.findAll({
                where: {
                    user_id: userId,
                    item_id: itemIds
                },
                attributes: ['item_id']
            });

            return seenViews.map(view => view.item_id);
        } catch (error) {
            console.error('Error checking user seen items from list:', error);
            return [];
        }
    }

    /**
     * Get count of unviewed items in a specific list for a user
     * @param {number} userId - ID of the user
     * @param {number} listId - ID of the list
     * @returns {Promise<number>} - Number of unviewed items in the list
     */
    static async getUnviewedItemsCountForList(userId, listId) {
        try {
            const { ListItem, ItemView } = require('../models');
            const { Op } = require('sequelize');

            // Check if user has access to the list (for matchListVisibility logic)
            const listAccess = await PermissionService.canUserAccessList(userId, listId);
            const hasListAccess = listAccess.canAccess;

            // Get all items in the list that are not deleted
            const itemsInList = await ListItem.findAll({
                where: {
                    lists: {
                        [Op.contains]: [listId]
                    },
                    deleted: false
                }
            });

            // Get all item views for this user
            const viewedItemIds = await ItemView.findAll({
                where: {
                    user_id: userId
                },
                attributes: ['item_id']
            }).then(views => views.map(view => view.dataValues.item_id));

            // Filter items that user can view and hasn't viewed yet
            let unviewedCount = 0;
            for (const item of itemsInList) {
                // Skip if user has already viewed this item
                if (viewedItemIds.includes(item.id)) {
                    continue;
                }

                // Use existing permission logic to check if user can view the item
                if (PermissionService.canUserViewItem(item, userId, hasListAccess)) {
                    unviewedCount++;
                }
            }

            return unviewedCount;
        } catch (error) {
            console.error('Error getting unviewed items count for list:', error);
            return 0;
        }
    }
}

module.exports = ItemViewService;