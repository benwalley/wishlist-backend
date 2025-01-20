const ListService = require('../../services/listService');

exports.getById = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'User not authenticated.' });
        }

        const userId = req.user.id;
        const { id: listId } = req.params;
        const item = await ListService.getListById(listId, userId);
        res.status(200).json(item);
    } catch (error) {
        console.error('Error fetching List by ID:', error);
        res.status(404).json({ error: error.message });
    }
};
