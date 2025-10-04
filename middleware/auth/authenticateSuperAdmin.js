// middleware/auth/authenticateSuperAdmin.js
const passport = require('passport');

module.exports = function authenticateSuperAdmin(req, res, next) {
    // First authenticate with JWT
    passport.authenticate('jwt', { session: false }, (err, user, info) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Authentication error.'
            });
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated.'
            });
        }

        // Check if user is a super admin
        if (!user.isSuperAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Super admin privileges required.'
            });
        }

        req.user = user;
        next();
    })(req, res, next);
};