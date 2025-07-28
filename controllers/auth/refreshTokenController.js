const UserService = require('../../services/userService');

exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required.' });
        }

        // Delegate to the service layer
        const tokens = await UserService.refreshTokens(refreshToken);

        return res.json(tokens);
    } catch (error) {
        console.error('Error refreshing token:', error);

        // Check for specific errors and set the appropriate status code
        if (error.message === 'Invalid or expired refresh token.') {
            return res.status(403).json({ error: error.message });
        }

        next(error);
    }
};
