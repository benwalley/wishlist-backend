const ListItemService = require('../../services/listItemService');

exports.getAll = async (req, res) => {
    try {
        const filter = req.query; // Use query params for filtering
        const items = await ListItemService.getAllItems(filter);
        res.status(200).json(items);
    } catch (error) {
        console.error('Error fetching ListItems:', error);
        res.status(400).json({ error: error.message });
    }
};
