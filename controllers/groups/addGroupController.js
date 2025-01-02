const GroupService = require('../../services/GroupService');

exports.addGroup = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    try {
        // Add the user as the owner of the group
        const groupData = {
            ...req.body,
            ownerId: req.user.id,
        };

        // Use GroupService to create the group
        const newGroup = await GroupService.createGroup(groupData);

        res.status(201).json({
            success: true,
            message: 'Group created successfully.',
            data: newGroup,
        });
    } catch (error) {
        console.error(`Error creating group: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to create group. Please try again later.',
        });
    }
};
