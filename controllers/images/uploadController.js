const ImageService = require('../../services/imageService');

exports.uploadImage = async (req, res) => {
    try {
        const { buffer, mimetype } = req.file; // Extract image data from multer
        const savedImage = await ImageService.saveImage(buffer, mimetype);

        res.status(201).json({
            success: true,
            message: 'Image uploaded successfully',
            imageId: savedImage.id, // Assuming the service returns an image ID
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to upload image',
            error: error.message,
        });
    }
};
