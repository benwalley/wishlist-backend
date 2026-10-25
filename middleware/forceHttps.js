/**
 * Redirects HTTP requests to HTTPS in production and sets HSTS on HTTPS responses.
 * Heroku terminates SSL at its router and passes the original protocol in
 * X-Forwarded-Proto, so this relies on `trust proxy` being set for req.secure.
 */
const forceHttps = (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
        return next();
    }

    if (req.secure) {
        // Browsers ignore HSTS sent over HTTP, so only set it on HTTPS responses
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        return next();
    }

    // 308 keeps the method and body, so POST/PUT requests aren't turned into GETs
    res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
};

module.exports = { forceHttps };
