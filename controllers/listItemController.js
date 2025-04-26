const ListItemService = require('../services/listItemService');
const ListService = require('../services/listService'); 
const { ApiError } = require('../middleware/errorHandler');

/**
 * Create a new list item
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.create = async (req, res, next) => {
    try {
        // Get the authenticated user's ID from PassportJS
        const createdById = req.user.id;

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
        
        const updatedItem = await ListItemService.updateItem(id, updates, userId);
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
        
        // First get the item to check ownership
        const item = await ListItemService.getItemById(id);
        
        // Check if the current user is the creator of the item
        if (String(item.createdById) !== String(userId)) {
            throw new ApiError('Unauthorized', {
                status: 403,
                errorType: 'UNAUTHORIZED',
                publicMessage: 'You do not have permission to delete this list item'
            });
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
        
        // You could add authorization check here if needed
        // For example, check if the user has access to the list this item belongs to
        
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