const sharp = require('sharp');
const fetch = require('node-fetch');
const ImageService = require('./imageService');
const { ApiError } = require('../middleware/errorHandler');

class ImageProcessingService {
    constructor() {
        this.defaultSize = 512; // Default square size
        this.maxFileSize = 10 * 1024 * 1024; // 10MB max
        this.supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
        this.timeout = 30000; // 30 seconds timeout for downloads
    }

    /**
     * Download image from URL and convert to square with padding
     * @param {string} imageUrl - URL of the image to download
     * @param {number} size - Output square size (default: 512)
     * @param {string} backgroundColor - Background color for padding (default: white)
     * @returns {Promise<Buffer>} Processed image buffer
     */
    async downloadAndSquareImage(imageUrl, size = this.defaultSize, backgroundColor = '#ffffff') {
        if (!imageUrl || typeof imageUrl !== 'string') {
            throw new ApiError('Invalid image URL', {
                status: 400,
                errorType: 'INVALID_URL',
                publicMessage: 'Image URL is required and must be a string'
            });
        }

        try {
            console.log(`[IMG-PROCESS] Downloading image from: ${imageUrl}`);
            
            // Download image with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(imageUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.startsWith('image/')) {
                throw new Error(`Invalid content type: ${contentType}`);
            }

            const imageBuffer = await response.buffer();
            
            if (imageBuffer.length > this.maxFileSize) {
                throw new Error(`Image too large: ${imageBuffer.length} bytes (max: ${this.maxFileSize})`);
            }

            console.log(`[IMG-PROCESS] Downloaded ${imageBuffer.length} bytes, processing to ${size}x${size} square`);

            // Process image to square with padding
            const processedBuffer = await this.makeSquareWithPadding(imageBuffer, size, backgroundColor);
            
            console.log(`[IMG-PROCESS] ✅ Image processed successfully (${processedBuffer.length} bytes)`);
            return processedBuffer;

        } catch (error) {
            console.error(`[IMG-PROCESS] ❌ Failed to process image from ${imageUrl}:`, error.message);
            
            if (error.name === 'AbortError') {
                throw new ApiError('Image download timeout', {
                    status: 408,
                    errorType: 'DOWNLOAD_TIMEOUT',
                    publicMessage: 'Image download took too long'
                });
            }

            throw new ApiError('Failed to download or process image', {
                status: 500,
                errorType: 'IMAGE_PROCESSING_ERROR',
                publicMessage: 'Unable to process the image',
                metadata: {
                    originalError: error.message,
                    imageUrl: imageUrl
                }
            });
        }
    }

    /**
     * Convert image buffer to square with padding
     * @param {Buffer} imageBuffer - Input image buffer
     * @param {number} size - Output square size
     * @param {string} backgroundColor - Background color for padding
     * @returns {Promise<Buffer>} Processed image buffer
     */
    async makeSquareWithPadding(imageBuffer, size = this.defaultSize, backgroundColor = '#ffffff') {
        try {
            const image = sharp(imageBuffer);
            const metadata = await image.metadata();
            
            console.log(`[IMG-PROCESS] Input image: ${metadata.width}x${metadata.height} (${metadata.format})`);

            // Calculate dimensions for centering
            const { width, height } = metadata;
            const maxDimension = Math.max(width, height);
            
            // Scale factor to fit the image within the target size
            const scaleFactor = size / maxDimension;
            const newWidth = Math.round(width * scaleFactor);
            const newHeight = Math.round(height * scaleFactor);

            // Calculate padding to center the image
            const left = Math.round((size - newWidth) / 2);
            const top = Math.round((size - newHeight) / 2);

            console.log(`[IMG-PROCESS] Scaling to ${newWidth}x${newHeight}, centering with padding`);

            // Process the image
            const processedBuffer = await image
                .resize(newWidth, newHeight, {
                    kernel: sharp.kernel.lanczos3,
                    withoutEnlargement: false
                })
                .extend({
                    top: top,
                    bottom: size - newHeight - top,
                    left: left,
                    right: size - newWidth - left,
                    background: backgroundColor
                })
                .jpeg({
                    quality: 85,
                    progressive: true
                })
                .toBuffer();

            return processedBuffer;

        } catch (error) {
            console.error('[IMG-PROCESS] Error making square image:', error);
            throw new ApiError('Failed to process image', {
                status: 500,
                errorType: 'IMAGE_PROCESSING_ERROR',
                publicMessage: 'Unable to process the image',
                metadata: {
                    originalError: error.message
                }
            });
        }
    }

    /**
     * Download image and save to database
     * @param {string} imageUrl - URL of the image to download
     * @param {string} recordId - ID of the associated record
     * @param {string} recordType - Type of the associated record
     * @param {number} size - Output square size
     * @returns {Promise<number>} Image ID from database
     */
    async downloadAndSaveImage(imageUrl, recordId = null, recordType = null, size = this.defaultSize) {
        try {
            // Download and process image
            const processedBuffer = await this.downloadAndSquareImage(imageUrl, size);
            
            // Prepare metadata
            const metadata = {
                originalUrl: imageUrl,
                processedAt: new Date().toISOString(),
                outputSize: size,
                fileSize: processedBuffer.length
            };

            // Save to database
            const savedImage = await ImageService.saveImage(
                processedBuffer,
                'image/jpeg', // Always output as JPEG
                recordId,
                recordType,
                metadata
            );

            console.log(`[IMG-PROCESS] ✅ Image saved to database with ID: ${savedImage.id}`);
            return savedImage.id;

        } catch (error) {
            console.error(`[IMG-PROCESS] ❌ Failed to download and save image:`, error);
            
            if (error instanceof ApiError) {
                throw error;
            }

            throw new ApiError('Failed to download and save image', {
                status: 500,
                errorType: 'IMAGE_SAVE_ERROR',
                publicMessage: 'Unable to download and save the image',
                metadata: {
                    originalError: error.message,
                    imageUrl: imageUrl
                }
            });
        }
    }

    /**
     * Process multiple images concurrently
     * @param {Array<string>} imageUrls - Array of image URLs
     * @param {string} recordType - Type of the associated record
     * @param {number} size - Output square size
     * @param {number} maxConcurrent - Maximum concurrent downloads
     * @returns {Promise<Array<{url: string, imageId: number|null, error: string|null}>>}
     */
    async processBatchImages(imageUrls, recordType = null, size = this.defaultSize, maxConcurrent = 5) {
        if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
            return [];
        }

        console.log(`[IMG-PROCESS] Processing batch of ${imageUrls.length} images (max ${maxConcurrent} concurrent)`);

        const results = [];
        
        // Process in chunks to limit concurrency
        for (let i = 0; i < imageUrls.length; i += maxConcurrent) {
            const chunk = imageUrls.slice(i, i + maxConcurrent);
            
            const chunkPromises = chunk.map(async (url) => {
                try {
                    if (!url || typeof url !== 'string' || url.trim().length === 0) {
                        return {
                            url: url,
                            imageId: null,
                            error: 'Invalid URL'
                        };
                    }

                    const imageId = await this.downloadAndSaveImage(url, null, recordType, size);
                    return {
                        url: url,
                        imageId: imageId,
                        error: null
                    };
                } catch (error) {
                    console.warn(`[IMG-PROCESS] ⚠️  Failed to process image ${url}:`, error.message);
                    return {
                        url: url,
                        imageId: null,
                        error: error.message
                    };
                }
            });

            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);
        }

        const successCount = results.filter(r => r.imageId !== null).length;
        const failCount = results.filter(r => r.error !== null).length;
        
        console.log(`[IMG-PROCESS] ✅ Batch complete: ${successCount} successful, ${failCount} failed`);
        
        return results;
    }
}

module.exports = new ImageProcessingService();