const { ListItem, List, Getting, GoInOn, sequelize } = require('../models'); // Adjust the path as per your project structure
const { ApiError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

class ListItemService {
    /**
     * Determine if a user has permission to view a list item
     * @param {Object} item - The list item to check
     * @param {number|string} userId - The ID of the user
     * @param {boolean} hasListAccess - Whether the user has access to the list this item belongs to
     * @returns {boolean} - True if the user can view the item, false otherwise
     */
    static canUserViewItem(item, userId, hasListAccess) {
        // User created the item
        if (String(item.createdById) === String(userId)) {
            return true;
        }
        
        // Item is explicitly shared with user
        if (item.visibleToUsers && item.visibleToUsers.includes(String(userId))) {
            return true;
        }
        
        // Item is public
        if (item.isPublic) {
            return true;
        }
        
        // Item inherits list visibility and user has access to the list
        if (item.matchListVisibility && hasListAccess) {
            return true;
        }
        
        return false;
    }
    // Create a new list item
    static async createItem(data) {
        const transaction = await sequelize.transaction();
        try {
            // Create the list item
            const newItem = await ListItem.create(data, { transaction });
            
            // If lists are provided, associate the item with those lists
            if (data.lists && Array.isArray(data.lists) && data.lists.length > 0) {
                // Get all specified lists
                const lists = await List.findAll({
                    where: { id: data.lists },
                    transaction
                });
                
                // Associate the new item with each list
                for (const list of lists) {
                    await list.addItem(newItem, { transaction });
                }
            }
            
            await transaction.commit();
            return newItem;
        } catch (error) {
            await transaction.rollback();
            console.error('Error creating ListItem:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to create list item', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to create list item. Please try again.'
            });
        }
    }

    // Get all list items (optionally filter by criteria)
    static async getAllItems(filter = {}) {
        try {
            const items = await ListItem.findAll({ where: filter });
            return items;
        } catch (error) {
            console.error('Error fetching ListItems:', error);
            throw new ApiError('Failed to fetch list items', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve list items. Please try again.'
            });
        }
    }
    
    // Get all non-deleted list items created by a specific user
    static async getUserItems(userId) {
        try {
            const items = await ListItem.findAll({
                where: {
                    createdById: userId,
                    deleted: false
                },
                order: [['createdAt', 'DESC']] // Most recent first
            });
            return items;
        } catch (error) {
            console.error('Error fetching user ListItems:', error);
            throw new ApiError('Failed to fetch user list items', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve your list items. Please try again.'
            });
        }
    }

    // Get a single list item by ID
    static async getItemById(id) {
        try {
            const item = await ListItem.findByPk(id, {
                include: [
                    {
                        model: Getting,
                        as: 'getting'
                    },
                    {
                        model: GoInOn,
                        as: 'goInOn'
                    }
                ]
            });
            if (!item) {
                throw new ApiError('ListItem not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The requested list item could not be found'
                });
            }
            return item;
        } catch (error) {
            console.error('Error fetching ListItem by ID:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to fetch list item', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve the list item. Please try again.'
            });
        }
    }

    // Update a list item by ID
    static async updateItem(id, updates, userId) {
        try {
            const item = await ListItem.findByPk(id);
            if (!item) {
                throw new ApiError('ListItem not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The list item you are trying to update could not be found'
                });
            }

            // Check if the current user is the creator of the item
            if (String(item.createdById) !== String(userId)) {
                throw new ApiError('Unauthorized', {
                    status: 403,
                    errorType: 'UNAUTHORIZED',
                    publicMessage: 'You do not have permission to update this list item'
                });
            }

            await item.update(updates);
            return item;
        } catch (error) {
            console.error('Error updating ListItem:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to update list item', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to update the list item. Please try again.'
            });
        }
    }

    // Delete a list item by ID (soft delete)
    static async deleteItem(id) {
        try {
            const item = await ListItem.findByPk(id);
            if (!item) {
                throw new ApiError('ListItem not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The list item you are trying to delete could not be found'
                });
            }
            await item.update({ deleted: true });
            return item;
        } catch (error) {
            console.error('Error deleting ListItem:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to delete list item', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to delete the list item. Please try again.'
            });
        }
    }

    // Permanently delete a list item
    static async forceDeleteItem(id) {
        try {
            const deletedItem = await ListItem.destroy({ where: { id } });
            if (!deletedItem) {
                throw new ApiError('ListItem not found or already deleted', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The list item you are trying to delete could not be found'
                });
            }
            return deletedItem;
        } catch (error) {
            console.error('Error force deleting ListItem:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to permanently delete list item', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to permanently delete the list item. Please try again.'
            });
        }
    }

    // Get all items for a user that are not in any list
    static async getItemsNotInAnyList(userId) {
        try {
            // Query to find items with no active lists
            const query = `
                SELECT li.*
                FROM "list_items" li
                LEFT JOIN "list_items_lists" lil ON li."id" = lil."itemId"
                LEFT JOIN "lists" l ON lil."listId" = l."id" AND (l."deleted" IS NULL OR l."deleted" = false)
                WHERE li."createdById" = :userId
                AND li."deleted" = false
                AND l."id" IS NULL
            `;
            
            const itemsNotInAnyList = await sequelize.query(query, {
                replacements: { userId },
                type: sequelize.QueryTypes.SELECT,
                model: ListItem,
                mapToModel: true
            });
            
            return itemsNotInAnyList;
        } catch (error) {
            console.error('Error fetching items not in any list:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to fetch items not in any list', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve items not in any list. Please try again.'
            });
        }
    }

    // Bulk add items to a list
    static async bulkAddItemsToList(listId, itemIds, userId) {
        const transaction = await sequelize.transaction();
        try {
            // Verify the list exists and user has permission to modify it
            const list = await List.findByPk(listId, { transaction });
            if (!list) {
                throw new ApiError('List not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The specified list could not be found'
                });
            }
            
            // Check if user is owner of the list
            if (String(list.ownerId) !== String(userId)) {
                throw new ApiError('Unauthorized', {
                    status: 403,
                    errorType: 'UNAUTHORIZED',
                    publicMessage: 'You do not have permission to add items to this list'
                });
            }
            
            // Get all items that exist and weren't deleted
            const items = await ListItem.findAll({
                where: {
                    id: {
                        [Op.in]: itemIds
                    },
                    deleted: false
                },
                transaction
            });
            
            if (items.length === 0) {
                throw new ApiError('No valid items found', {
                    status: 400,
                    errorType: 'BAD_REQUEST',
                    publicMessage: 'No valid items were found to add to the list'
                });
            }
            
            // Track which items were successfully added
            const results = {
                success: true,
                addedItems: [],
                failedItems: []
            };
            
            // Add each item to the list
            for (const item of items) {
                try {
                    // Check if item is already in the list
                    await list.addItem(item, { transaction });
                    
                    // Update the item's lists array if it doesn't already include this list
                    if (!item.lists || !item.lists.includes(list.id)) {
                        const updatedLists = item.lists ? [...item.lists, list.id] : [list.id];
                        await item.update({ lists: updatedLists }, { transaction });
                    }
                    
                    results.addedItems.push(item.id);
                } catch (error) {
                    console.error(`Error adding item ${item.id} to list:`, error);
                    results.failedItems.push({
                        id: item.id,
                        reason: 'Database error while adding item to list'
                    });
                }
            }
            
            await transaction.commit();
            return results;
        } catch (error) {
            await transaction.rollback();
            console.error('Error in bulkAddItemsToList:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to add items to list', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to add items to the list. Please try again.'
            });
        }
    }
}

module.exports = ListItemService;
