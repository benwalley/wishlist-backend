const ListItemService = require('../../services/listItemService');

exports.delete = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedItem = await ListItemService.deleteItem(id);
        res.status(200).json(deletedItem);
    } catch (error) {
        console.error('Error deleting ListItem:', error);
        res.status(400).json({ error: error.message });
    }
};
