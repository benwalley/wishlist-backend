const ListItemService = require('../../services/listItemService');
const ListService = require('../../services/listService'); // Import the ListService


exports.create = async (req, res) => {
    try {
        // Ensure the user is authenticated
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated.' });
        }

        // Get the authenticated user's ID from PassportJS
        const createdById = req.user.id;

        // Merge the authenticated user's ID with the request body
        const data = {
            ...req.body,
            createdById,
        };

        console.log(data)
        // Create the ListItem
        const newItem = await ListItemService.createItem(data);

        res.status(201).json(newItem);
    } catch (error) {
        console.error('Error creating ListItem:', error);
        res.status(400).json({ error: error.message });
    }
};
