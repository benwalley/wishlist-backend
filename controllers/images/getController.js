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

        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Content-Type', image.contentType);
        res.send(image.imageData);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch image',
            error: error.message,
        });
    }
};
