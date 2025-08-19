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

    async parseItemData(htmlContent) {
        if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.trim().length === 0) {
            throw new ApiError('Invalid HTML content', {
                status: 400,
                errorType: 'INVALID_HTML',
                publicMessage: 'HTML content is required and must be a non-empty string'
            });
        }

        // Truncate HTML content if too long (Gemini has token limits)
        const maxHtmlLength = 500000;
        const truncatedHtml = htmlContent.length > maxHtmlLength ?
            htmlContent.substring(0, maxHtmlLength) + '...' :
            htmlContent;

        const prompt = `
Please analyze this HTML content and extract the following product/item information:
- name: The product or item name/title
- price: The price (include currency symbol if found, or null if not found)
- imageUrl: The main product image URL (full URL, or null if not found)
- linkLabel: A short label identifying the website/store (e.g., "Amazon", "eBay", "Walmart", "Target", etc.)

Return the response as a JSON object with exactly these fields: name, price, imageUrl, linkLabel.
If any field cannot be determined, use null for that field.

HTML Content:
${truncatedHtml}

Return only the JSON object, no additional text or explanation.`;

        try {
            const result = await this.generateResponse(prompt, {
                maxTokens: 50000,
                temperature: 0.1 // Lower temperature for more consistent JSON output
            });

            // Parse the JSON response
            let parsedData;
            try {
                // Clean the response to extract JSON
                const cleanResponse = result.response.trim();
                const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
                const jsonString = jsonMatch ? jsonMatch[0] : cleanResponse;

                parsedData = JSON.parse(jsonString);
            } catch (parseError) {
                console.error('Failed to parse JSON response:', result.response);
                throw new ApiError('Invalid JSON response from AI service', {
                    status: 500,
                    errorType: 'JSON_PARSE_ERROR',
                    publicMessage: 'Failed to parse item data from AI response'
                });
            }

            // Validate required fields exist
            const validatedData = {
                name: parsedData.name || null,
                price: parsedData.price || null,
                imageUrl: parsedData.imageUrl || null,
                linkLabel: parsedData.linkLabel || null
            };

            console.log('Successfully parsed item data:', validatedData);
            return validatedData;

        } catch (error) {
            console.error('Error parsing item data:', error);
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError('Failed to parse item data', {
                status: 500,
                errorType: 'ITEM_PARSE_ERROR',
                publicMessage: 'Failed to extract item data from page content'
            });
        }
    }

    async generateImage(prompt, imageType = 'custom', options = {}) {
        if (!this.apiKey) {
            throw new ApiError('AI service not configured', {
                status: 503,
                errorType: 'AI_NOT_CONFIGURED',
                publicMessage: 'AI service is not configured. Please contact administrator.'
            });
        }

        const startTime = Date.now();
        let finalPrompt = prompt;

        try {
            // Handle different image types
            if (imageType === 'abstract') {
                if (prompt && prompt.trim().length > 0) {
                    // Use user prompt with abstract styling enhancements
                    finalPrompt = `${prompt.trim()}, abstract art style, artistic composition, modern digital art, elegant flowing forms, sophisticated color palette, contemporary aesthetic`;
                } else {
                    // Use predefined random abstract prompts
                    const abstractPrompts = [
                        "Minimalist geometric abstract art with flowing curves and gradients in soft pastel colors, modern digital art style",
                        "Abstract watercolor splash with vibrant blues and purples, elegant artistic composition with smooth flowing forms",
                        "Elegant abstract pattern with golden ratio spirals, soft ambient lighting, contemporary art style with warm colors",
                        "Fluid abstract design with organic shapes in teal and coral colors, sophisticated modern art aesthetic",
                        "Abstract geometric composition with intersecting circles and triangles in muted earth tones, clean minimalist style",
                        "Dreamy abstract cloudscape with soft gradients from pink to purple, ethereal and calming atmosphere"
                    ];
                    finalPrompt = abstractPrompts[Math.floor(Math.random() * abstractPrompts.length)];
                }
            } else if (imageType === 'animal') {
                if (prompt && prompt.trim().length > 0) {
                    // Use user prompt with cute/kawaii styling enhancements
                    finalPrompt = `${prompt.trim()}, adorable and cute style, big expressive eyes, kawaii aesthetic, soft lighting, heartwarming expression, fluffy texture, charming and loveable`;
                } else {
                    // Use predefined random animal prompts
                    const animals = require('../data/animals');
                    const styles = ['kawaii style', 'cute cartoon style', 'adorable illustration', 'soft pastel art style'];
                    const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
                    const randomStyle = styles[Math.floor(Math.random() * styles.length)];
                    finalPrompt = `Adorable ${randomAnimal} with big expressive eyes, ${randomStyle}, soft lighting, heartwarming expression, fluffy texture`;
                }
            } else if (imageType === 'custom' && (!prompt || prompt.trim().length === 0)) {
                throw new ApiError('Custom image type requires a prompt', {
                    status: 400,
                    errorType: 'PROMPT_REQUIRED',
                    publicMessage: 'A prompt is required for custom image generation'
                });
            }

            // Preprocess prompt for natural language
            if (imageType === 'custom') {
                const cleanPrompt = prompt.trim().toLowerCase();
                if (cleanPrompt.startsWith('create an image of') ||
                    cleanPrompt.startsWith('generate an image of') ||
                    cleanPrompt.startsWith('make an image of')) {
                    finalPrompt = prompt.replace(/^(create an image of|generate an image of|make an image of)\s*/i, '');
                } else {
                    finalPrompt = prompt;
                }
            }

            // Set default options for image generation
            const defaultOptions = {
                numberOfImages: 1,
                aspectRatio: '1:1'
            };

            const mergedOptions = { ...defaultOptions, ...options };

            // Create a direct HTTP request to the Gemini REST API for Imagen
            const fetch = require('node-fetch');
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${this.apiKey}`;

            const requestBody = {
                instances: [
                    {
                        prompt: finalPrompt
                    }
                ],
                parameters: {
                    sampleCount: mergedOptions.numberOfImages || 1,
                    aspectRatio: mergedOptions.aspectRatio || '1:1'
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
            }

            const result = await response.json();
            
            // Extract image data from response
            if (!result.predictions || result.predictions.length === 0) {
                throw new Error('No images generated in response');
            }

            const prediction = result.predictions[0];
            const imageBytes = prediction.bytesBase64Encoded;

            if (!imageBytes) {
                throw new Error('No image data received from API');
            }

            const endTime = Date.now();
            const responseTimeMs = endTime - startTime;

            return {
                imageData: imageBytes, // base64 encoded image
                contentType: 'image/png',
                metadata: {
                    prompt: finalPrompt,
                    imageType,
                    model: 'imagen-4.0-fast-generate-001',
                    responseTimeMs,
                    generatedAt: new Date().toISOString()
                }
            };

        } catch (error) {
            const endTime = Date.now();
            const responseTimeMs = endTime - startTime;

            console.error('Error generating image:', error);

            if (error instanceof ApiError) {
                throw error;
            }

            throw new ApiError('Image generation failed', {
                status: 500,
                errorType: 'IMAGE_GENERATION_ERROR',
                publicMessage: 'Failed to generate image. Please try again.',
                metadata: {
                    response_time_ms: responseTimeMs,
                    original_error: error.message,
                    prompt: finalPrompt,
                    imageType
                }
            });
        }
    }
}

// Export singleton instance
module.exports = new GeminiAIService();
