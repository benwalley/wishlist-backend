const { ItemLink, ListItem, sequelize } = require('../models');
const { ApiError } = require('../middleware/errorHandler');

class ItemLinkService {
    /**
     * Create a new item link
     * @param {Object} data - Link data
     * @param {number} data.itemId - ID of the associated list item
     * @param {string} data.label - Label for the link
     * @param {string} data.url - URL for the link
     * @returns {Promise<ItemLink>} The created link
     */
    static async createLink(data) {
        try {
            // Validate that the item exists
            const item = await ListItem.findByPk(data.itemId);
            if (!item) {
                throw new ApiError('List item not found', {
                    status: 404,
                    errorType: 'ITEM_NOT_FOUND',
                    publicMessage: 'The specified list item does not exist'
                });
            }

            // Create the link
            const newLink = await ItemLink.create(data);
            return newLink;
        } catch (error) {
            console.error('Error creating item link:', error);
            
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to create item link', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to create the item link. Please try again.'
            });
        }
    }

    /**
     * Get all links for a specific item
     * @param {number} itemId - ID of the list item
     * @returns {Promise<ItemLink[]>} Array of item links
     */
    static async getLinksByItemId(itemId) {
        try {
            const links = await ItemLink.findAll({
                where: { itemId },
                order: [['createdAt', 'ASC']],
                include: [
                    {
                        model: ListItem,
                        as: 'item',
                        attributes: ['id', 'name']
                    }
                ]
            });

            return links;
        } catch (error) {
            console.error('Error fetching item links:', error);
            throw new ApiError('Failed to fetch item links', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve item links. Please try again.'
            });
        }
    }

    /**
     * Get a single link by ID
     * @param {number} linkId - ID of the link
     * @returns {Promise<ItemLink>} The item link
     */
    static async getLinkById(linkId) {
        try {
            const link = await ItemLink.findByPk(linkId, {
                include: [
                    {
                        model: ListItem,
                        as: 'item',
                        attributes: ['id', 'name', 'createdById']
                    }
                ]
            });

            if (!link) {
                throw new ApiError('Item link not found', {
                    status: 404,
                    errorType: 'LINK_NOT_FOUND',
                    publicMessage: 'The requested item link could not be found'
                });
            }

            return link;
        } catch (error) {
            console.error('Error fetching item link by ID:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to fetch item link', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve the item link. Please try again.'
            });
        }
    }

    /**
     * Update an item link
     * @param {number} linkId - ID of the link to update
     * @param {Object} updates - Fields to update
     * @param {number} userId - ID of the user making the update (for authorization)
     * @returns {Promise<ItemLink>} The updated link
     */
    static async updateLink(linkId, updates, userId) {
        try {
            const link = await ItemLink.findByPk(linkId, {
                include: [
                    {
                        model: ListItem,
                        as: 'item',
                        attributes: ['id', 'createdById']
                    }
                ]
            });

            if (!link) {
                throw new ApiError('Item link not found', {
                    status: 404,
                    errorType: 'LINK_NOT_FOUND',
                    publicMessage: 'The item link you are trying to update could not be found'
                });
            }

            // Check if user has permission to update (must be item owner)
            if (String(link.item.createdById) !== String(userId)) {
                throw new ApiError('Unauthorized', {
                    status: 403,
                    errorType: 'UNAUTHORIZED',
                    publicMessage: 'You do not have permission to update this item link'
                });
            }

            await link.update(updates);
            return link;
        } catch (error) {
            console.error('Error updating item link:', error);
            
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to update item link', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to update the item link. Please try again.'
            });
        }
    }

    /**
     * Delete an item link
     * @param {number} linkId - ID of the link to delete
     * @param {number} userId - ID of the user making the deletion (for authorization)
     * @returns {Promise<ItemLink>} The deleted link
     */
    static async deleteLink(linkId, userId) {
        try {
            const link = await ItemLink.findByPk(linkId, {
                include: [
                    {
                        model: ListItem,
                        as: 'item',
                        attributes: ['id', 'createdById']
                    }
                ]
            });

            if (!link) {
                throw new ApiError('Item link not found', {
                    status: 404,
                    errorType: 'LINK_NOT_FOUND',
                    publicMessage: 'The item link you are trying to delete could not be found'
                });
            }

            // Check if user has permission to delete (must be item owner)
            if (String(link.item.createdById) !== String(userId)) {
                throw new ApiError('Unauthorized', {
                    status: 403,
                    errorType: 'UNAUTHORIZED',
                    publicMessage: 'You do not have permission to delete this item link'
                });
            }

            await link.destroy();
            return link;
        } catch (error) {
            console.error('Error deleting item link:', error);
            
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to delete item link', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to delete the item link. Please try again.'
            });
        }
    }
}

module.exports = ItemLinkService;