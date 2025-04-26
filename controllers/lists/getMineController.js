const listService = require('../../services/listService');

class ListController {
    /**
     * Get all lists where the current user is the owner
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getListsByCurrentUser(req, res) {
        try {
            const userId = req.user?.id; // Assuming `req.user` holds the authenticated user info
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized: User ID not found' });
            }

            const lists = await listService.getAllListsWithOrphaned(userId);
            return res.status(200).json({
                success: true,
                data: lists
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = new ListController();
