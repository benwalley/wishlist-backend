const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ApiError } = require('../middleware/errorHandler');

class GeminiAIService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = process.env.GEMINI_MODEL || 'gemini-pro';
        this.genAI = null;
        this.modelInstance = null;
        
        if (!this.apiKey) {
            console.warn('GEMINI_API_KEY not found in environment variables. AI service will not be available.');
        } else {
            this.initialize();
        }
    }

    initialize() {
        try {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            this.modelInstance = this.genAI.getGenerativeModel({ model: this.model });
        } catch (error) {
            console.error('Error initializing Gemini AI:', error);
            throw new ApiError('Failed to initialize AI service', {
                status: 500,
                errorType: 'AI_INIT_ERROR',
                publicMessage: 'AI service is currently unavailable'
            });
        }
    }

    async generateResponse(query, options = {}) {
        if (!this.apiKey) {
            throw new ApiError('AI service not configured', {
                status: 503,
                errorType: 'AI_NOT_CONFIGURED',
                publicMessage: 'AI service is not configured. Please contact administrator.'
            });
        }

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            throw new ApiError('Invalid query', {
                status: 400,
                errorType: 'INVALID_QUERY',
                publicMessage: 'Query is required and must be a non-empty string'
            });
        }

        const startTime = Date.now();
        
        try {
            // Set default options
            const defaultOptions = {
                maxTokens: 1000,
                temperature: 0.7,
                topP: 0.95,
                topK: 64
            };
            
            const mergedOptions = { ...defaultOptions, ...options };
            
            // Generate content
            const result = await this.modelInstance.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{ text: query.trim() }]
                }],
                generationConfig: {
                    maxOutputTokens: mergedOptions.maxTokens,
                    temperature: mergedOptions.temperature,
                    topP: mergedOptions.topP,
                    topK: mergedOptions.topK
                }
            });

            const response = await result.response;
            
            // Debug logging for troubleshooting
            console.log('[GEMINI-AI] Response candidates:', response.candidates?.length || 0);
            console.log('[GEMINI-AI] Response usage:', response.usageMetadata);
            
            // Check if response was blocked by safety filters
            if (response.candidates && response.candidates.length > 0) {
                const candidate = response.candidates[0];
                if (candidate.finishReason === 'SAFETY') {
                    throw new ApiError('Content filtered by safety policies', {
                        status: 400,
                        errorType: 'CONTENT_FILTERED',
                        publicMessage: 'The content was filtered due to safety policies. Please try with different content.'
                    });
                }
                if (candidate.finishReason === 'RECITATION') {
                    throw new ApiError('Content blocked due to recitation', {
                        status: 400,
                        errorType: 'CONTENT_BLOCKED',
                        publicMessage: 'The content was blocked due to recitation policies.'
                    });
                }
            }
            
            const text = response.text();
            
            if (!text || text.trim().length === 0) {
                // Additional debug info for empty responses
                console.error('[GEMINI-AI] Empty response details:', {
                    candidates: response.candidates,
                    finishReason: response.candidates?.[0]?.finishReason,
                    safetyRatings: response.candidates?.[0]?.safetyRatings
                });
                
                throw new ApiError('Empty response from AI service', {
                    status: 500,
                    errorType: 'EMPTY_AI_RESPONSE',
                    publicMessage: 'AI service returned an empty response. This might be due to content filtering or model limitations.',
                    metadata: {
                        finishReason: response.candidates?.[0]?.finishReason,
                        candidatesCount: response.candidates?.length || 0
                    }
                });
            }

            const endTime = Date.now();
            const responseTimeMs = endTime - startTime;

            // Get token usage if available
            const usageMetadata = response.usageMetadata;
            const tokensUsed = usageMetadata ? 
                (usageMetadata.promptTokenCount + usageMetadata.candidatesTokenCount) : 
                null;

            return {
                response: text.trim(),
                model: this.model,
                tokens_used: tokensUsed,
                response_time_ms: responseTimeMs,
                metadata: {
                    prompt_tokens: usageMetadata?.promptTokenCount || null,
                    completion_tokens: usageMetadata?.candidatesTokenCount || null,
                    total_tokens: tokensUsed
                }
            };

        } catch (error) {
            const endTime = Date.now();
            const responseTimeMs = endTime - startTime;
            
            console.error('Error generating AI response:', error);
            
            // Handle specific Google AI errors
            if (error.message?.includes('API_KEY_INVALID')) {
                throw new ApiError('Invalid API key', {
                    status: 401,
                    errorType: 'INVALID_API_KEY',
                    publicMessage: 'AI service authentication failed'
                });
            }
            
            if (error.message?.includes('QUOTA_EXCEEDED') || error.message?.includes('rate limit')) {
                throw new ApiError('Rate limit exceeded', {
                    status: 429,
                    errorType: 'RATE_LIMIT_EXCEEDED',
                    publicMessage: 'AI service is temporarily unavailable due to high demand. Please try again later.'
                });
            }
            
            if (error.message?.includes('SAFETY')) {
                throw new ApiError('Content filtered', {
                    status: 400,
                    errorType: 'CONTENT_FILTERED',
                    publicMessage: 'The content was filtered due to safety policies. Please modify your query.'
                });
            }
            
            if (error instanceof ApiError) {
                throw error;
            }
            
            // Generic error for unexpected issues
            throw new ApiError('AI service error', {
                status: 500,
                errorType: 'AI_SERVICE_ERROR',
                publicMessage: 'Failed to generate AI response. Please try again.',
                metadata: {
                    response_time_ms: responseTimeMs,
                    original_error: error.message
                }
            });
        }
    }

    async isServiceAvailable() {
        return !!(this.apiKey && this.genAI && this.modelInstance);
    }

    getServiceStatus() {
        return {
            configured: !!this.apiKey,
            initialized: !!(this.genAI && this.modelInstance),
            model: this.model
        };
    }
}

// Export singleton instance
module.exports = new GeminiAIService();