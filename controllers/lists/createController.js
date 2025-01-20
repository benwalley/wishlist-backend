const ListService = require('../../services/listService');

exports.create = async (req, res) => {
    try {
        // Ensure the user is authenticated
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated.' });
        }

        // Get the authenticated user's ID from PassportJS
        const ownerId = req.user.id;

        // Merge the authenticated user's ID with the request body
        const data = {
            ...req.body,
            ownerId,
        };

        console.log(data)
        // Create the ListItem
        const newItem = await ListService.createList(data);
        res.status(201).json(newItem);
    } catch (error) {
        console.error('Error creating ListItem:', error);
        res.status(400).json({ error: error.message });
    }
};
