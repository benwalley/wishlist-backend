const ListItemService = require('../../services/listItemService');

exports.getById = async (req, res) => {
    try {
        const { id } = req.params;
        const item = await ListItemService.getItemById(id);
        res.status(200).json(item);
        // TODO: add authorization
    } catch (error) {
        console.error('Error fetching ListItem by ID:', error);
        res.status(404).json({ error: error.message });
    }
};
