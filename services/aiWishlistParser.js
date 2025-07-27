const geminiAIService = require('./geminiAIService');
const { ApiError } = require('../middleware/errorHandler');

class AIWishlistParser {
    constructor() {
        this.maxRetries = 3;
        this.maxHtmlLength = 2000000; // 2MB limit - well within Gemini's token capacity
    }

    async parseWishlistHTML(htmlContent, options = {}) {
        if (!htmlContent || typeof htmlContent !== 'string') {
            throw new ApiError('Invalid HTML content', {
                status: 400,
                errorType: 'INVALID_HTML',
                publicMessage: 'HTML content is required for AI parsing'
            });
        }

        // Truncate HTML if it's too long to avoid token limits
        const truncatedHTML = htmlContent.length > this.maxHtmlLength 
            ? htmlContent.substring(0, this.maxHtmlLength) + '...[truncated]'
            : htmlContent;

        const prompt = this.buildWishlistParsingPrompt(truncatedHTML, options);
        
        let lastError;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`[AI-PARSER] Attempt ${attempt}/${this.maxRetries} - Sending ${truncatedHTML.length} chars to Gemini AI...`);
                
                const aiResponse = await geminiAIService.generateResponse(prompt, {
                    maxTokens: 32000, // Increased for large wishlists - well within 65k limit
                    temperature: 0.1 // Low temperature for consistent structured output
                });

                console.log(`[AI-PARSER] ✅ AI response received (${aiResponse.tokens_used} tokens, ${aiResponse.response_time_ms}ms)`);
                console.log(`[AI-PARSER] Parsing AI response into structured data...`);

                const parsedData = this.parseAIResponse(aiResponse.response);
                
                console.log(`[AI-PARSER] ✅ Successfully parsed ${parsedData.length} items from AI response`);
                
                return {
                    items: parsedData,
                    aiMetadata: {
                        model: aiResponse.model,
                        tokens_used: aiResponse.tokens_used,
                        response_time_ms: aiResponse.response_time_ms,
                        attempt: attempt,
                        html_length: truncatedHTML.length
                    }
                };

            } catch (error) {
                lastError = error;
                console.error(`[AI-PARSER] ❌ Attempt ${attempt} failed: ${error.message}`);
                
                if (attempt === this.maxRetries) {
                    break;
                }
                
                // Wait before retry (exponential backoff)
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`[AI-PARSER] ⏳ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw new ApiError('AI parsing failed after retries', {
            status: 500,
            errorType: 'AI_PARSING_FAILED',
            publicMessage: 'Unable to parse wishlist content using AI. Please try again.',
            metadata: {
                attempts: this.maxRetries,
                lastError: lastError?.message
            }
        });
    }

    buildWishlistParsingPrompt(htmlContent, options = {}) {
        const requiredFields = options.fields || ['name', 'price', 'imageUrl', 'linkUrl'];
        
        return `You are an expert at parsing HTML content to extract product information from any website. Analyze the provided HTML and extract ALL product items that appear to be for sale or listed.

IMPORTANT INSTRUCTIONS:
1. Return ONLY a valid JSON array, no additional text or explanations
2. Each item must be a JSON object with these exact fields: ${requiredFields.join(', ')}
3. For price: extract only the number (e.g., "29.99"), no currency symbols or text
4. For imageUrl: use full HTTPS URLs, convert relative URLs to absolute URLs when possible
5. For linkUrl: use full product URLs when available, convert relative URLs to absolute when possible
6. If a field is missing or unclear, use null
7. Skip any items that don't appear to be actual products (like navigation, ads, etc.)
8. Look for common product indicators: titles, prices, images, product links
9. Products can be in various formats: grid layouts, list layouts, cards, etc.

Expected JSON format:
[
  {
    "name": "Product Name Here",
    "price": "29.99",
    "imageUrl": "https://example.com/images/product.jpg",
    "linkUrl": "https://example.com/product/123"
  }
]

HTML Content to analyze:
${htmlContent}

Return the JSON array now:`;
    }

    parseAIResponse(aiResponseText) {
        if (!aiResponseText || typeof aiResponseText !== 'string') {
            throw new ApiError('Empty AI response', {
                status: 500,
                errorType: 'EMPTY_AI_RESPONSE',
                publicMessage: 'AI service returned an empty response'
            });
        }

        try {
            // Clean the response - remove any text before/after JSON
            let cleanedResponse = aiResponseText.trim();
            
            // Find JSON array boundaries
            const arrayStart = cleanedResponse.indexOf('[');
            const arrayEnd = cleanedResponse.lastIndexOf(']') + 1;
            
            if (arrayStart === -1 || arrayEnd === 0) {
                throw new Error('No JSON array found in AI response');
            }
            
            cleanedResponse = cleanedResponse.substring(arrayStart, arrayEnd);
            
            const parsedData = JSON.parse(cleanedResponse);
            
            if (!Array.isArray(parsedData)) {
                throw new Error('AI response is not an array');
            }

            // Validate and clean each item
            const validItems = parsedData.map((item, index) => {
                return this.validateAndCleanItem(item, index);
            }).filter(item => item !== null);

            console.log(`AI parsing successful: extracted ${validItems.length} valid items from ${parsedData.length} AI results`);
            
            return validItems;

        } catch (error) {
            console.error('Error parsing AI response:', error.message);
            console.error('Raw AI response:', aiResponseText.substring(0, 500) + '...');
            
            throw new ApiError('Invalid AI response format', {
                status: 500,
                errorType: 'INVALID_AI_RESPONSE',
                publicMessage: 'AI service returned data in an unexpected format',
                metadata: {
                    parseError: error.message,
                    responsePreview: aiResponseText.substring(0, 200)
                }
            });
        }
    }

    validateAndCleanItem(item, index) {
        if (!item || typeof item !== 'object') {
            console.warn(`Item ${index} is not a valid object, skipping`);
            return null;
        }

        // Validate required fields
        if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
            console.warn(`Item ${index} has invalid name, skipping`);
            return null;
        }

        // Clean and validate price
        let price = null;
        if (item.price !== null && item.price !== undefined) {
            if (typeof item.price === 'string') {
                // Extract numeric value from price string
                const priceMatch = item.price.replace(/[^0-9.,]/g, '').match(/[\d,]+\.?\d*/);
                price = priceMatch ? priceMatch[0].replace(/,/g, '') : null;
            } else if (typeof item.price === 'number') {
                price = item.price.toString();
            }
        }

        // Validate URLs
        const imageUrl = this.validateUrl(item.imageUrl, 'image');
        const linkUrl = this.validateUrl(item.linkUrl, 'product');

        return {
            name: item.name.trim(),
            price: price,
            imageUrl: imageUrl,
            linkUrl: linkUrl
        };
    }

    validateUrl(url, type) {
        if (!url || typeof url !== 'string') {
            return null;
        }

        try {
            // Convert relative URLs to absolute URLs
            if (url.startsWith('//')) {
                url = 'https:' + url;
            } else if (url.startsWith('/')) {
                // For relative URLs, we can't convert without knowing the base domain
                // Return as-is and let the client handle it
                return url;
            }

            const urlObj = new URL(url);
            
            // Basic URL validation
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return null;
            }

            // Less strict validation for generic URLs
            if (type === 'image') {
                // Allow any domain for images
                console.log(`Image URL accepted from domain: ${urlObj.hostname}`);
            } else if (type === 'product') {
                // Allow any domain for product URLs
                console.log(`Product URL accepted from domain: ${urlObj.hostname}`);
            }

            return url;
        } catch (error) {
            console.warn(`Invalid URL: ${url}`, error.message);
            return null;
        }
    }

    async parseWithFallback(htmlContent, traditionalParsingFn, options = {}) {
        console.log(`[AI-PARSER] Starting parseWithFallback - trying AI parsing first...`);
        
        try {
            // Try AI parsing first
            const aiResult = await this.parseWishlistHTML(htmlContent, options);
            
            if (aiResult.items && aiResult.items.length > 0) {
                console.log(`[AI-PARSER] ✅ AI parsing successful - found ${aiResult.items.length} items`);
                return {
                    success: true,
                    items: aiResult.items,
                    processingMethod: 'ai_parsing',
                    aiMetadata: aiResult.aiMetadata
                };
            } else {
                console.log(`[AI-PARSER] ⚠️  AI parsing returned no items, falling back to traditional parsing`);
            }
        } catch (error) {
            console.warn(`[AI-PARSER] ❌ AI parsing failed: ${error.message}`);
            console.log(`[AI-PARSER] Falling back to traditional parsing...`);
        }

        // Fallback to traditional parsing
        try {
            console.log(`[AI-PARSER] Starting traditional scraping fallback...`);
            const traditionalResult = await traditionalParsingFn();
            console.log(`[AI-PARSER] ✅ Traditional parsing completed`);
            
            return {
                success: true,
                items: traditionalResult.items || [],
                processingMethod: 'traditional_scraping',
                fallbackReason: 'AI parsing failed or returned no items'
            };
        } catch (error) {
            console.error(`[AI-PARSER] ❌ Traditional parsing also failed: ${error.message}`);
            throw new ApiError('Both AI and traditional parsing failed', {
                status: 500,
                errorType: 'ALL_PARSING_FAILED',
                publicMessage: 'Unable to parse wishlist content using any available method',
                metadata: {
                    aiError: 'AI parsing failed',
                    traditionalError: error.message
                }
            });
        }
    }
}

module.exports = new AIWishlistParser();