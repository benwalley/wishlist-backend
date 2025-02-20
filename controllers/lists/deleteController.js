const ListService = require('../../services/listService');

exports.delete = async (req, res) => {
    try {
        // Ensure the user is authenticated
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated.' });
        }

        // Get the authenticated user's ID from PassportJS
        const ownerId = req.user.id;

        // Ensure an id is provided (assuming route: DELETE /list/:id)
        const { id } = req.params;
        console.log(id)
        if (!id) {
            return res.status(400).json({ error: 'List item id is required.' });
        }

        // Attempt to delete the ListItem
        const deletedItem = await ListService.deleteList(id);
        if (!deletedItem) {
            // If no item was found/deleted, respond with a 404 Not Found
            return res.status(404).json({ error: 'List item not found.' });
        }

        // Respond with the deleted item (or a success message if preferred)
        res.status(200).json(deletedItem);
    } catch (error) {
        console.error('Error deleting ListItem:', error);
        res.status(400).json({ error: error.message });
    }
};
