const puppeteerService = require('../services/puppeteerService');
const geminiAIService = require('../services/geminiAIService');
const imageProcessingService = require('../services/imageProcessingService');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Fetch item data from a URL using Puppeteer and Gemini AI
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function fetchItemData(req, res, next) {
    try {
        const { url } = req.body;
        const userId = req.user.id;

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

        const cleanUrl = url.trim();
        console.log(`User ${userId} fetching item data from URL: ${cleanUrl}`);

        // Get page content using Puppeteer
        let htmlContent;
        try {
            htmlContent = await puppeteerService.withPage(async (page) => {
                await puppeteerService.navigateToPage(page, cleanUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
                return await page.evaluate(() => document.body.innerHTML);
            });
        } catch (error) {
            console.error('Puppeteer scraping failed:', error);
            throw new ApiError('Failed to scrape page content', 500);
        }

        if (!htmlContent) {
            return res.status(400).json({
                success: false,
                message: 'Unable to extract content from the provided URL'
            });
        }

        // Parse HTML content with Gemini AI
        let parsedData;
        try {
            parsedData = await geminiAIService.parseItemData(htmlContent);
        } catch (error) {
            console.error('Gemini AI parsing failed:', error);
            throw new ApiError('Failed to parse item data from page content', 500);
        }

        // Process image if found
        let imageId = null;
        if (parsedData.imageUrl) {
            try {
                imageId = await imageProcessingService.downloadAndSaveImage(
                    parsedData.imageUrl, 
                    userId, 
                    'item_fetch',
                    512 // 512x512 square images like wishlist import
                );
                console.log(`Image processed and stored with ID: ${imageId}`);
            } catch (error) {
                console.error('Image processing failed:', error);
                // Continue without image - don't fail the entire request
            }
        }

        const responseData = {
            name: parsedData.name || null,
            price: parsedData.price || null,
            imageUrl: parsedData.imageUrl || null,
            linkLabel: parsedData.linkLabel || null,
            imageId: imageId
        };

        console.log(`Successfully fetched item data for user ${userId}`);
        res.status(200).json({
            success: true,
            message: 'Item data extracted successfully',
            data: responseData
        });

    } catch (error) {
        console.error('Error in fetchItemData:', error);
        next(error);
    }
}

module.exports = {
    fetchItemData
};
