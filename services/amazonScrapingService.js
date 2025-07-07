const puppeteerService = require('./puppeteerService');
const { ApiError } = require('../middleware/errorHandler');

class AmazonScrapingService {
    constructor() {
        this.baseUrl = 'https://www.amazon.com';
        this.requestDelay = 1000; // 1 second delay between requests
        this.lastRequestTime = 0;
    }

    validateAmazonUrl(url) {
        try {
            const urlObj = new URL(url);
            const validDomains = [
                'amazon.com',
                'amazon.co.uk',
                'amazon.ca',
                'amazon.de',
                'amazon.fr',
                'amazon.it',
                'amazon.es',
                'amazon.co.jp',
                'amazon.com.au'
            ];

            const isValidDomain = validDomains.some(domain => 
                urlObj.hostname === domain || urlObj.hostname === `www.${domain}`
            );

            if (!isValidDomain) {
                throw new ApiError('Invalid Amazon URL', {
                    status: 400,
                    errorType: 'INVALID_URL',
                    publicMessage: 'Please provide a valid Amazon URL'
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
                    
                    // Set additional headers to look more like a real browser
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

                    console.log(`[SCRAPE-RETRY] Checking for bot detection...`);
                    // Check if page was blocked or has captcha
                    const pageContent = await page.content();
                    if (pageContent.includes('Robot Check') || 
                        pageContent.includes('Enter the characters you see below') ||
                        pageContent.includes('Sorry, we just need to make sure you\'re not a robot')) {
                        console.error(`[SCRAPE-RETRY] ❌ Bot detection triggered`);
                        throw new ApiError('Access blocked by Amazon', {
                            status: 429,
                            errorType: 'BLOCKED_ACCESS',
                            publicMessage: 'Amazon has temporarily blocked access. Please try again later.'
                        });
                    }
                    console.log(`[SCRAPE-RETRY] ✅ No bot detection found, proceeding with scraping function...`);

                    const result = await scrapeFunction(page);
                    console.log(`[SCRAPE-RETRY] ✅ Scraping function completed successfully`);
                    return result;
                }, { blockImages: true });
                
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
        
        // Amazon images often have size parameters, we can get higher resolution
        const cleanImageUrl = imageSrc.split('._')[0];
        return cleanImageUrl.startsWith('http') ? cleanImageUrl : `https:${cleanImageUrl}`;
    }

    async checkPageAccess(page) {
        try {
            // Check if wishlist is private
            const privateMessage = await page.$eval('.a-alert-content', el => el.textContent).catch(() => null);
            if (privateMessage && privateMessage.includes('private')) {
                throw new ApiError('Private wishlist', {
                    status: 403,
                    errorType: 'PRIVATE_WISHLIST',
                    publicMessage: 'This wishlist is private and cannot be accessed.'
                });
            }

            // Check if wishlist doesn't exist
            const notFoundMessage = await page.$eval('.a-alert-content', el => el.textContent).catch(() => null);
            if (notFoundMessage && (notFoundMessage.includes('not found') || notFoundMessage.includes('does not exist'))) {
                throw new ApiError('Wishlist not found', {
                    status: 404,
                    errorType: 'WISHLIST_NOT_FOUND',
                    publicMessage: 'The requested wishlist could not be found.'
                });
            }

            return true;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            return true; // If we can't check, assume it's accessible
        }
    }

    cleanText(text) {
        if (!text) return '';
        return text.trim().replace(/\s+/g, ' ');
    }
}

module.exports = AmazonScrapingService;