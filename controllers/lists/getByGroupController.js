const listService = require('../../services/listService');

/**
 * Get all lists shared with a specific group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getListsByGroup = async (req, res, next) => {
    try {
        const { groupId } = req.params;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                message: 'Group ID is required'
            });
        }
        
        const userId = req.user.id;
        const result = await listService.getListsSharedWithGroup(groupId, userId);
        
        if (!result.success) {
            return res.status(result.message === 'Group not found' ? 404 : 403).json({
                success: false,
                message: result.message
            });
        }
        
        return res.status(200).json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error fetching lists by group:', error);
        next(error);
    }
};