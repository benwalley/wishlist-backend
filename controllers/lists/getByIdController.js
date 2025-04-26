const ListService = require('../../services/listService');

exports.getById = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated.' 
            });
        }

        const userId = req.user.id;
        const { id: listId } = req.params;
        const result = await ListService.getListById(listId, userId);
        
        if (!result.success) {
            return res.status(404).json(result);
        }
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching List by ID:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};
