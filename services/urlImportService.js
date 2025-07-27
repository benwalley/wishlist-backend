const puppeteerService = require('./puppeteerService');
const { ApiError } = require('../middleware/errorHandler');

class UrlImportService {
    constructor() {
        this.requestDelay = 1000; // 1 second delay between requests
        this.lastRequestTime = 0;
    }

    validateUrl(url) {
        try {
            const urlObj = new URL(url);
            
            // Basic URL validation - allow any HTTPS/HTTP URL
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                throw new ApiError('Invalid protocol', {
                    status: 400,
                    errorType: 'INVALID_URL',
                    publicMessage: 'Only HTTP and HTTPS URLs are supported'
                });
            }

            return urlObj.href;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            
            throw new ApiError('Invalid URL format', {
                status: 400,
                errorType: 'INVALID_URL',
                publicMessage: 'Please provide a valid URL'
            });
        }
    }

    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.requestDelay) {
            const delay = this.requestDelay - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        this.lastRequestTime = Date.now();
    }

    async scrapeWithRetry(url, scrapeFunction, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[SCRAPE-RETRY] Attempt ${attempt}/${maxRetries} starting for URL: ${url}`);
                
                console.log(`[SCRAPE-RETRY] Enforcing rate limit...`);
                await this.enforceRateLimit();
                console.log(`[SCRAPE-RETRY] Rate limit enforced, creating browser page...`);
                
                return await puppeteerService.withPage(async (page) => {
                    console.log(`[SCRAPE-RETRY] Browser page created, setting headers...`);
                    
                    // Set headers to look like a real browser
                    await page.setExtraHTTPHeaders({
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Upgrade-Insecure-Requests': '1',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none'
                    });
                    console.log(`[SCRAPE-RETRY] Headers set, navigating to page...`);

                    await puppeteerService.navigateToPage(page, url, {
                        waitUntil: 'networkidle2',
                        timeout: 30000
                    });
                    console.log(`[SCRAPE-RETRY] ✅ Navigation completed successfully`);

                    const result = await scrapeFunction(page);
                    console.log(`[SCRAPE-RETRY] ✅ Scraping function completed successfully`);
                    return result;
                }, { blockImages: false }); // Don't block images for generic pages
                
            } catch (error) {
                lastError = error;
                console.error(`[SCRAPE-RETRY] ❌ Attempt ${attempt} failed: ${error.message}`);
                
                if (attempt === maxRetries) {
                    console.error(`[SCRAPE-RETRY] ❌ All ${maxRetries} attempts failed, giving up`);
                    break;
                }
                
                // Wait before retry (exponential backoff)
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`[SCRAPE-RETRY] ⏳ Waiting ${delay}ms before retry ${attempt + 1}...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }

    async extractPageHTML(url) {
        console.log(`[HTML-EXTRACT] Starting HTML extraction from: ${url}`);
        const validatedUrl = this.validateUrl(url);
        console.log(`[HTML-EXTRACT] URL validated successfully`);

        return await this.scrapeWithRetry(validatedUrl, async (page) => {
            console.log(`[HTML-EXTRACT] Browser page created, navigating to page...`);
            
            // Wait for page to load
            try {
                console.log(`[HTML-EXTRACT] Waiting for page content to load (timeout: 15s)...`);
                await page.waitForSelector('body', { timeout: 15000 });
                console.log(`[HTML-EXTRACT] ✅ Page content loaded successfully`);
            } catch (error) {
                console.error(`[HTML-EXTRACT] ❌ Timeout waiting for page content: ${error.message}`);
                throw new ApiError('Unable to load page content', {
                    status: 500,
                    errorType: 'SCRAPING_ERROR',
                    publicMessage: 'Could not load page content. The page might be unavailable or restricted.'
                });
            }

            // Scroll to load dynamic content
            console.log('[HTML-EXTRACT] Scrolling to load dynamic content...');
            await this.scrollToLoadContent(page);

            // Extract page title
            console.log(`[HTML-EXTRACT] Extracting page title...`);
            const pageTitle = await page.title().catch(() => 'Imported Page');
            console.log(`[HTML-EXTRACT] Title found: "${pageTitle}"`);

            // Extract full body HTML content
            console.log(`[HTML-EXTRACT] Extracting full body HTML...`);
            let htmlContent = null;
            try {
                htmlContent = await page.$eval('body', el => el.innerHTML);
                console.log('[HTML-EXTRACT] ✅ Successfully extracted HTML from body element');
            } catch (error) {
                console.error(`[HTML-EXTRACT] ❌ Failed to extract body HTML: ${error.message}`);
                throw new ApiError('No page content found', {
                    status: 404,
                    errorType: 'NO_CONTENT',
                    publicMessage: 'Could not extract any content from the page.'
                });
            }

            if (!htmlContent || htmlContent.trim().length === 0) {
                console.error(`[HTML-EXTRACT] ❌ Empty HTML content extracted`);
                throw new ApiError('Empty page content', {
                    status: 404,
                    errorType: 'NO_CONTENT',
                    publicMessage: 'The page appears to be empty.'
                });
            }

            console.log(`[HTML-EXTRACT] Raw HTML extracted, length: ${htmlContent.length} characters`);
            console.log(`[HTML-EXTRACT] Cleaning HTML content (removing scripts, styles, etc.)...`);

            // Clean up the HTML (remove scripts, styles, etc.)
            const cleanedHTML = await page.evaluate((html) => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;

                // Remove script and style tags
                tempDiv.querySelectorAll('script, style, noscript').forEach(el => el.remove());

                // Remove sensitive data attributes
                tempDiv.querySelectorAll('*').forEach(el => {
                    Array.from(el.attributes).forEach(attr => {
                        if (attr.name.startsWith('data-') &&
                            !['data-price', 'data-product-id', 'data-item-id'].includes(attr.name)) {
                            el.removeAttribute(attr.name);
                        }
                    });
                });

                // Remove event handlers
                tempDiv.querySelectorAll('*').forEach(el => {
                    Array.from(el.attributes).forEach(attr => {
                        if (attr.name.startsWith('on')) {
                            el.removeAttribute(attr.name);
                        }
                    });
                });

                return tempDiv.innerHTML;
            }, htmlContent);

            console.log(`[HTML-EXTRACT] ✅ HTML cleaned, final length: ${cleanedHTML.length} characters`);
            console.log(`[HTML-EXTRACT] 🎉 HTML extraction complete`);

            return {
                pageTitle,
                htmlContent: cleanedHTML,
                sourceUrl: validatedUrl,
                extractionMethod: 'body'
            };
        });
    }

    async scrollToLoadContent(page) {
        let previousHeight = 0;
        let currentHeight = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 10; // Prevent infinite loops
        const scrollDelay = 1000; // Wait 1 second between scrolls

        console.log('[SCROLL-LOAD] Starting to load dynamic content...');

        do {
            previousHeight = currentHeight;

            // Get current page height
            currentHeight = await page.evaluate(() => document.body.scrollHeight);

            console.log(`[SCROLL-LOAD] Current page height: ${currentHeight}px (attempt ${scrollAttempts + 1})`);

            // Scroll to bottom of page
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });

            // Wait for potential new content to load
            console.log(`[SCROLL-LOAD] Waiting ${scrollDelay}ms for new content to load...`);
            await new Promise(resolve => setTimeout(resolve, scrollDelay));

            scrollAttempts++;

            // Safety check to prevent infinite loops
            if (scrollAttempts >= maxScrollAttempts) {
                console.log(`[SCROLL-LOAD] Reached max scroll attempts (${maxScrollAttempts}), stopping`);
                break;
            }

        } while (currentHeight > previousHeight);

        console.log(`[SCROLL-LOAD] ✅ Finished loading content. Final height: ${currentHeight}px after ${scrollAttempts} scroll attempts`);

        // Scroll back to top
        await page.evaluate(() => {
            window.scrollTo(0, 0);
        });

        // Wait a bit for any final loading
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    extractPrice(priceText) {
        if (!priceText) return null;
        
        // Remove currency symbols and extract numeric value
        const priceMatch = priceText.match(/[\d,]+\.?\d*/);
        if (priceMatch) {
            return priceMatch[0].replace(/,/g, '');
        }
        
        return null;
    }

    extractImageUrl(imageSrc) {
        if (!imageSrc) return null;
        
        // Convert relative URLs to absolute
        if (imageSrc.startsWith('//')) {
            return `https:${imageSrc}`;
        } else if (imageSrc.startsWith('/')) {
            // This would need the base URL, but for now just return as is
            return imageSrc;
        }
        
        return imageSrc.startsWith('http') ? imageSrc : null;
    }

    cleanText(text) {
        if (!text) return '';
        return text.trim().replace(/\s+/g, ' ');
    }
}

module.exports = new UrlImportService();