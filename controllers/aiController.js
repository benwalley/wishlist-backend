const geminiAIService = require('../services/geminiAIService');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Generate AI response from a query
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.generate = async (req, res, next) => {
    try {
        const { query, options } = req.body;
        const userId = req.user.id;

        // Validate request
        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Query is required'
            });
        }

        if (typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Query must be a non-empty string'
            });
        }

        // Check if AI service is available
        const isAvailable = await geminiAIService.isServiceAvailable();
        if (!isAvailable) {
            const status = geminiAIService.getServiceStatus();
            return res.status(503).json({
                success: false,
                message: 'AI service is currently unavailable',
                error: {
                    type: 'SERVICE_UNAVAILABLE',
                    details: `AI service configuration: ${JSON.stringify(status)}`
                }
            });
        }

        console.log(`Generating AI response for user ${userId}, query length: ${query.length}`);

        // Generate AI response
        const aiResult = await geminiAIService.generateResponse(query, options);

        // Log successful generation
        console.log(`AI response generated successfully for user ${userId}, tokens used: ${aiResult.tokens_used}, response time: ${aiResult.response_time_ms}ms`);

        res.status(200).json({
            success: true,
            message: 'AI response generated successfully',
            data: {
                response: aiResult.response,
                model: aiResult.model,
                tokens_used: aiResult.tokens_used,
                response_time_ms: aiResult.response_time_ms,
                metadata: aiResult.metadata
            }
        });

    } catch (error) {
        console.error('Error in AI generate controller:', error);
        next(error);
    }
};

/**
 * Get AI service status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.status = async (req, res, next) => {
    try {
        const status = geminiAIService.getServiceStatus();
        const isAvailable = await geminiAIService.isServiceAvailable();

        res.status(200).json({
            success: true,
            message: 'AI service status retrieved',
            data: {
                available: isAvailable,
                ...status
            }
        });

    } catch (error) {
        console.error('Error getting AI service status:', error);
        next(error);
    }
};