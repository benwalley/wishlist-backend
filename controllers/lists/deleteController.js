const ListService = require('../../services/listService');

exports.delete = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'User not authenticated.' });
        }

        const { id } = req.params;
        const userId = req.user.id;

        if (!id) {
            return res.status(400).json({ success: false, message: 'List id is required.' });
        }

        const list = await ListService.getListById(id, userId);
        if (!list || !list.success) {
            return res.status(404).json({ success: false, message: 'List not found.' });
        }

        if (String(list.data.ownerId) !== String(userId)) {
            return res.status(403).json({ success: false, message: 'Only the list owner can delete this list.' });
        }

        const deletedItem = await ListService.deleteList(id);
        res.status(200).json({ success: true, data: deletedItem });
    } catch (error) {
        console.error('Error deleting List:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};
