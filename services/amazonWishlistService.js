const AmazonScrapingService = require('./amazonScrapingService');
const { ApiError } = require('../middleware/errorHandler');

class AmazonWishlistService extends AmazonScrapingService {
    constructor() {
        super();
    }

    validateWishlistUrl(url) {
        const validatedUrl = this.validateAmazonUrl(url);

        // Check if it's actually a wishlist URL
        if (!validatedUrl.includes('/wishlist/')) {
            throw new ApiError('Invalid wishlist URL', {
                status: 400,
                errorType: 'INVALID_WISHLIST_URL',
                publicMessage: 'Please provide a valid Amazon wishlist URL'
            });
        }

        return validatedUrl;
    }

    async extractWishlistHTML(url) {
        console.log(`[HTML-EXTRACT] Starting HTML extraction from: ${url}`);
        const validatedUrl = this.validateWishlistUrl(url);
        console.log(`[HTML-EXTRACT] URL validated successfully`);

        return await this.scrapeWithRetry(validatedUrl, async (page) => {
            console.log(`[HTML-EXTRACT] Browser page created, navigating to wishlist...`);
            await this.checkPageAccess(page);
            console.log(`[HTML-EXTRACT] Page access verified, waiting for content to load...`);

            // Wait for wishlist container to load
            try {
                console.log(`[HTML-EXTRACT] Waiting for wishlist selectors to appear (timeout: 15s)...`);
                await page.waitForSelector('#wl-item-view, [data-itemid], .a-fixed-left-grid', { timeout: 15000 });
                console.log(`[HTML-EXTRACT] ✅ Wishlist content loaded successfully`);
            } catch (error) {
                console.error(`[HTML-EXTRACT] ❌ Timeout waiting for wishlist content: ${error.message}`);
                throw new ApiError('Unable to load wishlist content', {
                    status: 500,
                    errorType: 'SCRAPING_ERROR',
                    publicMessage: 'Could not load wishlist content. The wishlist might be empty or have restricted access.'
                });
            }

            // Load all items by scrolling (handle infinite scroll/lazy loading)
            console.log('[HTML-EXTRACT] Starting infinite scroll to load all items...');
            await this.loadAllItemsWithScroll(page);

            // Extract wishlist title
            console.log(`[HTML-EXTRACT] Extracting wishlist title...`);
            const wishlistTitle = await page.$eval('h1, .a-size-extra-large, #profile-list-name', el => this.cleanText(el.textContent))
                .catch(() => 'Imported Wishlist');
            console.log(`[HTML-EXTRACT] Title found: "${wishlistTitle}"`);

            // Try to find the wl-item-view element first (preferred)
            let htmlContent = null;
            console.log(`[HTML-EXTRACT] Looking for #wl-item-view element...`);
            try {
                htmlContent = await page.$eval('#wl-item-view', el => el.innerHTML);
                console.log('[HTML-EXTRACT] ✅ Successfully extracted HTML from #wl-item-view element');
            } catch (error) {
                console.log('[HTML-EXTRACT] ⚠️  #wl-item-view not found, trying fallback selectors...');

                // Fallback to other common wishlist containers
                const fallbackSelectors = [
                    '[data-item-prime-info]',
                    '.a-fixed-left-grid-container',
                    '#g-items',
                    '.a-cardui'
                ];

                for (const selector of fallbackSelectors) {
                    try {
                        console.log(`[HTML-EXTRACT] Trying fallback selector: ${selector}`);
                        const elements = await page.$$(selector);
                        console.log(`[HTML-EXTRACT] Found ${elements.length} elements with selector: ${selector}`);

                        if (elements.length > 0) {
                            htmlContent = await page.evaluate((sel) => {
                                const container = document.querySelector(sel);
                                return container ? container.innerHTML : null;
                            }, selector);

                            if (htmlContent) {
                                console.log(`[HTML-EXTRACT] ✅ Successfully extracted HTML using fallback selector: ${selector}`);
                                break;
                            }
                        }
                    } catch (err) {
                        console.log(`[HTML-EXTRACT] ❌ Fallback selector ${selector} failed: ${err.message}`);
                    }
                }
            }

            if (!htmlContent || htmlContent.trim().length === 0) {
                console.error(`[HTML-EXTRACT] ❌ No wishlist content found with any selector`);
                throw new ApiError('No wishlist content found', {
                    status: 404,
                    errorType: 'NO_CONTENT',
                    publicMessage: 'Could not find any wishlist items to extract.'
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

                // Remove data attributes that might be sensitive
                tempDiv.querySelectorAll('*').forEach(el => {
                    Array.from(el.attributes).forEach(attr => {
                        if (attr.name.startsWith('data-') &&
                            !['data-itemid', 'data-price', 'data-cy'].includes(attr.name)) {
                            el.removeAttribute(attr.name);
                        }
                    });
                });

                return tempDiv.innerHTML;
            }, htmlContent);

            console.log(`[HTML-EXTRACT] ✅ HTML cleaned, final length: ${cleanedHTML.length} characters`);
            const extractionMethod = htmlContent.includes('wl-item-view') ? 'wl-item-view' : 'fallback';
            console.log(`[HTML-EXTRACT] 🎉 HTML extraction complete using: ${extractionMethod}`);

            return {
                wishlistTitle,
                htmlContent: cleanedHTML,
                sourceUrl: validatedUrl,
                extractionMethod: extractionMethod
            };
        });
    }

    async scrapeWishlist(url) {
        const validatedUrl = this.validateWishlistUrl(url);

        return await this.scrapeWithRetry(validatedUrl, async (page) => {
            await this.checkPageAccess(page);

            // Wait for wishlist items to load
            try {
                await page.waitForSelector('[data-itemid], .a-fixed-left-grid', { timeout: 10000 });
            } catch (error) {
                // If no items selector found, might be empty wishlist
                const emptyMessage = await page.$eval('.a-size-base', el => el.textContent).catch(() => null);
                if (emptyMessage && emptyMessage.includes('empty')) {
                    return [];
                }
                throw new ApiError('Unable to load wishlist items', {
                    status: 500,
                    errorType: 'SCRAPING_ERROR',
                    publicMessage: 'Could not load wishlist items. The wishlist might be empty or have restricted access.'
                });
            }

            // Load all items by scrolling (handle infinite scroll/lazy loading)
            console.log('[WISHLIST-SCRAPE] Starting infinite scroll to load all items...');
            await this.loadAllItemsWithScroll(page);

            // Extract wishlist metadata
            const wishlistTitle = await page.$eval('h1, .a-size-extra-large', el => this.cleanText(el.textContent))
                .catch(() => 'Imported Wishlist');

            // Extract all items from the wishlist
            const items = await page.evaluate(() => {
                const itemElements = document.querySelectorAll('[data-itemid], .a-fixed-left-grid');
                const extractedItems = [];

                itemElements.forEach(item => {
                    try {
                        // Get item name
                        const nameElement = item.querySelector('h3 a, .a-link-normal strong, .a-size-base-plus a, [data-cy="item-title"] a');
                        const name = nameElement ? nameElement.textContent.trim() : null;

                        if (!name) return; // Skip items without names

                        // Get item URL
                        const linkElement = item.querySelector('h3 a, .a-link-normal, [data-cy="item-title"] a');
                        const relativeUrl = linkElement ? linkElement.getAttribute('href') : null;
                        const itemUrl = relativeUrl ? `https://www.amazon.com${relativeUrl}` : null;

                        // Get price information
                        const priceElement = item.querySelector('.a-price-whole, .a-offscreen, .a-price, [data-cy="item-price"]');
                        const priceText = priceElement ? priceElement.textContent.trim() : null;

                        // Get image URL
                        const imageElement = item.querySelector('img');
                        let imageUrl = null;
                        if (imageElement) {
                            imageUrl = imageElement.getAttribute('src') || imageElement.getAttribute('data-src');
                        }

                        // Get item description/notes
                        const descriptionElement = item.querySelector('.a-size-base:not(.a-color-price), .a-text-normal');
                        const description = descriptionElement ? descriptionElement.textContent.trim() : null;

                        // Get quantity wanted (if available)
                        const quantityElement = item.querySelector('[data-cy="item-quantity"], .a-dropdown-prompt');
                        const quantity = quantityElement ? quantityElement.textContent.trim() : '1';

                        // Get priority (if available)
                        const priorityElement = item.querySelector('.a-color-secondary');
                        const priority = priorityElement ? priorityElement.textContent.trim() : null;

                        extractedItems.push({
                            name,
                            itemUrl,
                            priceText,
                            imageUrl,
                            description,
                            quantity,
                            priority
                        });
                    } catch (error) {
                        console.error('Error extracting item:', error);
                    }
                });

                return extractedItems;
            });

            // Process and clean the extracted data
            const processedItems = items.map(item => {
                const links = [];
                if (item.itemUrl) {
                    links.push(item.itemUrl);
                }

                return {
                    name: this.cleanText(item.name),
                    price: this.extractPrice(item.priceText),
                    links: links,
                    notes: item.description ? this.cleanText(item.description) : null,
                    imageUrl: this.extractImageUrl(item.imageUrl),
                    amountWanted: item.quantity || '1',
                    priority: this.extractPriority(item.priority),
                    isCustom: false
                };
            }).filter(item => item.name); // Remove items without names

            return {
                wishlistTitle,
                items: processedItems,
                totalItems: processedItems.length
            };
        });
    }

    async loadAllItemsWithScroll(page) {
        let previousItemCount = 0;
        let currentItemCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 50; // Prevent infinite loops
        const scrollDelay = 2000; // Wait 2 seconds between scrolls

        console.log('[INFINITE-SCROLL] Starting to load all items...');

        do {
            previousItemCount = currentItemCount;

            // Count current items
            currentItemCount = await page.evaluate(() => {
                return document.querySelectorAll('[data-itemid], .a-fixed-left-grid').length;
            });

            console.log(`[INFINITE-SCROLL] Current item count: ${currentItemCount} (attempt ${scrollAttempts + 1})`);

            // Scroll to bottom of page
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });

            // Wait for potential new items to load
            console.log(`[INFINITE-SCROLL] Waiting ${scrollDelay}ms for new items to load...`);
            await new Promise(resolve => setTimeout(resolve, scrollDelay));

            // Look for "Show more" or "Load more" buttons and click them
            try {
                const loadMoreButton = await page.$('button[aria-label*="more"], button:contains("Show more"), button:contains("Load more"), .a-button-text:contains("Show more")');
                if (loadMoreButton) {
                    console.log('[INFINITE-SCROLL] Found load more button, clicking...');
                    await loadMoreButton.click();
                    await new Promise(resolve => setTimeout(resolve, scrollDelay));
                }
            } catch (error) {
                console.log('[INFINITE-SCROLL] No load more button found or click failed');
            }

            scrollAttempts++;

            // Safety check to prevent infinite loops
            if (scrollAttempts >= maxScrollAttempts) {
                console.log(`[INFINITE-SCROLL] Reached max scroll attempts (${maxScrollAttempts}), stopping`);
                break;
            }

        } while (currentItemCount > previousItemCount);

        console.log(`[INFINITE-SCROLL] ✅ Finished loading items. Final count: ${currentItemCount} items after ${scrollAttempts} scroll attempts`);

        // Scroll back to top to ensure all items are properly loaded
        await page.evaluate(() => {
            window.scrollTo(0, 0);
        });

        // Wait a bit for any final loading
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    extractPriority(priorityText) {
        if (!priorityText) return 0;

        const lowerPriority = priorityText.toLowerCase();
        if (lowerPriority.includes('high') || lowerPriority.includes('must have')) {
            return 3;
        } else if (lowerPriority.includes('medium') || lowerPriority.includes('nice to have')) {
            return 2;
        } else if (lowerPriority.includes('low') || lowerPriority.includes('lowest')) {
            return 1;
        }

        return 0;
    }

    async importWishlistItems(url, userId) {
        try {
            console.log(`Starting wishlist import for user ${userId} from URL: ${url}`);

            const scrapedData = await this.scrapeWishlist(url);

            if (!scrapedData.items || scrapedData.items.length === 0) {
                return {
                    success: true,
                    message: 'Wishlist is empty or no items could be imported',
                    totalItems: 0,
                    importedItems: []
                };
            }

            // Transform scraped items to match ListItem model structure
            const listItems = scrapedData.items.map(item => ({
                createdById: userId,
                name: item.name,
                price: item.price,
                links: item.links,
                notes: item.notes,
                amountWanted: item.amountWanted,
                priority: item.priority,
                isCustom: item.isCustom,
                isPublic: true,
                matchListVisibility: true
            }));

            return {
                success: true,
                wishlistTitle: scrapedData.wishlistTitle,
                totalItems: scrapedData.totalItems,
                items: listItems,
                sourceUrl: url
            };

        } catch (error) {
            console.error('Error importing wishlist:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to import wishlist', {
                status: 500,
                errorType: 'IMPORT_ERROR',
                publicMessage: 'Unable to import the wishlist. Please check the URL and try again.'
            });
        }
    }
}

module.exports = new AmazonWishlistService();
