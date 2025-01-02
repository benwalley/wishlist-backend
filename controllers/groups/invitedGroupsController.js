const models = require('../../models');
const GroupService = require('../../services/GroupService');

exports.getCurrentGroups = async (req, res) => {
    // Passport populates req.user with the authenticated user
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }
    const id = req.user?.id;
    const groupList = await GroupService.getGroupsByInvited(id)
    res.json(groupList);
};
