const ListService = require('../../services/listService');

exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const updatedList = await ListService.updateList(id, updates);
        res.status(200).json(updatedList);
    } catch (error) {
        console.error('Error updating List:', error);
        res.status(400).json({ error: error.message });
    }
};