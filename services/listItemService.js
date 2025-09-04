const { ListItem, List, Getting, GoInOn, ItemLink, sequelize } = require('../models'); // Adjust the path as per your project structure
const { ApiError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');
const NotificationService = require('./notificationService');

class ListItemService {
    // Create a new list item
    static async createItem(data) {
        const transaction = await sequelize.transaction();
        try {
            // Extract itemLinks from data if provided
            const { itemLinks, ...itemData } = data;

            // Create the list item
            const newItem = await ListItem.create(itemData, { transaction });

            // Create ItemLink records if provided
            if (itemLinks && Array.isArray(itemLinks) && itemLinks.length > 0) {
                console.log(itemLinks);
                const linkPromises = itemLinks.map(link =>
                    ItemLink.create({
                        itemId: newItem.id,
                        label: link.label,
                        url: link.url
                    }, { transaction })
                );

                await Promise.all(linkPromises);
            }

            await transaction.commit();

            // Return the item with its links
            const itemWithLinks = await ListItem.findByPk(newItem.id, {
                include: [
                    {
                        model: ItemLink,
                        as: 'itemLinks'
                    }
                ]
            });

            return itemWithLinks;
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

    // Bulk create multiple list items
    static async bulkCreateItems(itemsData, listIds = [], createdById) {
        const transaction = await sequelize.transaction();
        try {
            // Validate input
            if (!Array.isArray(itemsData) || itemsData.length === 0) {
                throw new ApiError('Items data must be a non-empty array', {
                    status: 400,
                    errorType: 'INVALID_INPUT',
                    publicMessage: 'Items data is required and must be an array'
                });
            }

            // Separate itemLinks from items data and prepare items
            const preparedItems = itemsData.map(item => {
                const { itemLinks, ...itemData } = item;
                return {
                    ...itemData,
                    createdById,
                    lists: listIds.length > 0 ? listIds : (item.lists || null)
                };
            });

            // Bulk create the list items
            const createdItems = await ListItem.bulkCreate(preparedItems, {
                transaction,
                returning: true
            });


            // Create ItemLink records for each item if provided
            const allItemLinks = [];
            for (let i = 0; i < itemsData.length; i++) {
                const originalItem = itemsData[i];
                const createdItem = createdItems[i];

                if (originalItem.itemLinks && Array.isArray(originalItem.itemLinks) && originalItem.itemLinks.length > 0) {
                    const itemLinks = originalItem.itemLinks.map(link => ({
                        itemId: createdItem.id,
                        label: link.label,
                        url: link.url,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }));

                    allItemLinks.push(...itemLinks);
                }
            }

            // Bulk create all ItemLink records
            if (allItemLinks.length > 0) {
                await ItemLink.bulkCreate(allItemLinks, { transaction });
            }

            await transaction.commit();

            // Get the created items with their links
            const itemsWithLinks = await ListItem.findAll({
                where: {
                    id: createdItems.map(item => item.id)
                },
                include: [
                    {
                        model: ItemLink,
                        as: 'itemLinks'
                    }
                ],
                order: [['createdAt', 'DESC']]
            });

            // Get the actual lists from the created items for response
            const actualAssociatedLists = createdItems.length > 0 && createdItems[0].lists ? createdItems[0].lists : null;

            return {
                success: true,
                items: itemsWithLinks,
                count: itemsWithLinks.length,
                associatedWithLists: actualAssociatedLists
            };
        } catch (error) {
            await transaction.rollback();
            console.error('Error bulk creating ListItems:', error);

            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to bulk create list items', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to create list items. Please try again.'
            });
        }
    }

    // Get all list items (optionally filter by criteria)
    static async getAllItems(filter = {}) {
        try {
            const items = await ListItem.findAll({
                where: filter,
                include: [
                    {
                        model: Getting,
                        as: 'getting'
                    },
                    {
                        model: GoInOn,
                        as: 'goInOn'
                    },
                    {
                        model: ItemLink,
                        as: 'itemLinks'
                    }
                ],
                order: [['createdAt', 'DESC']]
            });
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
                include: [
                    {
                        model: ItemLink,
                        as: 'itemLinks'
                    }
                ],
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
                    },
                    {
                        model: ItemLink,
                        as: 'itemLinks'
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
    static async updateItem(id, updates) {
        const transaction = await sequelize.transaction();
        try {
            const item = await ListItem.findByPk(id, { transaction });
            if (!item) {
                throw new ApiError('ListItem not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The list item you are trying to update could not be found'
                });
            }

            // Extract itemLinks from updates if provided
            const { itemLinks, ...itemData } = updates;

            // Update the list item
            await item.update(itemData, { transaction });

            // Handle ItemLink records if provided
            if (itemLinks !== undefined) {
                // Delete existing links
                await ItemLink.destroy({
                    where: { itemId: id },
                    transaction
                });

                // Create new ItemLink records if provided
                if (Array.isArray(itemLinks) && itemLinks.length > 0) {
                    const linkPromises = itemLinks.map(link =>
                        ItemLink.create({
                            itemId: item.id,
                            label: link.label,
                            url: link.url
                        }, { transaction })
                    );
                    await Promise.all(linkPromises);
                }
            }

            await transaction.commit();
            return item;
        } catch (error) {
            await transaction.rollback();
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
        const transaction = await sequelize.transaction();
        try {
            const item = await ListItem.findByPk(id, { transaction });
            if (!item) {
                throw new ApiError('ListItem not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The list item you are trying to delete could not be found'
                });
            }

            await this.notifyUsersOfDeletedGottenItems([id], transaction);

            await item.update({ deleted: true }, { transaction });
            await transaction.commit();
            return item;
        } catch (error) {
            await transaction.rollback();
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

            // Get the IDs and fetch with includes
            const itemIds = itemsNotInAnyList.map(item => item.id);

            if (itemIds.length === 0) {
                return [];
            }

            const itemsWithLinks = await ListItem.findAll({
                where: {
                    id: itemIds
                },
                include: [
                    {
                        model: ItemLink,
                        as: 'itemLinks'
                    }
                ],
                order: [['createdAt', 'DESC']]
            });

            return itemsWithLinks;
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
    static async bulkAddItemsToList(listId, itemIds) {
        const transaction = await sequelize.transaction();
        try {
            // Get the list
            const list = await List.findByPk(listId, { transaction });
            if (!list) {
                throw new ApiError('List not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The specified list could not be found'
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

            // Add each item to the list by updating the lists array
            for (const item of items) {
                try {
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

    // Bulk update publicity and priority for multiple items
    static async bulkUpdatePublicityPriority(userId, itemUpdates) {
        const transaction = await sequelize.transaction();
        try {
            // Get all item IDs from the updates
            const itemIds = itemUpdates.map(item => item.id);

            // Get all items and validate ownership
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
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'No valid items were found to update'
                });
            }

            // Check that user is the creator of all items
            const unauthorizedItems = items.filter(item => item.createdById !== userId);
            if (unauthorizedItems.length > 0) {
                const unauthorizedIds = unauthorizedItems.map(item => item.id);
                throw new ApiError(`You do not have permission to update items: ${unauthorizedIds.join(', ')}`, {
                    status: 403,
                    errorType: 'UNAUTHORIZED',
                    publicMessage: 'You do not have permission to update some of the specified items'
                });
            }

            // Track results
            const results = {
                success: true,
                updatedItems: [],
                failedItems: [],
                updatedCount: 0
            };

            // Update each item with its specific changes
            for (const updateItem of itemUpdates) {
                try {
                    // Find the corresponding item
                    const item = items.find(i => i.id === updateItem.id);
                    if (!item) {
                        results.failedItems.push({
                            id: updateItem.id,
                            reason: 'Item not found'
                        });
                        continue;
                    }

                    // Build update object with only provided fields
                    const updateData = {};
                    if (updateItem.hasOwnProperty('isPublic')) {
                        updateData.isPublic = updateItem.isPublic;
                    }
                    if (updateItem.hasOwnProperty('priority')) {
                        updateData.priority = updateItem.priority;
                    }

                    // Update the item
                    await item.update(updateData, { transaction });

                    results.updatedItems.push({
                        id: updateItem.id,
                        updated: updateData
                    });
                    results.updatedCount++;
                } catch (error) {
                    console.error(`Error updating item ${updateItem.id}:`, error);
                    results.failedItems.push({
                        id: updateItem.id,
                        reason: 'Database error while updating item'
                    });
                }
            }

            await transaction.commit();
            return results;
        } catch (error) {
            await transaction.rollback();
            console.error('Error in bulkUpdatePublicityPriority:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to bulk update publicity and priority', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to update the items. Please try again.'
            });
        }
    }

    // Search for list items that the user has access to based on a query
    static async searchAccessibleItems(userId, query) {
        try {
            const PermissionService = require('./permissionService');

            // Search items by name, notes, or description that match the query
            const searchPattern = `%${query}%`;

            const items = await ListItem.findAll({
                where: {
                    [Op.and]: [
                        { deleted: false },
                        {
                            [Op.or]: [
                                { name: { [Op.iLike]: searchPattern } },
                            ]
                        },
                    ]
                },
                order: [['createdAt', 'DESC']]
            });

            const accessibleItems = [];

            for (const item of items) {
                const canView = await PermissionService.canUserViewItem(item, userId, true);

                if (canView) {
                    // Filter gotten/goInOn data based on permissions
                    const canSeeGotten = PermissionService.canUserSeeGotten(item, userId);

                    if (!canSeeGotten) {
                        // Remove sensitive data if user can't see it
                        const { getting, goInOn, ...filteredItem } = item.toJSON();
                        accessibleItems.push(filteredItem);
                    } else {
                        accessibleItems.push(item);
                    }
                }
            }

            return accessibleItems;
        } catch (error) {
            console.error('Error searching accessible items:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to search list items', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to search list items. Please try again.'
            });
        }
    }

    /**
     * Clean up expired list items where deleteOnDate has passed
     * @returns {Promise<number>} Number of items cleaned up
     */
    static async cleanupExpiredItems() {
        try {
            const currentDate = new Date();

            // Find items where deleteOnDate is set and has passed, and not already deleted
            const expiredItems = await ListItem.findAll({
                where: {
                    deleteOnDate: {
                        [Op.lte]: currentDate,
                        [Op.ne]: null
                    },
                    deleted: false
                },
                attributes: ['id', 'name', 'deleteOnDate']
            });

            if (expiredItems.length === 0) {
                console.log('No expired items found for cleanup');
                return 0;
            }

            console.log(`Found ${expiredItems.length} expired items to clean up`);

            // Soft delete the expired items
            const result = await ListItem.update(
                { deleted: true },
                {
                    where: {
                        id: {
                            [Op.in]: expiredItems.map(item => item.id)
                        }
                    }
                }
            );

            const cleanedCount = result[0];
            console.log(`Successfully cleaned up ${cleanedCount} expired list items`);

            // Log details of cleaned items (for debugging/monitoring)
            expiredItems.forEach(item => {
                console.log(`Cleaned up item: ${item.name} (ID: ${item.id}, deleteOnDate: ${item.deleteOnDate})`);
            });

            return cleanedCount;
        } catch (error) {
            console.error('Error cleaning up expired list items:', error);
            throw new ApiError('Failed to cleanup expired items', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to cleanup expired items. Please try again.'
            });
        }
    }

    // Helper function to notify users when items they've marked as "gotten" are deleted
    static async notifyUsersOfDeletedGottenItems(itemIds, transaction = null) {
        try {
            // Find all Getting records for the items being deleted
            const recordsToNotify = await Getting.findAll({
                where: {
                    itemId: { [Op.in]: itemIds }
                },
                include: [
                    {
                        model: ListItem,
                        as: 'item',
                        attributes: ['id', 'name']
                    }
                ],
                transaction
            });

            // Create notifications for each affected user
            for (const record of recordsToNotify) {
                const itemName = record.item ? record.item.name : 'Unknown item';
                await NotificationService.createNotification({
                    message: `An item you marked as 'gotten' has been deleted: ${itemName}`,
                    notificationType: 'gotten_item_deleted',
                    userId: record.giverId, // Send notification to the person who marked it as gotten
                    metadata: {
                        itemId: record.itemId,
                        itemName: itemName,
                        giverId: record.giverId
                    }
                });
            }

            return recordsToNotify.length;
        } catch (error) {
            console.error('Error notifying users of deleted gotten items:', error);
            // Don't throw - notifications are not critical to the delete operation
            return 0;
        }
    }
}

module.exports = ListItemService;
