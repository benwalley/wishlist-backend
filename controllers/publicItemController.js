const models = require('../models');

/**
 * Get a public item by ID without any private information
 * Returns only public item data, no getting/goInOn data or private details
 * No authentication required
 */
exports.getPublicById = async (req, res) => {
    try {
        const { id: itemId } = req.params;

        if (!itemId) {
            return res.status(400).json({
                success: false,
                message: 'Item ID is required.'
            });
        }

        const parsedItemId = parseInt(itemId);
        if (isNaN(parsedItemId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid item ID format'
            });
        }

        // Get the item and verify it's public and not deleted
        const item = await models.ListItem.findOne({
            where: {
                id: parsedItemId,
                isPublic: true,
                deleted: false
            },
            attributes: [
                'id',
                'createdById',
                'name',
                'price',
                'minPrice',
                'maxPrice',
                'notes',
                'amountWanted',
                'minAmountWanted',
                'maxAmountWanted',
                'priority',
                'imageIds',
                'createdAt',
                'updatedAt',
                'isPublic'
            ],
            include: [
                {
                    model: models.ItemLink,
                    as: 'itemLinks',
                    attributes: ['id', 'label', 'url', 'createdAt']
                }
            ]
        });

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Public item not found'
            });
        }

        // Get the creator information (only if creator is public)
        let creator = null;
        if (item.createdById) {
            const creatorUser = await models.User.findOne({
                where: {
                    id: item.createdById,
                    isActive: true
                },
                attributes: ['id', 'name', 'image']
            });

            if (creatorUser) {
                creator = creatorUser.toJSON();
            }
        }

        // Format the response with only non-private information
        const response = {
            success: true,
            data: {
                ...item.toJSON(),
                creator: creator,
                createdById: undefined // Remove the raw ID from response
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('Error fetching public item by ID:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching the public item'
        });
    }
};
