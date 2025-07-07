const amazonWishlistService = require('../services/amazonWishlistService');
const amazonProductService = require('../services/amazonProductService');
const aiWishlistParser = require('../services/aiWishlistParser');
const ListItemService = require('../services/listItemService');
const imageProcessingService = require('../services/imageProcessingService');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Fetch Amazon wishlist items without saving to database
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.fetchWishlist = async (req, res, next) => {
    const startTime = Date.now();
    try {
        const { url } = req.body;
        const userId = req.user.id;

        // Validate request
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Amazon wishlist URL is required'
            });
        }

        if (typeof url !== 'string' || url.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid URL'
            });
        }

        console.log(`[WISHLIST-FETCH] Starting wishlist fetch for user ${userId} from URL: ${url}`);
        console.log(`[WISHLIST-FETCH] Step 1/3: Extracting HTML content from Amazon page...`);

        // Extract HTML content from the wishlist page
        const htmlExtraction = await amazonWishlistService.extractWishlistHTML(url.trim());
        
        console.log(`[WISHLIST-FETCH] Step 1/3: ✅ HTML extracted successfully`);
        console.log(`[WISHLIST-FETCH] - Extraction method: ${htmlExtraction.extractionMethod}`);
        console.log(`[WISHLIST-FETCH] - Content length: ${htmlExtraction.htmlContent.length} characters`);
        console.log(`[WISHLIST-FETCH] - Wishlist title: "${htmlExtraction.wishlistTitle}"`);
        
        console.log(`[WISHLIST-FETCH] Step 2/3: Processing HTML with AI parser...`);

        // Use AI to parse the HTML content with fallback to traditional scraping
        const parseResult = await aiWishlistParser.parseWithFallback(
            htmlExtraction.htmlContent,
            // Fallback function for traditional scraping
            async () => {
                console.log('[WISHLIST-FETCH] AI parsing failed, falling back to traditional scraping method');
                return await amazonWishlistService.importWishlistItems(url.trim(), userId);
            }
        );

        console.log(`[WISHLIST-FETCH] Step 2/3: ✅ Parsing completed`);
        console.log(`[WISHLIST-FETCH] - Processing method: ${parseResult.processingMethod}`);
        console.log(`[WISHLIST-FETCH] - Items found: ${parseResult.items?.length || 0}`);
        if (parseResult.aiMetadata) {
            console.log(`[WISHLIST-FETCH] - AI tokens used: ${parseResult.aiMetadata.tokens_used}`);
            console.log(`[WISHLIST-FETCH] - AI response time: ${parseResult.aiMetadata.response_time_ms}ms`);
        }

        console.log(`[WISHLIST-FETCH] Step 3/4: Processing images...`);

        if (!parseResult.success || !parseResult.items || parseResult.items.length === 0) {
            console.log(`[WISHLIST-FETCH] ⚠️  No items found in wishlist`);
            return res.status(200).json({
                success: true,
                message: 'Wishlist is empty or no items could be fetched',
                data: {
                    totalItems: 0,
                    items: [],
                    wishlistTitle: htmlExtraction.wishlistTitle || 'Empty Wishlist',
                    sourceUrl: htmlExtraction.sourceUrl,
                    processingMethod: parseResult.processingMethod || 'unknown'
                }
            });
        }

        // Extract image URLs from items
        const imageUrls = parseResult.items
            .map(item => item.imageUrl)
            .filter(url => url && url.trim().length > 0);

        let imageProcessingResults = [];
        let imageProcessingTime = 0;

        if (imageUrls.length > 0) {
            console.log(`[WISHLIST-FETCH] Processing ${imageUrls.length} images...`);
            const imageStartTime = Date.now();
            
            try {
                // Process images in batch
                imageProcessingResults = await imageProcessingService.processBatchImages(
                    imageUrls,
                    'wishlist_item',
                    512 // 512x512 square images
                );
                imageProcessingTime = Date.now() - imageStartTime;
                
                const successCount = imageProcessingResults.filter(r => r.imageId !== null).length;
                console.log(`[WISHLIST-FETCH] ✅ Image processing complete: ${successCount}/${imageUrls.length} successful (${imageProcessingTime}ms)`);
            } catch (error) {
                console.error(`[WISHLIST-FETCH] ❌ Image processing failed:`, error);
                // Continue without images if processing fails
                imageProcessingResults = imageUrls.map(url => ({
                    url: url,
                    imageId: null,
                    error: 'Image processing failed'
                }));
            }
        }

        // Create a mapping from URL to imageId
        const urlToImageId = {};
        imageProcessingResults.forEach(result => {
            if (result.imageId !== null) {
                urlToImageId[result.url] = result.imageId;
            }
        });

        // Replace imageUrl with imageId in items
        const processedItems = parseResult.items.map(item => {
            const processedItem = { ...item };
            
            if (item.imageUrl && urlToImageId[item.imageUrl]) {
                processedItem.imageId = urlToImageId[item.imageUrl];
                delete processedItem.imageUrl; // Remove imageUrl, replace with imageId
            } else if (item.imageUrl) {
                // Keep imageUrl if processing failed
                console.warn(`[WISHLIST-FETCH] ⚠️  No processed image for URL: ${item.imageUrl}`);
            }
            
            return processedItem;
        });

        console.log(`[WISHLIST-FETCH] Step 4/4: Preparing API response...`);

        // Prepare response message based on processing method
        const processingMethod = parseResult.processingMethod;
        const methodDescription = processingMethod === 'ai_parsing' ? 'using AI parsing' : 'using traditional scraping';
        const imageSuccessCount = imageProcessingResults.filter(r => r.imageId !== null).length;
        
        console.log(`[WISHLIST-FETCH] Step 4/4: ✅ Response prepared successfully`);
        console.log(`[WISHLIST-FETCH] 🎉 COMPLETE: Found ${parseResult.items.length} items ${methodDescription}, processed ${imageSuccessCount} images`);
        console.log(`[WISHLIST-FETCH] Total processing time: ${Date.now() - startTime}ms (images: ${imageProcessingTime}ms)`);
        
        res.status(200).json({
            success: true,
            message: `Successfully fetched ${parseResult.items.length} items from Amazon wishlist ${methodDescription}${imageSuccessCount > 0 ? ` and processed ${imageSuccessCount} images` : ''}`,
            data: {
                wishlistTitle: htmlExtraction.wishlistTitle,
                totalItems: parseResult.items.length,
                items: processedItems,
                sourceUrl: htmlExtraction.sourceUrl,
                processingMethod: processingMethod,
                extractionMethod: htmlExtraction.extractionMethod,
                imageProcessing: {
                    totalImages: imageUrls.length,
                    successfulImages: imageSuccessCount,
                    failedImages: imageUrls.length - imageSuccessCount,
                    processingTimeMs: imageProcessingTime
                },
                ...(parseResult.aiMetadata && { aiMetadata: parseResult.aiMetadata }),
                ...(parseResult.fallbackReason && { fallbackReason: parseResult.fallbackReason })
            }
        });

    } catch (error) {
        console.error('Error fetching wishlist:', error);
        next(error);
    }
};

/**
 * Get Amazon product details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getProductDetails = async (req, res, next) => {
    try {
        const { url } = req.body;
        const userId = req.user.id;

        // Validate request
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Amazon product URL is required'
            });
        }

        if (typeof url !== 'string' || url.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid URL'
            });
        }

        console.log(`Getting product details for user ${userId} from URL: ${url}`);

        // Get product details
        const productResult = await amazonProductService.getProductDetails(url.trim(), userId);

        res.status(200).json({
            success: true,
            message: 'Successfully retrieved product details',
            data: {
                product: productResult.product,
                listItem: productResult.listItem
            }
        });

    } catch (error) {
        console.error('Error getting product details:', error);
        next(error);
    }
};

/**
 * Import single Amazon product as list item
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.importProduct = async (req, res, next) => {
    try {
        const { url } = req.body;
        const userId = req.user.id;

        // Validate request
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Amazon product URL is required'
            });
        }

        if (typeof url !== 'string' || url.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid URL'
            });
        }

        console.log(`Importing product for user ${userId} from URL: ${url}`);

        // Get product details
        const productResult = await amazonProductService.getProductDetails(url.trim(), userId);

        // Create list item in database
        const newItem = await ListItemService.createItem(productResult.listItem);

        res.status(201).json({
            success: true,
            message: 'Successfully imported Amazon product',
            data: {
                item: newItem,
                productDetails: productResult.product
            }
        });

    } catch (error) {
        console.error('Error importing product:', error);
        next(error);
    }
};