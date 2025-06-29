const ListService = require('../../services/listService');

exports.update = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'User not authenticated.' });
        }

        const { id } = req.params;
        const updates = req.body;
        const userId = req.user.id;

        const list = await ListService.getListById(id, userId);
        if (!list || !list.success) {
            return res.status(404).json({ success: false, message: 'List not found.' });
        }

        if (String(list.data.ownerId) !== String(userId)) {
            return res.status(403).json({ success: false, message: 'Only the list owner can edit this list.' });
        }

        const updatedList = await ListService.updateList(id, updates);
        res.status(200).json({ success: true, data: updatedList });
    } catch (error) {
        console.error('Error updating List:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};