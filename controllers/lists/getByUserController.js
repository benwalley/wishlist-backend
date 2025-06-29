const ListService = require('../../services/listService');

exports.getByUser = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated.' 
            });
        }

        const currentUserId = req.user.id;
        const { userId: targetUserId } = req.params;

        if (!targetUserId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID is required.' 
            });
        }

        const result = await ListService.getListsByUserIdForCurrentUser(targetUserId, currentUserId);
        
        if (!result.success) {
            return res.status(400).json(result);
        }
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching lists by user ID:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};