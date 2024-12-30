const models = require('../../models');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your_refresh_token_secret';

exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required.' });
        }

        // Check if the refresh token exists in the database
        const storedToken = await models.RefreshToken.findOne({ where: { token: refreshToken } });
        if (!storedToken) {
            return res.status(403).json({ error: 'Invalid refresh token.' });
        }

        // Verify the refresh token
        jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, async (err, decoded) => {
            if (err) {
                return res.status(403).json({ error: 'Invalid or expired refresh token.' });
            }

            // Issue a new access token
            const newAccessToken = jwt.sign({ id: decoded.id }, JWT_SECRET, { expiresIn: '1h' });

            res.json({ jwtToken: newAccessToken });
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
        next(error);
    }
};
