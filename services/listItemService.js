const { ListItem, List, sequelize } = require('../models'); // Adjust the path as per your project structure
const { ApiError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

class ListItemService {
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

    // Get a single list item by ID
    static async getItemById(id) {
        try {
            const item = await ListItem.findByPk(id);
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
}

module.exports = ListItemService;
