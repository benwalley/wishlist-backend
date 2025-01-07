const { Image } = require('../models');

class ImageService {
    /**
     * Save an image to the database.
     * @param {Buffer} imageData - The raw image data.
     * @param {string} contentType - The MIME type of the image.
     * @param {string} [recordId] - Optional: ID of the associated record.
     * @param {string} [recordType] - Optional: Type of the associated record.
     * @param {Object} [metadata] - Optional: Additional metadata for the image.
     * @returns {Promise<Image>} The saved image instance.
     */
    static async saveImage(imageData, contentType, recordId = null, recordType = null, metadata = null) {
        try {
            const image = await Image.create({
                recordId,
                recordType,
                imageData,
                contentType,
                metadata,
            });
            return image;
        } catch (error) {
            throw new Error(`Failed to save image: ${error.message}`);
        }
    }

    /**
     * Retrieve an image by its ID.
     * @param {string} id - The ID of the image.
     * @returns {Promise<Image>} The retrieved image instance.
     */
    static async getImageById(id) {
        try {
            const image = await Image.findByPk(id);
            if (!image) {
                throw new Error('Image not found');
            }
            return image;
        } catch (error) {
            throw new Error(`Failed to retrieve image: ${error.message}`);
        }
    }

    /**
     * Retrieve images associated with a specific record.
     * @param {string} recordId - The ID of the associated record.
     * @param {string} [recordType] - Optional: The type of the associated record.
     * @returns {Promise<Image[]>} The list of retrieved images.
     */
    static async getImagesByRecord(recordId, recordType = null) {
        try {
            const whereClause = { recordId };
            if (recordType) {
                whereClause.recordType = recordType;
            }
            const images = await Image.findAll({ where: whereClause });
            return images;
        } catch (error) {
            throw new Error(`Failed to retrieve images: ${error.message}`);
        }
    }
}

module.exports = ImageService;
