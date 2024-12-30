// middleware/requireAuth.js
const passport = require('passport');

module.exports = function requireAuth(req, res, next) {
    // Use passport's JWT strategy as a middleware
    return passport.authenticate('jwt', { session: false })(req, res, next);
};
