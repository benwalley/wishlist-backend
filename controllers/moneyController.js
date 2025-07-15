const { Money, ListItem } = require('../models');

/**
 * Create a new money item
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createMoneyItem = async (req, res, next) => {
    try {
        const ownerId = req.user.id;
        const { owedFromId, owedFromName, owedToId, owedToName, note, itemId, amount } = req.body;

        // Validate required fields
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Amount is required and must be a positive number'
            });
        }

        // Validate that at least one of owedFrom or owedTo is specified
        if (!owedFromId && !owedFromName && !owedToId && !owedToName) {
            return res.status(400).json({
                success: false,
                message: 'At least one of owedFromId, owedFromName, owedToId, or owedToName must be specified'
            });
        }

        // Create the money item
        const moneyItem = await Money.create({
            ownerId,
            owedFromId: owedFromId || null,
            owedFromName: owedFromName || null,
            owedToId: owedToId || null,
            owedToName: owedToName || null,
            note: note || null,
            itemId: itemId || null,
            amount: parseFloat(amount),
            completed: false,
            completedAt: null
        });

        // Fetch associated item data if itemId was provided
        let itemData = null;
        if (itemId) {
            const item = await ListItem.findOne({
                where: {
                    id: itemId,
                    deleted: false
                },
                attributes: ['id', 'name', 'price', 'minPrice', 'maxPrice', 'notes', 'priority', 'isPublic']
            });
            itemData = item || null;
        }

        // Prepare response
        const responseData = moneyItem.toJSON();
        if (itemData) {
            responseData.item = itemData;
        }

        res.status(201).json({
            success: true,
            data: responseData,
            message: 'Money item created successfully'
        });
    } catch (error) {
        console.error('Error creating money item:', error);
        next(error);
    }
};

/**
 * Get all money items owned by the current user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getMyMoneyItems = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Get all money items owned by the current user
        const moneyItems = await Money.findAll({
            where: {
                ownerId: userId
            },
            order: [['createdAt', 'DESC']]
        });

        // Get unique item IDs that are not null
        const itemIds = [...new Set(
            moneyItems
                .map(money => money.itemId)
                .filter(id => id !== null && id !== undefined)
        )];

        // Fetch item data for the itemIds
        let itemsMap = {};
        if (itemIds.length > 0) {
            const items = await ListItem.findAll({
                where: {
                    id: itemIds,
                    deleted: false
                },
                attributes: ['id', 'name', 'price', 'minPrice', 'maxPrice', 'notes', 'priority', 'isPublic']
            });

            // Create a map for easy lookup
            itemsMap = items.reduce((map, item) => {
                map[item.id] = item;
                return map;
            }, {});
        }

        // Combine money items with their corresponding item data
        const moneyItemsWithData = moneyItems.map(money => {
            const moneyData = money.toJSON();
            
            // Add item data if itemId exists and item was found
            if (money.itemId && itemsMap[money.itemId]) {
                moneyData.item = itemsMap[money.itemId];
            } else if (money.itemId) {
                // Item ID exists but item not found (deleted or no access)
                moneyData.item = null;
            }

            return moneyData;
        });

        res.status(200).json({
            success: true,
            data: moneyItemsWithData,
            count: moneyItemsWithData.length
        });
    } catch (error) {
        console.error('Error fetching money items:', error);
        next(error);
    }
};

/**
 * Update a money item by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateMoneyItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { owedFromId, owedFromName, owedToId, owedToName, note, itemId, amount, completed } = req.body;

        // Find the money item and verify ownership
        const moneyItem = await Money.findOne({
            where: {
                id: id,
                ownerId: userId
            }
        });

        if (!moneyItem) {
            return res.status(404).json({
                success: false,
                message: 'Money item not found or you do not have permission to edit it'
            });
        }

        // Validate amount if provided
        if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
            return res.status(400).json({
                success: false,
                message: 'Amount must be a positive number'
            });
        }

        // Update fields if provided
        const updateData = {};
        if (owedFromId !== undefined) updateData.owedFromId = owedFromId;
        if (owedFromName !== undefined) updateData.owedFromName = owedFromName;
        if (owedToId !== undefined) updateData.owedToId = owedToId;
        if (owedToName !== undefined) updateData.owedToName = owedToName;
        if (note !== undefined) updateData.note = note;
        if (itemId !== undefined) updateData.itemId = itemId;
        if (amount !== undefined) updateData.amount = parseFloat(amount);
        if (completed !== undefined) {
            updateData.completed = completed;
            updateData.completedAt = completed ? new Date() : null;
        }

        // Update the money item
        await moneyItem.update(updateData);

        // Fetch associated item data if itemId was provided
        let itemData = null;
        if (moneyItem.itemId) {
            const item = await ListItem.findOne({
                where: {
                    id: moneyItem.itemId,
                    deleted: false
                },
                attributes: ['id', 'name', 'price', 'minPrice', 'maxPrice', 'notes', 'priority', 'isPublic']
            });
            itemData = item || null;
        }

        // Prepare response
        const responseData = moneyItem.toJSON();
        if (itemData) {
            responseData.item = itemData;
        }

        res.status(200).json({
            success: true,
            data: responseData,
            message: 'Money item updated successfully'
        });
    } catch (error) {
        console.error('Error updating money item:', error);
        next(error);
    }
};

/**
 * Delete a money item by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteMoneyItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Find the money item and verify ownership
        const moneyItem = await Money.findOne({
            where: {
                id: id,
                ownerId: userId
            }
        });

        if (!moneyItem) {
            return res.status(404).json({
                success: false,
                message: 'Money item not found or you do not have permission to delete it'
            });
        }

        // Delete the money item
        await moneyItem.destroy();

        res.status(200).json({
            success: true,
            message: 'Money item deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting money item:', error);
        next(error);
    }
};