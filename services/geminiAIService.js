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
        const maxHtmlLength = 1000000;
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
                maxTokens: 500000,
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
            // Handle different image types with AI-enhanced prompts
            if (imageType === 'abstract') {
                if (prompt && prompt.trim().length > 0) {
                    // Use chat AI to generate abstract version of the user's prompt
                    const enhancementQuery = `You are an expert abstract art prompt generator. The user will provide a concept, theme, or feeling. Expand their input into a full prompt for generating a beautiful abstract image.

The final prompt should:
- Emphasize abstract qualities (shapes, textures, patterns, gradients, surreal forms)
- Suggest a mood or emotional atmosphere
- Recommend a color palette
- Indicate style inspirations (digital painting, fractals, flowing geometry, cosmic surrealism, etc.)
- Make the image highly detailed, visually striking, and immersive

Format your answer as a single polished prompt, without extra commentary.
The user input is: ${prompt.trim()}`;

                    const aiResponse = await this.generateResponse(enhancementQuery, { maxTokens: 5000, temperature: 0.8 });
                    finalPrompt = aiResponse.response;
                } else {
                    // Generate pure abstract art with enhanced variety and artistic quality
                    const abstractPrompts = [
                        "Dynamic abstract expressionism with bold gestural brushstrokes, intense color contrasts, raw emotional energy, Jackson Pollock inspired drip painting style",
                        "Minimalist geometric abstraction featuring perfect golden ratio proportions, subtle color gradients from deep navy to silver, clean modern composition",
                        "Fluid organic abstract forms flowing like liquid mercury, iridescent color shifts from purple to gold, smooth ethereal transitions, contemporary digital art",
                        "Bold color field painting with massive blocks of saturated hues, Mark Rothko inspired composition, deep emotional resonance through pure color",
                        "Intricate mandala-style abstract pattern with sacred geometry, fractal elements, cosmic color palette of deep blues and luminous whites",
                        "Abstract landscape interpretation with sweeping horizontal forms, atmospheric color washes, impressionistic technique, serene natural harmony",
                        "Cubist-inspired abstract composition with fragmented geometric shapes, multiple perspectives, sophisticated earth tone palette with metallic accents",
                        "Surreal abstract dreamscape with floating organic forms, impossible architecture, vibrant psychedelic colors blending into infinity",
                        "Textural abstract art with heavy impasto technique, sculptural paint application, monochromatic color scheme with dramatic light and shadow",
                        "Neo-constructivist abstract design with precise geometric intersections, primary color palette, bold graphic elements, modernist aesthetic",
                        "Abstract representation of music visualization, flowing sound waves, rhythmic patterns, synesthetic color harmonies dancing across canvas",
                        "Biomorphic abstract forms suggesting cellular structures, microscopic beauty, organic growth patterns, scientific artistry with jewel tones"
                    ];
                    finalPrompt = abstractPrompts[Math.floor(Math.random() * abstractPrompts.length)];
                }
            } else if (imageType === 'animal') {
                if (prompt && prompt.trim().length > 0) {
                    // Use chat AI to generate cute/adorable version of the user's prompt
                    const enhancementQuery = `You are an expert at creating adorable image prompts with kawaii/cute styling. The user will provide a concept, object, character, or theme. Transform their input into a detailed prompt for generating a cute, loveable image using adorable styling.

The final prompt should:
- Emphasize adorable qualities (big expressive eyes, soft features, cute proportions)
- Include kawaii or cute styling elements
- Suggest warm, soft lighting and cozy atmosphere
- Recommend soft textures and heartwarming expressions
- Make the subject charming, loveable, and endearing
- Include specific visual details that enhance cuteness
- Keep the original concept but make it adorable (don't force it to be an animal unless the user specifically mentioned animals)

Format your answer as a single polished prompt, without extra commentary.
The user input is: ${prompt.trim()}`;

                    const aiResponse = await this.generateResponse(enhancementQuery, { maxTokens: 5000, temperature: 0.8 });
                    finalPrompt = aiResponse.response;
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

            // Handle custom image type with AI enhancement
            if (imageType === 'custom') {
                // Use chat AI to enhance the custom prompt
                const enhancementQuery = `You are an expert image prompt generator. The user will provide a concept or description. Transform their input into a detailed, vivid prompt for generating a high-quality, visually appealing image.

The final prompt should:
- Add specific visual details, lighting, and composition
- Suggest artistic style and technique
- Include atmospheric and mood elements
- Make the description more vivid and immersive
- Enhance the visual appeal while keeping the core concept intact
- Be suitable for AI image generation

Format your answer as a single polished prompt, without extra commentary.
The user input is: ${prompt.trim()}`;

                const aiResponse = await this.generateResponse(enhancementQuery, { maxTokens: 5000, temperature: 0.7 });
                finalPrompt = aiResponse.response;
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
                const responseText = await response.text();
                console.error(`Gemini API Error - Status: ${response.status}, Response: ${responseText}`);

                const errorData = await response.json().catch(() => ({ rawResponse: responseText }));
                throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorData.error?.message || 'Error translating server response to JSON'}`);
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
