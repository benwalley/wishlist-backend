const ItemViewService = require('../services/itemViewService');

class ItemViewController {
    /**
     * Mark multiple items as viewed by the authenticated user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware function
     */
    static async markItemsViewed(req, res, next) {
        try {
            const { itemIds } = req.body;
            const userId = req.user.id;

            // Validate input
            if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'itemIds array is required and must be non-empty'
                });
            }

            // Validate that all itemIds are numbers
            const invalidIds = itemIds.filter(id => typeof id !== 'number' || !Number.isInteger(id));
            if (invalidIds.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'All item IDs must be integers'
                });
            }

            const result = await ItemViewService.markItemsAsViewed(userId, itemIds);

            res.status(200).json({
                success: true,
                message: `Marked ${result.markedCount} items as viewed`,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get item IDs viewed by the authenticated user
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware function
     */
    static async getViewedItems(req, res, next) {
        try {
            const userId = req.user.id;
            const viewedItemIds = await ItemViewService.getUserViewedItems(userId);

            res.status(200).json({
                success: true,
                data: viewedItemIds
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get users who have viewed a specific item
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware function
     */
    static async getItemViewers(req, res, next) {
        try {
            const { id } = req.params;
            const itemId = parseInt(id);

            if (isNaN(itemId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid item ID'
                });
            }

            const {
                limit = 100,
                offset = 0,
                orderBy = 'viewed_at',
                order = 'DESC'
            } = req.query;

            // Convert string numbers to integers
            const options = {
                limit: parseInt(limit),
                offset: parseInt(offset),
                orderBy,
                order: order.toUpperCase()
            };

            // Validate limit and offset
            if (isNaN(options.limit) || options.limit < 1 || options.limit > 1000) {
                return res.status(400).json({
                    success: false,
                    message: 'Limit must be between 1 and 1000'
                });
            }

            if (isNaN(options.offset) || options.offset < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Offset must be 0 or greater'
                });
            }

            // Validate order
            if (!['ASC', 'DESC'].includes(options.order)) {
                return res.status(400).json({
                    success: false,
                    message: 'Order must be ASC or DESC'
                });
            }

            const viewers = await ItemViewService.getItemViewers(itemId, options);

            res.status(200).json({
                success: true,
                data: viewers,
                pagination: {
                    limit: options.limit,
                    offset: options.offset,
                    count: viewers.length
                }
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get view count for a specific item
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware function
     */
    static async getItemViewCount(req, res, next) {
        try {
            const { id } = req.params;
            const itemId = parseInt(id);

            if (isNaN(itemId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid item ID'
                });
            }

            const viewCount = await ItemViewService.getItemViewCount(itemId);

            res.status(200).json({
                success: true,
                data: {
                    itemId,
                    viewCount
                }
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Check if the authenticated user has seen a specific item
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware function
     */
    static async hasSeenItem(req, res, next) {
        try {
            const { id } = req.params;
            const itemId = parseInt(id);
            const userId = req.user.id;

            if (isNaN(itemId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid item ID'
                });
            }

            const hasSeen = await ItemViewService.hasUserSeenItem(userId, itemId);

            res.status(200).json({
                success: true,
                data: {
                    itemId,
                    userId,
                    hasSeen
                }
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Check which items from a list the user has seen
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware function
     */
    static async checkSeenItemsFromList(req, res, next) {
        try {
            const { itemIds } = req.body;
            const userId = req.user.id;

            // Validate input
            if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'itemIds array is required and must be non-empty'
                });
            }

            // Validate that all itemIds are numbers
            const invalidIds = itemIds.filter(id => typeof id !== 'number' || !Number.isInteger(id));
            if (invalidIds.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'All item IDs must be integers'
                });
            }

            const seenItemIds = await ItemViewService.getUserSeenItemsFromList(userId, itemIds);

            res.status(200).json({
                success: true,
                data: {
                    requestedIds: itemIds,
                    seenIds: seenItemIds,
                    seenCount: seenItemIds.length,
                    totalRequested: itemIds.length
                }
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = ItemViewController;