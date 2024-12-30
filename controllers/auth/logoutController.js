const models = require('../../models');


exports.logout = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required.' });
        }

        // Delete the refresh token from the database
        await models.RefreshToken.destroy({ where: { token: refreshToken } });

        res.json({ message: 'User logged out successfully.', success: true});
    } catch (error) {
        console.error('Error during logout:', error);
        next(error);
    }
};
