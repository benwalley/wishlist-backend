const ListItemService = require('../services/listItemService');
const ListService = require('../services/listService');
const PermissionService = require('../services/permissionService');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Create a new list item
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.create = async (req, res, next) => {
    try {
        const createdById = req.user.id;

        // Check permissions if lists are provided
        if (req.body.lists && Array.isArray(req.body.lists) && req.body.lists.length > 0) {
            const permissionResult = await PermissionService.canUserAddToLists(createdById, req.body.lists);
            if (!permissionResult.canAccess) {
                PermissionService.throwPermissionError(permissionResult);
            }
        }

        // Merge the authenticated user's ID with the request body
        const data = {
            ...req.body,
            createdById,
        };

        // Create the ListItem
        const newItem = await ListItemService.createItem(data);

        res.status(201).json({
            success: true,
            data: newItem
        });
    } catch (error) {
        // Let the error middleware handle it
        next(error);
    }
};

/**
 * Update an existing list item
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const userId = req.user.id;

        // Check if user can modify this item
        const permissionResult = await PermissionService.canUserModifyItem(userId, id);
        if (!permissionResult.canAccess) {
            PermissionService.throwPermissionError(permissionResult);
        }

        const updatedItem = await ListItemService.updateItem(id, updates);
        res.status(200).json({
            success: true,
            data: updatedItem
        });
    } catch (error) {
        // Let the error middleware handle it
        next(error);
    }
};

/**
 * Delete a list item by id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.delete = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if user can modify this item
        const permissionResult = await PermissionService.canUserModifyItem(userId, id);
        if (!permissionResult.canAccess) {
            PermissionService.throwPermissionError(permissionResult);
        }

        const deletedItem = await ListItemService.deleteItem(id, userId);
        res.status(200).json({
            success: true,
            data: deletedItem
        });
    } catch (error) {
        // Let the error middleware handle it
        next(error);
    }
};

/**
 * Get all list items with optional filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAll = async (req, res, next) => {
    try {
        const filter = req.query; // Use query params for filtering
        const userId = req.user.id;

        const items = await ListItemService.getAllItems(filter);

        // Filter gotten/goInOn data based on permissions
        const filteredItems = items.map(item => {
            const canSeeGotten = PermissionService.canUserSeeGotten(item, userId);
            if (!canSeeGotten) {
                // Remove gotten and goInOn data if user can't see it
                const { getting, goInOn, ...filteredItem } = item.toJSON();
                return filteredItem;
            }
            return item;
        });

        res.status(200).json({
            success: true,
            data: filteredItems
        });
    } catch (error) {
        // Let the error middleware handle it
        next(error);
    }
};

/**
 * Get a list item by id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const item = await ListItemService.getItemById(id);

        // Filter gotten/goInOn data based on permissions
        const canSeeGotten = PermissionService.canUserSeeGotten(item, userId);
        let responseItem = item;
        if (!canSeeGotten) {
            const { getting, goInOn, ...filteredItem } = item.toJSON();
            responseItem = filteredItem;
        }

        res.status(200).json({
            success: true,
            data: responseItem
        });
    } catch (error) {
        // Let the error middleware handle it
        next(error);
    }
};

/**
 * Bulk create multiple list items
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.bulkCreate = async (req, res, next) => {
    try {
        const { items, listIds } = req.body;
        const createdById = req.user.id;

        // Validate input
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Items array is required and must be non-empty'
            });
        }

        if (listIds && !Array.isArray(listIds)) {
            return res.status(400).json({
                success: false,
                message: 'List IDs must be an array'
            });
        }

        // Check permissions if lists are provided
        if (listIds && listIds.length > 0) {
            const permissionResult = await PermissionService.canUserAddToLists(createdById, listIds);
            if (!permissionResult.canAccess) {
                PermissionService.throwPermissionError(permissionResult);
            }
        }

        const result = await ListItemService.bulkCreateItems(items, listIds || [], createdById);

        res.status(201).json({
            success: true,
            message: `Successfully created ${result.count} items${result.associatedWithLists ? ` and associated them with ${result.associatedWithLists.length} lists` : ''}`,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all items for a user that are not in any list
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getNotInList = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const items = await ListItemService.getItemsNotInAnyList(userId);

        res.status(200).json({
            success: true,
            data: items
        });
    } catch (error) {
        // Let the error middleware handle it
        next(error);
    }
};

/**
 * Bulk delete items (soft delete - sets deleted: true)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.bulkDelete = async (req, res, next) => {
    try {
        const { itemIds } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Item IDs array is required and must be non-empty'
            });
        }

        // Get all items and validate ownership
        const { ListItem, sequelize } = require('../models');
        const { Op } = require('sequelize');
        
        const transaction = await sequelize.transaction();
        try {
            const items = await ListItem.findAll({
                where: {
                    id: { [Op.in]: itemIds },
                    deleted: false
                },
                transaction
            });

            if (items.length === 0) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'No valid items found'
                });
            }

            // Check that user is the creator of all items
            const unauthorizedItems = items.filter(item => item.createdById !== userId);
            if (unauthorizedItems.length > 0) {
                await transaction.rollback();
                const unauthorizedIds = unauthorizedItems.map(item => item.id);
                return res.status(403).json({
                    success: false,
                    message: `You do not have permission to delete items: ${unauthorizedIds.join(', ')}`
                });
            }

            // Get the IDs of items that will actually be deleted
            const validItemIds = items.map(item => item.id);

            // Notify users who have marked these items as "gotten" before deleting
            await ListItemService.notifyUsersOfDeletedGottenItems(validItemIds, userId, transaction);

            // Soft delete all items (set deleted: true)
            const updatedCount = await ListItem.update(
                { deleted: true },
                {
                    where: {
                        id: { [Op.in]: validItemIds },
                        createdById: userId,
                        deleted: false
                    },
                    transaction
                }
            );

            await transaction.commit();

            res.status(200).json({
                success: true,
                message: `Successfully deleted ${updatedCount[0]} items`,
                deletedCount: updatedCount[0],
                requestedIds: itemIds
            });
        } catch (transactionError) {
            await transaction.rollback();
            throw transactionError;
        }
    } catch (error) {
        next(error);
    }
};

/**
 * Update deleteOnDate for multiple items
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateDeleteDate = async (req, res, next) => {
    try {
        const { itemIds, deleteOnDate } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Item IDs array is required and must be non-empty'
            });
        }

        // Validate deleteOnDate (can be null or a valid date)
        if (deleteOnDate !== null && deleteOnDate !== undefined && isNaN(Date.parse(deleteOnDate))) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format for deleteOnDate'
            });
        }

        // Get all items and validate ownership
        const ListItem = require('../models').ListItem;
        const items = await ListItem.findAll({
            where: {
                id: { [require('sequelize').Op.in]: itemIds },
                deleted: false
            }
        });

        if (items.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No valid items found'
            });
        }

        // Check that user is the creator of all items
        const unauthorizedItems = items.filter(item => item.createdById !== userId);
        if (unauthorizedItems.length > 0) {
            const unauthorizedIds = unauthorizedItems.map(item => item.id);
            return res.status(403).json({
                success: false,
                message: `You do not have permission to update items: ${unauthorizedIds.join(', ')}`
            });
        }

        // Update deleteOnDate for all items
        const updatedCount = await ListItem.update(
            { deleteOnDate: deleteOnDate },
            {
                where: {
                    id: { [require('sequelize').Op.in]: itemIds },
                    createdById: userId,
                    deleted: false
                }
            }
        );

        res.status(200).json({
            success: true,
            message: `Successfully updated deleteOnDate for ${updatedCount[0]} items`,
            updatedCount: updatedCount[0],
            deleteOnDate: deleteOnDate,
            requestedIds: itemIds
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Bulk update visibility settings for multiple items
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateVisibility = async (req, res, next) => {
    try {
        const { itemIds, visibleToGroups, visibleToUsers } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Item IDs array is required and must be non-empty'
            });
        }

        // Validate visibility arrays (can be null, undefined, or arrays)
        if (visibleToGroups !== null && visibleToGroups !== undefined && !Array.isArray(visibleToGroups)) {
            return res.status(400).json({
                success: false,
                message: 'visibleToGroups must be an array or null'
            });
        }

        if (visibleToUsers !== null && visibleToUsers !== undefined && !Array.isArray(visibleToUsers)) {
            return res.status(400).json({
                success: false,
                message: 'visibleToUsers must be an array or null'
            });
        }

        // At least one visibility field must be provided
        if (visibleToGroups === undefined && visibleToUsers === undefined) {
            return res.status(400).json({
                success: false,
                message: 'At least one visibility field (visibleToGroups or visibleToUsers) must be provided'
            });
        }

        // Get all items and validate ownership
        const ListItem = require('../models').ListItem;
        const items = await ListItem.findAll({
            where: {
                id: { [require('sequelize').Op.in]: itemIds },
                deleted: false
            }
        });

        if (items.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No valid items found'
            });
        }

        // Check that user is the creator of all items
        const unauthorizedItems = items.filter(item => item.createdById !== userId);
        if (unauthorizedItems.length > 0) {
            const unauthorizedIds = unauthorizedItems.map(item => item.id);
            return res.status(403).json({
                success: false,
                message: `You do not have permission to update items: ${unauthorizedIds.join(', ')}`
            });
        }

        // Build update object with only provided fields
        const updateData = {};
        if (visibleToGroups !== undefined) {
            updateData.visibleToGroups = visibleToGroups;
        }
        if (visibleToUsers !== undefined) {
            updateData.visibleToUsers = visibleToUsers;
        }

        // Update visibility for all items
        const updatedCount = await ListItem.update(
            updateData,
            {
                where: {
                    id: { [require('sequelize').Op.in]: itemIds },
                    createdById: userId,
                    deleted: false
                }
            }
        );

        res.status(200).json({
            success: true,
            message: `Successfully updated visibility for ${updatedCount[0]} items`,
            updatedCount: updatedCount[0],
            visibilityUpdate: updateData,
            requestedIds: itemIds
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Bulk update list assignments for multiple items
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateLists = async (req, res, next) => {
    try {
        const { itemIds, lists } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Item IDs array is required and must be non-empty'
            });
        }

        // Validate lists array (can be empty array or array of numbers)
        if (!Array.isArray(lists)) {
            return res.status(400).json({
                success: false,
                message: 'lists must be an array'
            });
        }

        // Validate that all list IDs are numbers
        const invalidListIds = lists.filter(id => typeof id !== 'number' || !Number.isInteger(id));
        if (invalidListIds.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'All list IDs must be integers'
            });
        }

        // Get all items and validate ownership
        const ListItem = require('../models').ListItem;
        const items = await ListItem.findAll({
            where: {
                id: { [require('sequelize').Op.in]: itemIds },
                deleted: false
            }
        });

        if (items.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No valid items found'
            });
        }

        // Check that user is the creator of all items
        const unauthorizedItems = items.filter(item => item.createdById !== userId);
        if (unauthorizedItems.length > 0) {
            const unauthorizedIds = unauthorizedItems.map(item => item.id);
            return res.status(403).json({
                success: false,
                message: `You do not have permission to update items: ${unauthorizedIds.join(', ')}`
            });
        }

        // If lists are provided, validate user has permission to add to those lists
        if (lists.length > 0) {
            const PermissionService = require('../services/permissionService');
            const permissionResult = await PermissionService.canUserAddToLists(userId, lists);
            if (!permissionResult.canAccess) {
                return res.status(403).json({
                    success: false,
                    message: `You do not have permission to add items to some of the specified lists`
                });
            }
        }

        // Update lists for all items
        const updatedCount = await ListItem.update(
            { lists: lists },
            {
                where: {
                    id: { [require('sequelize').Op.in]: itemIds },
                    createdById: userId,
                    deleted: false
                }
            }
        );

        res.status(200).json({
            success: true,
            message: `Successfully updated list assignments for ${updatedCount[0]} items`,
            updatedCount: updatedCount[0],
            lists: lists,
            requestedIds: itemIds
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Bulk add items to a list
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.bulkAddToList = async (req, res, next) => {
    try {
        // Validate input
        const { listId, itemIds } = req.body;

        if (!listId) {
            return res.status(400).json({
                success: false,
                message: 'List ID is required'
            });
        }

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'A non-empty array of item IDs is required'
            });
        }

        const userId = req.user.id;

        // Check if user can access this list
        const permissionResult = await PermissionService.canUserAccessList(userId, listId);
        if (!permissionResult.canAccess) {
            PermissionService.throwPermissionError(permissionResult);
        }

        const result = await ListItemService.bulkAddItemsToList(listId, itemIds);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        // Let the error middleware handle it
        next(error);
    }
};

/**
 * Get all non-deleted list items for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getMyItems = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const items = await ListItemService.getUserItems(userId);

        res.status(200).json({
            success: true,
            data: items
        });
    } catch (error) {
        // Let the error middleware handle it
        next(error);
    }
};

/**
 * Search for list items that the user has access to based on a query
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.searchAccessibleItems = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { query } = req.params;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required and cannot be empty'
            });
        }

        if (query.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters long'
            });
        }

        const results = await ListItemService.searchAccessibleItems(userId, query.trim());

        res.status(200).json({
            success: true,
            data: results,
            query: query.trim(),
            count: results.length
        });
    } catch (error) {
        // Let the error middleware handle it
        next(error);
    }
};

/**
 * Bulk update publicity and priority for multiple items
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.bulkUpdatePublicityPriority = async (req, res, next) => {
    try {
        const { items } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Items array is required and must be non-empty'
            });
        }

        // Validate each item has required fields
        for (const item of items) {
            if (!item.id || typeof item.id !== 'number') {
                return res.status(400).json({
                    success: false,
                    message: 'Each item must have a valid numeric id'
                });
            }

            if (item.hasOwnProperty('isPublic') && typeof item.isPublic !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    message: 'isPublic must be a boolean value'
                });
            }

            if (item.hasOwnProperty('priority') && typeof item.priority !== 'number') {
                return res.status(400).json({
                    success: false,
                    message: 'priority must be a number'
                });
            }

            // At least one field must be provided
            if (!item.hasOwnProperty('isPublic') && !item.hasOwnProperty('priority')) {
                return res.status(400).json({
                    success: false,
                    message: 'Each item must have at least one field to update (isPublic or priority)'
                });
            }
        }

        const result = await ListItemService.bulkUpdatePublicityPriority(userId, items);

        res.status(200).json({
            success: true,
            message: `Successfully updated ${result.updatedCount} items`,
            data: result
        });
    } catch (error) {
        next(error);
    }
};
