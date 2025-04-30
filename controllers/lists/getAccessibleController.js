const listService = require('../../services/listService');

/**
 * Get all lists that the current user has access to
 * (owned, shared directly with user, or shared with user's groups)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getAccessibleLists = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized: User ID not found'
            });
        }
        
        const result = await listService.getAllAccessibleLists(userId);
        
        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: result.message
            });
        }
        
        return res.status(200).json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error fetching accessible lists:', error);
        next(error);
    }
};