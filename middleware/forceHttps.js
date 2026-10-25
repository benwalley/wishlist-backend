/**
 * Redirects HTTP requests to HTTPS in production.
 * Heroku terminates SSL at its router and passes the original protocol in
 * X-Forwarded-Proto, so this relies on `trust proxy` being set for req.secure.
 */
const forceHttps = (req, res, next) => {
    if (process.env.NODE_ENV !== 'production' || req.secure) {
        return next();
    }

    // 308 keeps the method and body, so POST/PUT requests aren't turned into GETs
    res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
};

module.exports = { forceHttps };
