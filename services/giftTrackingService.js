const { ListItem, Contributor, User, sequelize, Proposal } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

class GiftTrackingService {
    // Get all items that the user is getting (purchased) or contributing to
    static async getTrackedGifts(userId) {
        try {
            // Find all items where the user is a contributor (getting or contributing)
            const contributedItems = await ListItem.findAll({
                include: [
                    {
                        model: Contributor,
                        as: 'contributors',
                        where: {
                            userId,
                            [Op.or]: [
                                { getting: true },
                                { contributing: true }
                            ]
                        },
                        required: true
                    }
                ],
                where: {
                    deleted: false
                }
            });

            return {
                success: true,
                data: contributedItems.map(item => ({
                    ...item.toJSON(),
                    trackingType: item.contributors[0].getting ? 'getting' : 'contributing'
                }))
            };
        } catch (error) {
            console.error('Error fetching tracked gifts:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to fetch tracked gifts', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve your tracked gifts. Please try again.'
            });
        }
    }

    /**
     * Save or update gift tracking information
     * @param {Object} trackingData - The gift tracking data to save
     * @returns {Object} The updated contributor record
     */
    static async saveGiftTracking(trackingData) {
        try {
            const { itemId, purchaserId, status, actualPrice } = trackingData;

            // Verify the list item exists
            const listItem = await ListItem.findByPk(itemId);
            if (!listItem) {
                throw new ApiError('List item not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The list item was not found.'
                });
            }

            // Find the contributor record for this user and item
            let contributor = await Contributor.findOne({
                where: {
                    itemId,
                    userId: purchaserId
                }
            });

            if (!contributor) {
                throw new ApiError('Contributor record not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'You are not a contributor to this item.'
                });
            }

            // Update the contributor record with status and actualPrice
            const updateData = {};
            if (status !== undefined) updateData.status = status;
            if (actualPrice !== undefined) updateData.actualPrice = actualPrice;

            await contributor.update(updateData);

            return {
                success: true,
                data: contributor
            };
        } catch (error) {
            console.error('Error saving gift tracking:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to save gift tracking', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to save gift tracking information. Please try again.'
            });
        }
    }

    /**
     * Get all items that the current user is getting (purchasing for others)
     * @param {number} userId - The ID of the current user
     * @returns {Object} Object containing success status and data with contributors, item data, and all contributors
     */
    static async getItemsUserIsGetting(userId) {
        try {
            // Find all contributors where the user is getting items
            const contributors = await Contributor.findAll({
                where: {
                    userId: userId,
                    getting: true
                },
                include: [
                    {
                        model: ListItem,
                        as: 'item',
                        where: {
                            deleted: false
                        },
                        required: true
                    }
                ]
            });

            // Get all item IDs for querying all contributors
            const itemIds = contributors.map(contributor => contributor.itemId);

            // Get all contributors for these items with user information
            let allContributors = [];
            if (itemIds.length > 0) {
                allContributors = await Contributor.findAll({
                    where: {
                        itemId: {
                            [Op.in]: itemIds
                        }
                    },
                    include: [
                        {
                            model: User,
                            as: 'user',
                            attributes: ['id', 'name', 'email', 'image'] // Only include necessary user fields
                        }
                    ]
                });
            }

            // Create map for quick lookup of contributors by item
            const contributorsMap = {};
            allContributors.forEach(contributor => {
                if (!contributorsMap[contributor.itemId]) {
                    contributorsMap[contributor.itemId] = [];
                }
                contributorsMap[contributor.itemId].push(contributor.toJSON());
            });

            // Format the results with contributor data as primary, and nested item data and all contributors
            const formattedData = contributors.map(contributor => {
                const contributorJson = contributor.toJSON();

                // Extract the item data
                const itemData = contributorJson.item;
                delete contributorJson.item;

                // Get all contributors for this item
                const itemContributors = contributorsMap[contributor.itemId] || [];

                // Return the restructured object
                return {
                    ...contributorJson,
                    itemData: itemData,
                    contributors: itemContributors
                };
            });

            return {
                success: true,
                data: formattedData
            };
        } catch (error) {
            console.error('Error fetching items user is getting:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to fetch items user is getting', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve items you are getting. Please try again.'
            });
        }
    }

    /**
     * Bulk save or update gift tracking information for multiple items
     * @param {Array} trackingDataArray - Array of tracking data objects
     * @param {number} userId - The ID of the user making the updates
     * @returns {Object} Results of the bulk update operation
     */
    static async bulkSaveGiftTracking(trackingDataArray, userId) {
        const transaction = await sequelize.transaction();
        try {
            if (!Array.isArray(trackingDataArray) || trackingDataArray.length === 0) {
                throw new ApiError('Invalid data format', {
                    status: 400,
                    errorType: 'INVALID_INPUT',
                    publicMessage: 'Expected an array of tracking data objects.'
                });
            }

            const results = [];
            const errors = [];

            for (let i = 0; i < trackingDataArray.length; i++) {
                try {
                    const trackingData = trackingDataArray[i];
                    const { rowId, status, numberGetting, actualPrice, type } = trackingData;

                    if (!rowId) {
                        errors.push({
                            index: i,
                            rowId: rowId || 'unknown',
                            error: 'rowId is required'
                        });
                        continue;
                    }

                    // Find the contributor record by ID and verify it belongs to the current user
                    if(type === 'getting') {
                        let contributor = await Contributor.findOne({
                            where: {
                                id: rowId,
                                userId: userId
                            },
                            transaction
                        });

                        if (!contributor) {
                            errors.push({
                                index: i,
                                rowId,
                                error: 'Contributor record not found or you do not have permission to update it'
                            });
                            continue;
                        }

                        const updateData = {};
                        if (status !== undefined) updateData.status = status;
                        if (numberGetting !== undefined) updateData.numberGetting = numberGetting;
                        if (actualPrice !== undefined) updateData.actualPrice = actualPrice;

                        await contributor.update(updateData, { transaction });

                        results.push({
                            index: i,
                            rowId,
                            success: true,
                            data: contributor.toJSON()
                        });
                    }

                    if(type === 'proposal') {
                        let proposal = await Proposal.findOne({
                            where: {
                                id: rowId,
                            },
                            transaction
                        });

                        if (!proposal) {
                            errors.push({
                                index: i,
                                rowId,
                                error: 'Proposal record not found or you do not have permission to update it'
                            });
                            continue;
                        }

                        const updateData = {};
                        if (status !== undefined) updateData.status = status;

                        await proposal.update(updateData, { transaction });

                        results.push({
                            index: i,
                            rowId,
                            success: true,
                            data: proposal.toJSON()
                        });
                    }




                } catch (itemError) {
                    console.error(`Error processing item at index ${i}:`, itemError);
                    errors.push({
                        index: i,
                        rowId: trackingDataArray[i]?.rowId || 'unknown',
                        error: itemError.message || 'Unknown error occurred'
                    });
                }
            }

            await transaction.commit();

            // Determine overall success based on whether we have any errors
            const overallSuccess = errors.length === 0;
            const message = errors.length === 0
                ? `Successfully updated ${results.length} items`
                : `Updated ${results.length} items with ${errors.length} errors`;

            return {
                success: overallSuccess,
                message: message,
                data: {
                    successCount: results.length,
                    errorCount: errors.length,
                    results,
                    errors
                }
            };
        } catch (error) {
            await transaction.rollback();
            console.error('Error in bulk save gift tracking:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to bulk save gift tracking', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to save gift tracking information. Please try again.'
            });
        }
    }
}

module.exports = GiftTrackingService;
