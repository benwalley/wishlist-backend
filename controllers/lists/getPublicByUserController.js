const models = require('../../models');

/**
 * Get public lists for a specific user by user ID
 * Returns only lists where public: true for the specified user
 * No authentication required
 */
exports.getPublicByUser = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required.'
            });
        }

        const parsedUserId = parseInt(userId);
        if (isNaN(parsedUserId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format'
            });
        }

        // First verify the user exists and is active
        const user = await models.User.findOne({
            where: {
                id: parsedUserId,
                isActive: true
            },
            attributes: ['id', 'name'] // Only need basic info for validation
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get all public lists owned by the user
        const publicLists = await models.List.findAll({
            where: {
                ownerId: parsedUserId,
                public: true
            },
            attributes: [
                'id',
                'listName',
                'description',
                'imageId',
                'createdAt',
                'updatedAt',
                'public'
            ],
            order: [['createdAt', 'DESC']]
        });

        // Add number of non-deleted public items for each public list
        const listsWithCount = await Promise.all(publicLists.map(async (list) => {
            const itemCount = await models.ListItem.count({
                where: {
                    lists: { [models.Sequelize.Op.contains]: [list.id] },
                    deleted: false,
                    isPublic: true
                }
            });

            return {
                ...list.toJSON(),
                numberItems: itemCount
            };
        }));

        res.status(200).json({
            success: true,
            data: listsWithCount
        });

    } catch (error) {
        console.error('Error fetching public lists by user ID:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching public lists'
        });
    }
};
