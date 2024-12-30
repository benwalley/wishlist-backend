const models = require('../../models');

exports.getCurrentUser = async (req, res) => {
    // Passport populates req.user with the authenticated user
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    res.json(req.user);
};
