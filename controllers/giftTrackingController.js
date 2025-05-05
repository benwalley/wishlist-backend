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
        next(error);
    }
}

module.exports = {
    getTrackedGifts
};
