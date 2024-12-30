const { Sequelize } = require('sequelize');

const errorHandler = (err, req, res, next) => {
    console.error('An error occurred:', err);

    if (err instanceof Sequelize.ValidationError) {
        return res.status(400).json({
            error: 'Validation error',
            details: err.errors.map((e) => e.message),
        });
    }

    if (err.status) {
        return res.status(err.status).json({ error: err.message });
    }

    res.status(500).json({ error: 'An internal server error occurred. Please try again later.' });
};

module.exports = errorHandler;
