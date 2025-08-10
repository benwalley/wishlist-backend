const models = require('../../models');

/**
 * Get a public list by ID with all public items and owner info
 * Returns list data, public items, and owner info (if owner is public)
 * No authentication required
 */
exports.getPublicById = async (req, res) => {
    try {
        const { id: listId } = req.params;
        console.log('got here');

        if (!listId) {
            return res.status(400).json({
                success: false,
                message: 'List ID is required.'
            });
        }

        const parsedListId = parseInt(listId);
        if (isNaN(parsedListId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid list ID format'
            });
        }

        // Get the list and verify it's public
        const list = await models.List.findOne({
            where: {
                id: parsedListId,
                public: true
            },
            attributes: [
                'id',
                'ownerId',
                'listName',
                'description',
                'imageId',
                'createdAt',
                'updatedAt',
                'public'
            ]
        });

        if (!list) {
            return res.status(404).json({
                success: false,
                message: 'Public list not found'
            });
        }

        // Get owner information (only if owner is public)
        const owner = await models.User.findOne({
            where: {
                id: list.ownerId,
                isActive: true
            },
            attributes: ['id', 'name', 'isPublic']
        });

        if (!owner) {
            return res.status(404).json({
                success: false,
                message: 'List owner not found'
            });
        }

        // Prepare owner info (only include if owner is public)
        let ownerInfo = null;
        if (owner.isPublic) {
            ownerInfo = {
                id: owner.id,
                name: owner.name
            };
        }

        // Get all public, non-deleted items in this list
        const publicItems = await models.ListItem.findAll({
            where: {
                lists: { [models.Sequelize.Op.contains]: [list.id] },
                deleted: false,
                isPublic: true
            },
            attributes: [
                'id',
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
                    attributes: ['id', 'url', 'createdAt']
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Prepare the response
        const response = {
            success: true,
            data: {
                list: {
                    ...list.toJSON(),
                    numberItems: publicItems.length
                },
                owner: ownerInfo,
                items: publicItems.map(item => item.toJSON())
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('Error fetching public list by ID:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching the public list'
        });
    }
};
