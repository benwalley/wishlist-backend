const GiftTrackingService = require('../services/giftTrackingService');

// Controller for handling gift tracking routes
async function getTrackedGifts(req, res, next) {
    try {
        // Get user ID from authenticated user
        const userId = req.user.id;

        // Call service to get tracked gifts
        const result = await GiftTrackingService.getTrackedGifts(userId);

        // Return successful response with tracked items
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error in getTrackedGifts controller:', error);

        // If error is already formatted by the service, pass it on
        if (error.statusCode || error.message) {
            next(error);
        } else {
            // Otherwise format it properly with the success structure
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve tracked gifts'
            });
        }
    }
}

/**
 * Save gift tracking information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function saveGiftTracking(req, res, next) {
    try {
        // Get user ID from authenticated user
        const purchaserId = req.user.id;

        // Get data from request body
        const { itemId, status, actualPrice } = req.body;

        if (!itemId) {
            return res.status(400).json({
                success: false,
                message: 'itemId is required'
            });
        }

        // Prepare data for service
        const trackingData = {
            itemId,
            purchaserId,
            status,
            actualPrice
        };

        // Call service to save gift tracking info
        const result = await GiftTrackingService.saveGiftTracking(trackingData);

        // Return successful response
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error in saveGiftTracking controller:', error);

        // If error is already formatted by the service, pass it on
        if (error.statusCode || error.message) {
            next(error);
        } else {
            // Otherwise format it properly with the success structure
            return res.status(500).json({
                success: false,
                message: 'Failed to save gift tracking information'
            });
        }
    }
}

/**
 * Get all items that the current user is getting (purchasing for others)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getItemsUserIsGetting(req, res, next) {
    try {
        const userId = req.user.id;

        const result = await GiftTrackingService.getItemsUserIsGetting(userId);

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error in getItemsUserIsGetting controller:', error);

        // If error is already formatted by the service, pass it on
        if (error.statusCode || error.message) {
            next(error);
        } else {
            // Otherwise format it properly with the success structure
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve items you are getting'
            });
        }
    }
}

/**
 * Bulk save gift tracking information for multiple items
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function bulkSaveGiftTracking(req, res, next) {
    try {
        const userId = req.user.id;
        const { changedItems = [], changedRecipients = [] } = req.body;

        if (!Array.isArray(changedItems) && !Array.isArray(changedRecipients)) {
            return res.status(400).json({
                success: false,
                message: 'Request body must contain changedItems and/or changedRecipients arrays'
            });
        }

        const result = await GiftTrackingService.bulkSaveGiftTracking({ changedItems, changedRecipients }, userId);

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error in bulkSaveGiftTracking controller:', error);

        // If error is already formatted by the service, pass it on
        if (error.statusCode || error.message) {
            next(error);
        } else {
            // Otherwise format it properly with the success structure
            return res.status(500).json({
                success: false,
                message: 'Failed to bulk save gift tracking information'
            });
        }
    }
}

/**
 * Get all users that are accessible to you and that you haven't gotten a gift for
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getUsersWithoutGifts(req, res, next) {
    try {
        const userId = req.user.id;

        const result = await GiftTrackingService.getUsersWithoutGifts(userId);

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error in getUsersWithoutGifts controller:', error);

        // If error is already formatted by the service, pass it on
        if (error.statusCode || error.message) {
            next(error);
        } else {
            // Otherwise format it properly with the success structure
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve users without gifts'
            });
        }
    }
}

/**
 * Bulk update getting records - create, update, or delete based on qty
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function bulkUpdateGetting(req, res, next) {
    try {
        const currentUserId = req.user.id;
        const gettingDataArray = req.body;

        if (!Array.isArray(gettingDataArray)) {
            return res.status(400).json({
                success: false,
                message: 'Request body must be an array of getting data objects'
            });
        }

        const result = await GiftTrackingService.bulkUpdateGetting(gettingDataArray, currentUserId);

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error in bulkUpdateGetting controller:', error);

        // If error is already formatted by the service, pass it on
        if (error.statusCode || error.message) {
            next(error);
        } else {
            // Otherwise format it properly with the success structure
            return res.status(500).json({
                success: false,
                message: 'Failed to bulk update getting records'
            });
        }
    }
}

/**
 * Bulk update go_in_on records - create or delete based on participation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function bulkUpdateGoInOn(req, res, next) {
    try {
        const currentUserId = req.user.id;
        const goInOnDataArray = req.body;

        if (!Array.isArray(goInOnDataArray)) {
            return res.status(400).json({
                success: false,
                message: 'Request body must be an array of go_in_on data objects'
            });
        }

        const result = await GiftTrackingService.bulkUpdateGoInOn(goInOnDataArray, currentUserId);

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error in bulkUpdateGoInOn controller:', error);

        // If error is already formatted by the service, pass it on
        if (error.statusCode || error.message) {
            next(error);
        } else {
            // Otherwise format it properly with the success structure
            return res.status(500).json({
                success: false,
                message: 'Failed to bulk update go_in_on records'
            });
        }
    }
}

module.exports = {
    getTrackedGifts,
    saveGiftTracking,
    getItemsUserIsGetting,
    bulkSaveGiftTracking,
    getUsersWithoutGifts,
    bulkUpdateGetting,
    bulkUpdateGoInOn
};
