const AmazonScrapingService = require('./amazonScrapingService');
const { ApiError } = require('../middleware/errorHandler');

class AmazonProductService extends AmazonScrapingService {
    constructor() {
        super();
    }

    validateProductUrl(url) {
        const validatedUrl = this.validateAmazonUrl(url);
        
        // Check if it's a product URL (contains /dp/ or /gp/product/)
        if (!validatedUrl.includes('/dp/') && !validatedUrl.includes('/gp/product/')) {
            throw new ApiError('Invalid product URL', {
                status: 400,
                errorType: 'INVALID_PRODUCT_URL',
                publicMessage: 'Please provide a valid Amazon product URL'
            });
        }
        
        return validatedUrl;
    }

    async scrapeProduct(url) {
        const validatedUrl = this.validateProductUrl(url);
        
        return await this.scrapeWithRetry(validatedUrl, async (page) => {
            // Wait for product page to load
            try {
                await page.waitForSelector('#productTitle, .a-size-extra-large', { timeout: 10000 });
            } catch (error) {
                throw new ApiError('Unable to load product page', {
                    status: 500,
                    errorType: 'SCRAPING_ERROR',
                    publicMessage: 'Could not load product details. The product might not exist or be unavailable.'
                });
            }

            // Extract product information
            const productData = await page.evaluate(() => {
                // Get product title
                const titleElement = document.querySelector('#productTitle, .a-size-extra-large');
                const title = titleElement ? titleElement.textContent.trim() : null;

                // Get price information
                let price = null;
                const priceSelectors = [
                    '.a-price-whole',
                    '.a-offscreen',
                    '.a-price .a-offscreen',
                    '#priceblock_ourprice',
                    '#priceblock_dealprice',
                    '.a-price-current .a-offscreen'
                ];
                
                for (const selector of priceSelectors) {
                    const priceElement = document.querySelector(selector);
                    if (priceElement) {
                        price = priceElement.textContent.trim();
                        break;
                    }
                }

                // Get main product image
                let imageUrl = null;
                const imageSelectors = [
                    '#landingImage',
                    '.a-dynamic-image',
                    '#imgBlkFront'
                ];
                
                for (const selector of imageSelectors) {
                    const imageElement = document.querySelector(selector);
                    if (imageElement) {
                        imageUrl = imageElement.getAttribute('src') || imageElement.getAttribute('data-src');
                        break;
                    }
                }

                // Get product description/features
                let description = null;
                const descriptionSelectors = [
                    '#feature-bullets ul',
                    '#productDescription',
                    '.a-unordered-list.a-vertical'
                ];
                
                for (const selector of descriptionSelectors) {
                    const descElement = document.querySelector(selector);
                    if (descElement) {
                        description = descElement.textContent.trim();
                        break;
                    }
                }

                // Get brand
                let brand = null;
                const brandSelectors = [
                    '#bylineInfo',
                    '.a-link-normal span',
                    '.po-brand .po-break-word'
                ];
                
                for (const selector of brandSelectors) {
                    const brandElement = document.querySelector(selector);
                    if (brandElement) {
                        brand = brandElement.textContent.trim();
                        break;
                    }
                }

                // Get availability
                let availability = null;
                const availabilitySelectors = [
                    '#availability span',
                    '.a-color-success',
                    '.a-color-state'
                ];
                
                for (const selector of availabilitySelectors) {
                    const availElement = document.querySelector(selector);
                    if (availElement) {
                        availability = availElement.textContent.trim();
                        break;
                    }
                }

                // Get rating
                let rating = null;
                const ratingElement = document.querySelector('.a-icon-alt, .a-star-5 .a-icon-alt');
                if (ratingElement) {
                    const ratingText = ratingElement.textContent;
                    const ratingMatch = ratingText.match(/(\d+\.?\d*) out of 5/);
                    if (ratingMatch) {
                        rating = parseFloat(ratingMatch[1]);
                    }
                }

                // Get number of reviews
                let reviewCount = null;
                const reviewElement = document.querySelector('#acrCustomerReviewText, .a-link-normal span');
                if (reviewElement) {
                    const reviewText = reviewElement.textContent;
                    const reviewMatch = reviewText.match(/(\d+(?:,\d+)*)\s+ratings?/);
                    if (reviewMatch) {
                        reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));
                    }
                }

                // Get product dimensions/details
                const details = {};
                const detailRows = document.querySelectorAll('.a-normal .a-span3, .prodDetTable tr');
                detailRows.forEach(row => {
                    const label = row.querySelector('.a-text-bold, td:first-child');
                    const value = row.querySelector('.a-span9, td:last-child');
                    if (label && value) {
                        const labelText = label.textContent.trim().replace(':', '');
                        const valueText = value.textContent.trim();
                        if (labelText && valueText) {
                            details[labelText] = valueText;
                        }
                    }
                });

                return {
                    title,
                    price,
                    imageUrl,
                    description,
                    brand,
                    availability,
                    rating,
                    reviewCount,
                    details
                };
            });

            // Process and clean the extracted data
            const processedProduct = {
                name: this.cleanText(productData.title),
                price: this.extractPrice(productData.price),
                imageUrl: this.extractImageUrl(productData.imageUrl),
                description: productData.description ? this.cleanText(productData.description) : null,
                brand: productData.brand ? this.cleanText(productData.brand) : null,
                availability: productData.availability ? this.cleanText(productData.availability) : null,
                rating: productData.rating,
                reviewCount: productData.reviewCount,
                details: productData.details,
                sourceUrl: validatedUrl
            };

            return processedProduct;
        });
    }

    async getProductDetails(url, userId) {
        try {
            console.log(`Getting product details for user ${userId} from URL: ${url}`);
            
            const productData = await this.scrapeProduct(url);
            
            if (!productData.name) {
                throw new ApiError('Product not found', {
                    status: 404,
                    errorType: 'PRODUCT_NOT_FOUND',
                    publicMessage: 'Could not find product information at the provided URL.'
                });
            }

            // Transform scraped product to match ListItem model structure
            const listItem = {
                createdById: userId,
                name: productData.name,
                price: productData.price,
                links: [productData.sourceUrl],
                notes: productData.description,
                isCustom: false,
                isPublic: true,
                matchListVisibility: true,
                // Add additional metadata in notes if available
                additionalInfo: {
                    brand: productData.brand,
                    availability: productData.availability,
                    rating: productData.rating,
                    reviewCount: productData.reviewCount,
                    details: productData.details
                }
            };

            return {
                success: true,
                product: productData,
                listItem: listItem
            };
            
        } catch (error) {
            console.error('Error getting product details:', error);
            if (error instanceof ApiError) throw error;
            
            throw new ApiError('Failed to get product details', {
                status: 500,
                errorType: 'SCRAPING_ERROR',
                publicMessage: 'Unable to retrieve product details. Please check the URL and try again.'
            });
        }
    }
}

module.exports = new AmazonProductService();