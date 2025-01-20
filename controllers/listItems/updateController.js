const ListItemService = require('../../services/listItemService');

exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const updatedItem = await ListItemService.updateItem(id, updates);
        res.status(200).json(updatedItem);
    } catch (error) {
        console.error('Error updating ListItem:', error);
        res.status(400).json({ error: error.message });
    }
};
