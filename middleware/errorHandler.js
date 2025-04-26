const { Sequelize } = require('sequelize');

/**
 * Custom API error class with additional properties
 */
class ApiError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = options.status || 500;
        this.errorType = options.errorType || 'SERVER_ERROR';
        this.publicMessage = options.publicMessage || 'An error occurred';
    }
}

const errorHandler = (err, req, res, next) => {
    console.error('An error occurred:', err);

    // Handle Sequelize validation errors
    if (err instanceof Sequelize.ValidationError) {
        return res.status(400).json({
            error: 'Validation error',
            errorType: 'VALIDATION_ERROR',
            details: err.errors.map((e) => e.message),
        });
    }

    // Handle our custom API errors
    if (err instanceof ApiError) {
        return res.status(err.status).json({
            error: err.message,
            errorType: err.errorType,
            publicMessage: err.publicMessage
        });
    }

    // Handle errors that have a status already set
    if (err.status) {
        return res.status(err.status).json({
            error: err.message,
            errorType: err.errorType || 'API_ERROR',
            publicMessage: err.publicMessage || err.message
        });
    }

    // Default error response for unhandled errors
    res.status(500).json({
        error: 'An internal server error occurred',
        errorType: 'SERVER_ERROR',
        publicMessage: 'An internal server error occurred. Please try again later.'
    });
};

module.exports = { errorHandler, ApiError };