const urlImportService = require('../services/urlImportService');
const amazonProductService = require('../services/amazonProductService');
const aiWishlistParser = require('../services/aiWishlistParser');
const ListItemService = require('../services/listItemService');
const imageProcessingService = require('../services/imageProcessingService');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Fetch products from any URL without saving to database
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
                message: 'URL is required'
            });
        }

        if (typeof url !== 'string' || url.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid URL'
            });
        }

        console.log(`[URL-FETCH] Starting product fetch for user ${userId} from URL: ${url}`);
        console.log(`[URL-FETCH] Step 1/3: Extracting HTML content from page...`);

        // Extract HTML content from the page
        const htmlExtraction = await urlImportService.extractPageHTML(url.trim());
        
        console.log(`[URL-FETCH] Step 1/3: ✅ HTML extracted successfully`);
        console.log(`[URL-FETCH] - Extraction method: ${htmlExtraction.extractionMethod}`);
        console.log(`[URL-FETCH] - Content length: ${htmlExtraction.htmlContent.length} characters`);
        console.log(`[URL-FETCH] - Page title: "${htmlExtraction.pageTitle}"`); 
        
        console.log(`[URL-FETCH] Step 2/3: Processing HTML with AI parser...`);

        // Use AI to parse the HTML content with fallback to traditional scraping
        const parseResult = await aiWishlistParser.parseWithFallback(
            htmlExtraction.htmlContent,
            // Fallback function for traditional scraping
            async () => {
                console.log('[URL-FETCH] AI parsing failed, falling back to traditional scraping method');
                throw new Error('Traditional scraping not supported for generic URLs');
            }
        );

        console.log(`[URL-FETCH] Step 2/3: ✅ Parsing completed`);
        console.log(`[URL-FETCH] - Processing method: ${parseResult.processingMethod}`);
        console.log(`[URL-FETCH] - Items found: ${parseResult.items?.length || 0}`);
        if (parseResult.aiMetadata) {
            console.log(`[URL-FETCH] - AI tokens used: ${parseResult.aiMetadata.tokens_used}`);
            console.log(`[URL-FETCH] - AI response time: ${parseResult.aiMetadata.response_time_ms}ms`);
        }

        console.log(`[URL-FETCH] Step 3/4: Processing images...`);

        if (!parseResult.success || !parseResult.items || parseResult.items.length === 0) {
            console.log(`[URL-FETCH] ⚠️  No items found on page`);
            return res.status(200).json({
                success: true,
                message: 'Page has no products or no items could be fetched',
                data: {
                    totalItems: 0,
                    items: [],
                    pageTitle: htmlExtraction.pageTitle || 'No Products Found',
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
            console.log(`[URL-FETCH] Processing ${imageUrls.length} images...`);
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
                console.log(`[URL-FETCH] ✅ Image processing complete: ${successCount}/${imageUrls.length} successful (${imageProcessingTime}ms)`);
            } catch (error) {
                console.error(`[URL-FETCH] ❌ Image processing failed:`, error);
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
                console.warn(`[URL-FETCH] ⚠️  No processed image for URL: ${item.imageUrl}`);
            }
            
            return processedItem;
        });

        console.log(`[URL-FETCH] Step 4/4: Preparing API response...`);

        // Prepare response message based on processing method
        const processingMethod = parseResult.processingMethod;
        const methodDescription = processingMethod === 'ai_parsing' ? 'using AI parsing' : 'using traditional scraping';
        const imageSuccessCount = imageProcessingResults.filter(r => r.imageId !== null).length;
        
        console.log(`[URL-FETCH] Step 4/4: ✅ Response prepared successfully`);
        console.log(`[URL-FETCH] 🎉 COMPLETE: Found ${parseResult.items.length} items ${methodDescription}, processed ${imageSuccessCount} images`);
        console.log(`[URL-FETCH] Total processing time: ${Date.now() - startTime}ms (images: ${imageProcessingTime}ms)`);
        
        res.status(200).json({
            success: true,
            message: `Successfully fetched ${parseResult.items.length} items from URL ${methodDescription}${imageSuccessCount > 0 ? ` and processed ${imageSuccessCount} images` : ''}`,
            data: {
                pageTitle: htmlExtraction.pageTitle,
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
        console.error('Error fetching products from URL:', error);
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