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

        const deletedItem = await ListItemService.deleteItem(id);
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

        // You could add user-specific filtering here
        // e.g., filter.userId = req.user.id;

        const items = await ListItemService.getAllItems(filter);
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
 * Get a list item by id
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const item = await ListItemService.getItemById(id);

        res.status(200).json({
            success: true,
            data: item
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
