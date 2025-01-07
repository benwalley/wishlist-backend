const ImageService = require('../../services/imageService');

exports.getImage = async (req, res) => {
    try {
        const imageId = req.params.id;
        const image = await ImageService.getImageById(imageId);

        if (!image) {
            return res.status(404).json({
                success: false,
                message: 'Image not found',
            });
        }

        res.setHeader('Content-Type', image.contentType); // Set the correct content type
        res.send(image.imageData); // Send the raw image data
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch image',
            error: error.message,
        });
    }
};
