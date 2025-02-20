const models = require('../../models');
const { Op } = require('sequelize');

exports.getCurrentUser = async (req, res) => {
    // Passport populates req.user with the authenticated user
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    res.json(req.user);
};

exports.getYourUsers = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    try {
        const yourUsers = await models.User.findAll({
            where: {
                [Op.or]: [
                    { id: req.user.id },
                    { parentId: req.user.id }
                ]
            }
        });

        res.json(yourUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'An error occurred while fetching users.' });
    }
};
