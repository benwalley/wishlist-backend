const GeminiAIService = require('../../services/geminiAIService');
const ImageService = require('../../services/imageService');
const ImageProcessingService = require('../../services/imageProcessingService');

exports.generateImage = async (req, res) => {
    try {
        const { prompt, imageType = 'custom' } = req.body;

        // Validate imageType
        const validImageTypes = ['custom', 'abstract', 'animal'];
        if (!validImageTypes.includes(imageType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid imageType. Must be one of: ${validImageTypes.join(', ')}`
            });
        }

        // Validate prompt for custom type (required for custom, optional for others)
        if (imageType === 'custom' && (!prompt || prompt.trim().length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'Prompt is required for custom image type'
            });
        }

        // Generate image using Gemini AI service
        const imageResult = await GeminiAIService.generateImage(prompt, imageType);
        
        // Convert base64 to buffer
        const imageBuffer = Buffer.from(imageResult.imageData, 'base64');
        
        // Compress the image using the same compression as other images
        const compressedBuffer = await ImageProcessingService.makeSquareWithPadding(imageBuffer);
        
        // Save to database
        const savedImage = await ImageService.saveImage(
            compressedBuffer,
            'image/jpeg', // Always JPEG after compression
            null, // recordId
            'generated_image', // recordType
            imageResult.metadata
        );

        res.status(201).json({
            success: true,
            message: 'Image generated and saved successfully',
            imageId: savedImage.id,
            imageType: imageType,
            metadata: {
                prompt: imageResult.metadata.prompt,
                model: imageResult.metadata.model,
                generatedAt: imageResult.metadata.generatedAt
            }
        });

    } catch (error) {
        console.error('Error generating image:', error);
        
        // Handle specific API errors
        if (error.status && error.publicMessage) {
            return res.status(error.status).json({
                success: false,
                message: error.publicMessage,
                errorType: error.errorType
            });
        }

        // Generic error response
        res.status(500).json({
            success: false,
            message: 'Failed to generate image',
            error: error.message
        });
    }
};