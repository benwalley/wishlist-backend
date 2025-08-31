const { ListItem, Getting, GoInOn, sequelize, Proposal, User, Contributor, EventRecipient, Event } = require('../models');
const UserService = require('./userService');
const NotificationService = require('./notificationService');
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
     * Bulk save or update gift tracking information for multiple items and event recipients
     * @param {Object} data - Object containing changedItems and changedRecipients arrays
     * @param {number} userId - The ID of the user making the updates
     * @returns {Object} Results of the bulk update operation
     */
    static async bulkSaveGiftTracking(data, userId) {
        const transaction = await sequelize.transaction();
        try {
            const { changedItems = [], changedRecipients = [] } = data;

            if (!Array.isArray(changedItems) || !Array.isArray(changedRecipients)) {
                throw new ApiError('Invalid data format', {
                    status: 400,
                    errorType: 'INVALID_INPUT',
                    publicMessage: 'Expected changedItems and changedRecipients to be arrays.'
                });
            }

            const itemResults = [];
            const recipientResults = [];
            const itemErrors = [];
            const recipientErrors = [];

            // Process changed items (Getting records)
            for (let i = 0; i < changedItems.length; i++) {
                try {
                    const trackingData = changedItems[i];
                    const { rowId, status, numberGetting, actualPrice} = trackingData;

                    if (!rowId) {
                        itemErrors.push({
                            index: i,
                            rowId: rowId || 'unknown',
                            error: 'rowId is required'
                        });
                        continue;
                    }

                    let getting = await Getting.findOne({
                        where: {
                            id: rowId,
                            giverId: userId
                        },
                        transaction
                    });

                    if (!getting) {
                        itemErrors.push({
                            index: i,
                            rowId,
                            error: 'Getting record not found or you do not have permission to update it'
                        });
                        continue;
                    }

                    const updateData = {};
                    if (status !== undefined) updateData.status = status;
                    if (numberGetting !== undefined) updateData.numberGetting = numberGetting;
                    if (actualPrice !== undefined) updateData.actualPrice = actualPrice;

                    await getting.update(updateData, { transaction });

                    itemResults.push({
                        index: i,
                        rowId,
                        success: true,
                        data: getting.toJSON()
                    });

                } catch (itemError) {
                    console.error(`Error processing item at index ${i}:`, itemError);
                    itemErrors.push({
                        index: i,
                        rowId: changedItems[i]?.rowId || 'unknown',
                        error: itemError.message || 'Unknown error occurred'
                    });
                }
            }

            // Process changed recipients (EventRecipient records)
            for (let i = 0; i < changedRecipients.length; i++) {
                try {
                    const recipientData = changedRecipients[i];
                    const { recipientId, status, note } = recipientData;

                    if (!recipientId) {
                        recipientErrors.push({
                            index: i,
                            recipientId: recipientId || 'unknown',
                            error: 'recipientId is required'
                        });
                        continue;
                    }

                    // Find the recipient and check if user has access to the event
                    const recipient = await EventRecipient.findByPk(recipientId, {
                        include: [{
                            model: Event,
                            as: 'event'
                        }],
                        transaction
                    });

                    if (!recipient) {
                        recipientErrors.push({
                            index: i,
                            recipientId,
                            error: 'Recipient not found'
                        });
                        continue;
                    }

                    // Check if user has access to the event (owner or viewer)
                    const hasAccess = recipient.event.ownerId === userId ||
                                     (recipient.event.viewerIds && recipient.event.viewerIds.includes(userId));

                    if (!hasAccess) {
                        recipientErrors.push({
                            index: i,
                            recipientId,
                            error: 'You do not have permission to update this recipient'
                        });
                        continue;
                    }

                    // Update recipient
                    const updateData = {};
                    if (note !== undefined) updateData.note = note;
                    if (status !== undefined) updateData.status = status;

                    await recipient.update(updateData, { transaction });

                    recipientResults.push({
                        index: i,
                        recipientId,
                        success: true,
                        data: recipient.toJSON()
                    });

                } catch (recipientError) {
                    console.error(`Error processing recipient at index ${i}:`, recipientError);
                    recipientErrors.push({
                        index: i,
                        recipientId: changedRecipients[i]?.recipientId || 'unknown',
                        error: recipientError.message || 'Unknown error occurred'
                    });
                }
            }

            await transaction.commit();

            // Determine overall success based on whether we have any errors
            const totalErrors = itemErrors.length + recipientErrors.length;
            const totalSuccesses = itemResults.length + recipientResults.length;
            const overallSuccess = totalErrors === 0;

            let message = '';
            if (overallSuccess) {
                message = `Successfully updated ${itemResults.length} items and ${recipientResults.length} recipients`;
            } else {
                message = `Updated ${totalSuccesses} records with ${totalErrors} errors`;
            }

            return {
                success: overallSuccess,
                message: message,
                data: {
                    successCount: totalSuccesses,
                    errorCount: totalErrors,
                    itemResults,
                    recipientResults,
                    itemErrors,
                    recipientErrors
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

    /**
     * Bulk update getting records - create, update, or delete based on qty
     * @param {Array} gettingDataArray - Array of getting data objects
     * @param {number} currentUserId - The ID of the authenticated user
     * @returns {Object} Results of the bulk update operation
     */
    static async bulkUpdateGetting(gettingDataArray, currentUserId) {
        const transaction = await sequelize.transaction();
        try {
            if (!Array.isArray(gettingDataArray) || gettingDataArray.length === 0) {
                throw new ApiError('Invalid data format', {
                    status: 400,
                    errorType: 'INVALID_INPUT',
                    publicMessage: 'Expected an array of getting data objects.'
                });
            }

            const results = [];
            const errors = [];
            const validatedGiverIds = new Set(); // Cache validated giver IDs

            for (let i = 0; i < gettingDataArray.length; i++) {
                try {
                    const gettingData = gettingDataArray[i];
                    const { giverId, itemId, getterId, numberGetting, actualPrice, status } = gettingData;

                    if (!giverId || !itemId || !getterId) {
                        errors.push({
                            index: i,
                            itemId: itemId || 'unknown',
                            getterId: getterId || 'unknown',
                            giverId: giverId || 'unknown',
                            error: 'giverId, itemId and getterId are required'
                        });
                        continue;
                    }

                    // Validate giverId only if not already validated
                    if (!validatedGiverIds.has(giverId)) {
                        if (giverId !== currentUserId) {
                            const giverUser = await User.findByPk(giverId, { transaction });
                            if (!giverUser || giverUser.parentId !== currentUserId) {
                                errors.push({
                                    index: i,
                                    itemId,
                                    getterId,
                                    giverId,
                                    error: 'You can only create getting records for yourself or your subusers'
                                });
                                continue;
                            }
                        }
                        validatedGiverIds.add(giverId);
                    }

                    // Verify the list item exists
                    const listItem = await ListItem.findByPk(itemId, { transaction });
                    if (!listItem) {
                        errors.push({
                            index: i,
                            itemId,
                            getterId,
                            giverId,
                            error: 'List item not found'
                        });
                        continue;
                    }

                    // Find existing getting record
                    let gettingRecord = await Getting.findOne({
                        where: {
                            giverId,
                            getterId,
                            itemId
                        },
                        transaction
                    });

                    if (numberGetting === 0 || numberGetting === '0') {
                        // Delete existing record if numberGetting is 0
                        if (gettingRecord) {
                            await gettingRecord.destroy({ transaction });
                            results.push({
                                index: i,
                                itemId,
                                getterId,
                                giverId,
                                action: 'deleted',
                                success: true
                            });
                        } else {
                            results.push({
                                index: i,
                                itemId,
                                getterId,
                                giverId,
                                action: 'no_action',
                                success: true,
                                message: 'No existing record to delete'
                            });
                        }
                    } else {
                        // Create or update record
                        const gettingDataToSave = {
                            giverId,
                            getterId,
                            itemId,
                            numberGetting: numberGetting || 1,
                            actualPrice: actualPrice || 0,
                            status: status || 'pending'
                        };

                        if (gettingRecord) {
                            // Update existing record
                            await gettingRecord.update(gettingDataToSave, { transaction });
                            results.push({
                                index: i,
                                itemId,
                                getterId,
                                giverId,
                                action: 'updated',
                                success: true,
                                data: gettingRecord.toJSON()
                            });
                        } else {
                            // Create new record
                            const newGettingRecord = await Getting.create(gettingDataToSave, { transaction });
                            results.push({
                                index: i,
                                itemId,
                                getterId,
                                giverId,
                                action: 'created',
                                success: true,
                                data: newGettingRecord.toJSON()
                            });
                        }
                    }
                } catch (itemError) {
                    console.error(`Error processing getting item at index ${i}:`, itemError);
                    errors.push({
                        index: i,
                        itemId: gettingDataArray[i]?.itemId || 'unknown',
                        getterId: gettingDataArray[i]?.getterId || 'unknown',
                        giverId: gettingDataArray[i]?.giverId || 'unknown',
                        error: itemError.message || 'Unknown error occurred'
                    });
                }
            }

            await transaction.commit();

            // Determine overall success based on whether we have any errors
            const overallSuccess = errors.length === 0;
            const message = errors.length === 0
                ? `Successfully processed ${results.length} getting records`
                : `Processed ${results.length} records with ${errors.length} errors`;

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
            console.error('Error in bulk update getting:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to bulk update getting records', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to update getting records. Please try again.'
            });
        }
    }

    /**
     * Bulk update go_in_on records - create or delete based on participation
     * @param {Array} goInOnDataArray - Array of go_in_on data objects
     * @param {number} currentUserId - The ID of the authenticated user
     * @returns {Object} Results of the bulk update operation
     */
    static async bulkUpdateGoInOn(goInOnDataArray, currentUserId) {
        const transaction = await sequelize.transaction();
        try {
            if (!Array.isArray(goInOnDataArray) || goInOnDataArray.length === 0) {
                throw new ApiError('Invalid data format', {
                    status: 400,
                    errorType: 'INVALID_INPUT',
                    publicMessage: 'Expected an array of go_in_on data objects.'
                });
            }

            const results = [];
            const errors = [];
            const validatedGiverIds = new Set(); // Cache validated giver IDs

            for (let i = 0; i < goInOnDataArray.length; i++) {
                try {
                    const goInOnData = goInOnDataArray[i];
                    const { giverId, itemId, getterId, participating } = goInOnData;

                    if (!giverId || !itemId || !getterId) {
                        errors.push({
                            index: i,
                            itemId: itemId || 'unknown',
                            getterId: getterId || 'unknown',
                            giverId: giverId || 'unknown',
                            error: 'giverId, itemId and getterId are required'
                        });
                        continue;
                    }

                    // Validate giverId only if not already validated
                    if (!validatedGiverIds.has(giverId)) {
                        if (giverId !== currentUserId) {
                            const giverUser = await User.findByPk(giverId, { transaction });
                            if (!giverUser || giverUser.parentId !== currentUserId) {
                                errors.push({
                                    index: i,
                                    itemId,
                                    getterId,
                                    giverId,
                                    error: 'You can only create go_in_on records for yourself or your subusers'
                                });
                                continue;
                            }
                        }
                        validatedGiverIds.add(giverId);
                    }

                    // Verify the list item exists
                    const listItem = await ListItem.findByPk(itemId, { transaction });
                    if (!listItem) {
                        errors.push({
                            index: i,
                            itemId,
                            getterId,
                            giverId,
                            error: 'List item not found'
                        });
                        continue;
                    }

                    // Find existing go_in_on record
                    let goInOnRecord = await GoInOn.findOne({
                        where: {
                            giverId,
                            getterId,
                            itemId
                        },
                        transaction
                    });

                    if (participating === false || participating === 'false' || participating === 0) {
                        // Delete existing record if not participating
                        if (goInOnRecord) {
                            await goInOnRecord.destroy({ transaction });
                            results.push({
                                index: i,
                                itemId,
                                getterId,
                                giverId,
                                action: 'deleted',
                                success: true
                            });
                        } else {
                            results.push({
                                index: i,
                                itemId,
                                getterId,
                                giverId,
                                action: 'no_action',
                                success: true,
                                message: 'No existing record to delete'
                            });
                        }
                    } else {
                        // Create record if participating (only create, don't update since go_in_on has no other fields)
                        if (!goInOnRecord) {
                            const goInOnDataToSave = {
                                giverId,
                                getterId,
                                itemId
                            };

                            const newGoInOnRecord = await GoInOn.create(goInOnDataToSave, { transaction });

                            // Notify existing participants that someone new wants to go in on this item
                            await this.notifyGoInOnParticipants(itemId, giverId, getterId, transaction);

                            results.push({
                                index: i,
                                itemId,
                                getterId,
                                giverId,
                                action: 'created',
                                success: true,
                                data: newGoInOnRecord.toJSON()
                            });
                        } else {
                            results.push({
                                index: i,
                                itemId,
                                getterId,
                                giverId,
                                action: 'no_action',
                                success: true,
                                message: 'Record already exists'
                            });
                        }
                    }
                } catch (itemError) {
                    console.error(`Error processing go_in_on item at index ${i}:`, itemError);
                    errors.push({
                        index: i,
                        itemId: goInOnDataArray[i]?.itemId || 'unknown',
                        getterId: goInOnDataArray[i]?.getterId || 'unknown',
                        giverId: goInOnDataArray[i]?.giverId || 'unknown',
                        error: itemError.message || 'Unknown error occurred'
                    });
                }
            }

            await transaction.commit();

            // Determine overall success based on whether we have any errors
            const overallSuccess = errors.length === 0;
            const message = errors.length === 0
                ? `Successfully processed ${results.length} go_in_on records`
                : `Processed ${results.length} records with ${errors.length} errors`;

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
            console.error('Error in bulk update go_in_on:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to bulk update go_in_on records', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to update go_in_on records. Please try again.'
            });
        }
    }

    /**
     * Get all users that are accessible to you and that you haven't gotten a gift for
     * @param {number} userId - The ID of the current user
     * @returns {Object} Object containing success status and data with users without gifts
     */
    static async getUsersWithoutGifts(userId) {
        try {
            // Get all accessible users
            const accessibleUsers = await UserService.getAccessibleUsers(userId);

            if (accessibleUsers.length === 0) {
                return {
                    success: true,
                    data: []
                };
            }

            const accessibleUserIds = accessibleUsers.map(user => user.id);

            // Get all items for accessible users
            const userItems = await ListItem.findAll({
                where: {
                    createdById: { [Op.in]: accessibleUserIds },
                    deleted: false
                },
                attributes: ['createdById']
            });

            // Get unique user IDs who have items
            const userIdsWithItems = [...new Set(userItems.map(item => item.createdById))];

            if (userIdsWithItems.length === 0) {
                return {
                    success: true,
                    data: accessibleUsers.filter(user => user.id !== userId) // Exclude self
                };
            }

            // Find Getting records where current user is getting gifts for accessible users
            const gettingRecords = await Getting.findAll({
                where: {
                    giverId: userId
                },
                include: [{
                    model: ListItem,
                    as: 'item',
                    where: {
                        createdById: { [Op.in]: userIdsWithItems },
                        deleted: false
                    },
                    attributes: ['createdById']
                }]
            });

            // Find accepted proposals where current user is involved for accessible users
            const acceptedProposals = await Proposal.findAll({
                where: {
                    proposalCreatorId: userId,
                    proposalStatus: 'accepted',
                    deleted: false
                },
                include: [{
                    model: ListItem,
                    as: 'itemData',
                    where: {
                        createdById: { [Op.in]: userIdsWithItems },
                        deleted: false
                    },
                    attributes: ['createdById']
                }]
            });

            // Get user IDs that current user is already getting gifts for
            const userIdsWithGifts = new Set();

            gettingRecords.forEach(getting => {
                if (getting.item) {
                    userIdsWithGifts.add(getting.item.createdById);
                }
            });

            acceptedProposals.forEach(proposal => {
                if (proposal.itemData) {
                    userIdsWithGifts.add(proposal.itemData.createdById);
                }
            });

            // Filter out users that current user is already getting gifts for
            // Also exclude the current user themselves
            const usersWithoutGifts = accessibleUsers.filter(user =>
                user.id !== userId && !userIdsWithGifts.has(user.id)
            );

            return {
                success: true,
                data: usersWithoutGifts
            };
        } catch (error) {
            console.error('Error fetching users without gifts:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to fetch users without gifts', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve users without gifts. Please try again.'
            });
        }
    }

    /**
     * Create notifications for existing "go in on" participants when someone new joins
     * @param {number} itemId - The ID of the item
     * @param {number} newParticipantId - The ID of the user who just joined
     * @param {number} getterId - The ID of the getter (recipient)
     * @param {Object} transaction - Database transaction
     */
    static async notifyGoInOnParticipants(itemId, newParticipantId, getterId, transaction) {
        try {
            // Find all existing GoInOn records for this item (excluding the new participant)
            const existingParticipants = await GoInOn.findAll({
                where: {
                    itemId,
                    giverId: { [Op.ne]: newParticipantId }
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

            if (existingParticipants.length === 0) {
                // No existing participants to notify
                return 0;
            }

            // Get the name of the user who just joined
            const newParticipant = await User.findByPk(newParticipantId, {
                attributes: ['name'],
                transaction
            });

            // Get item details
            const listItem = await ListItem.findByPk(itemId, {
                attributes: ['name'],
                transaction
            });

            const itemName = listItem?.name || 'Unknown item';
            const participantName = newParticipant?.name || 'Someone';

            // Create notifications for each existing participant
            let notificationCount = 0;
            for (const participant of existingParticipants) {
                await NotificationService.createNotification({
                    message: `${participantName} wants to go in on ${itemName}`,
                    notificationType: 'someone_go_in_on',
                    userId: participant.giverId, // Send notification to the existing participant
                    metadata: {
                        itemId: itemId,
                        itemName: itemName,
                        newParticipantId: newParticipantId,
                        newParticipantName: participantName,
                        getterId: getterId
                    }
                });
                notificationCount++;
            }

            return notificationCount;
        } catch (error) {
            console.error('Error notifying go-in-on participants:', error);
            // Don't throw - notifications are not critical to the main operation
            return 0;
        }
    }

    /**
     * Delete a getting record by ID
     * @param {number} gettingId - The ID of the getting record to delete
     * @param {number} currentUserId - The ID of the authenticated user
     * @returns {Object} Success response
     */
    static async deleteGetting(gettingId, currentUserId) {
        const transaction = await sequelize.transaction();
        try {
            // Find the getting record
            const gettingRecord = await Getting.findByPk(gettingId, { transaction });

            if (!gettingRecord) {
                throw new ApiError('Getting record not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The getting record could not be found'
                });
            }

            // Check if the current user is the giver (owner of this getting record)
            if (gettingRecord.giverId !== currentUserId) {
                throw new ApiError('Access denied', {
                    status: 403,
                    errorType: 'ACCESS_DENIED',
                    publicMessage: 'You do not have permission to delete this getting record'
                });
            }

            // Delete the getting record
            await gettingRecord.destroy({ transaction });

            await transaction.commit();

            return {
                success: true,
                message: 'Getting record deleted successfully'
            };
        } catch (error) {
            await transaction.rollback();
            console.error('Error deleting getting record:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to delete getting record', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to delete the getting record. Please try again.'
            });
        }
    }

    /**
     * Delete a go-in-on record by item ID for the current user
     * @param {number} itemId - The ID of the item
     * @param {number} currentUserId - The ID of the authenticated user
     * @returns {Object} Success response
     */
    static async deleteGoInOn(itemId, currentUserId) {
        const transaction = await sequelize.transaction();
        try {
            // Find the go-in-on record for this user and item
            const goInOnRecord = await GoInOn.findOne({
                where: {
                    itemId: itemId,
                    giverId: currentUserId
                },
                transaction
            });

            if (!goInOnRecord) {
                throw new ApiError('Go-in-on record not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'You are not participating in this go-in-on for this item'
                });
            }

            // Delete the go-in-on record
            await goInOnRecord.destroy({ transaction });

            await transaction.commit();

            return {
                success: true,
                message: 'Successfully removed from go-in-on'
            };
        } catch (error) {
            await transaction.rollback();
            console.error('Error deleting go-in-on record:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to delete go-in-on record', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to remove from go-in-on. Please try again.'
            });
        }
    }
}

module.exports = GiftTrackingService;
