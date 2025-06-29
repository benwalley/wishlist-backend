const { Event, EventRecipient, Getting, GoInOn, Proposal, ProposalParticipant, ListItem, sequelize } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

class EventService {
    /**
     * Get all events for the current user (owned or viewer)
     * @param {number} userId - Current user ID
     * @returns {Promise<Object>} - Events the user has access to
     */
    static async getUserEvents(userId) {
        try {
            const events = await Event.findAll({
                where: {
                    [Op.or]: [
                        { ownerId: userId },
                        { viewerIds: { [Op.contains]: [userId] } }
                    ]
                },
                include: [{
                    model: EventRecipient,
                    as: 'recipients'
                }],
                order: [['createdAt', 'DESC']]
            });

            return {
                success: true,
                data: events
            };
        } catch (error) {
            console.error('Error fetching user events:', error);
            throw new ApiError('Failed to fetch events', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve events. Please try again.'
            });
        }
    }

    /**
     * Get event by ID if user has access (owner or viewer)
     * @param {number} eventId - Event ID
     * @param {number} userId - Current user ID
     * @returns {Promise<Object>} - Event with recipients
     */
    static async getEventById(eventId, userId) {
        try {
            const event = await Event.findByPk(eventId, {
                include: [{
                    model: EventRecipient,
                    as: 'recipients'
                }]
            });

            if (!event) {
                throw new ApiError('Event not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The requested event could not be found.'
                });
            }

            // Check if user has access (owner or viewer)
            const hasAccess = event.ownerId === userId ||
                             (event.viewerIds && event.viewerIds.includes(userId));

            if (!hasAccess) {
                throw new ApiError('Access denied', {
                    status: 403,
                    errorType: 'ACCESS_DENIED',
                    publicMessage: 'You do not have permission to view this event.'
                });
            }

            // Enhance recipients with getting and go_in_on data
            const enhancedRecipients = await Promise.all(
                event.recipients.map(async (recipient) => {
                    const recipientData = recipient.toJSON();

                    // Get all getting records for this recipient
                    const gettingRecords = await Getting.findAll({
                        where: {
                            getterId: recipient.userId,
                            giverId: userId
                        },
                        include: [
                            {
                                model: Proposal,
                                as: 'proposal',
                                required: false,
                                include: [
                                    {
                                        model: ProposalParticipant,
                                        as: 'proposalParticipants',
                                        required: false
                                    }
                                ]
                            }
                        ]
                    });

                    // Manually fetch item data for each getting record
                    const gettingRecordsWithItems = await Promise.all(
                        gettingRecords.map(async (getting) => {
                            const gettingData = getting.toJSON();
                            if (gettingData.itemId) {
                                const item = await ListItem.findByPk(gettingData.itemId);
                                const itemData = {
                                    name: item.name || '',
                                }
                                gettingData.item = itemData
                            }
                            return gettingData;
                        })
                    );

                    // Get all go_in_on records for this recipient
                    const goInOnRecords = await GoInOn.findAll({
                        where: { getterId: recipient.userId }
                    });

                    recipientData.getting = gettingRecordsWithItems;
                    recipientData.goInOn = goInOnRecords;

                    return recipientData;
                })
            );

            const eventData = event.toJSON();
            eventData.recipients = enhancedRecipients;

            return {
                success: true,
                data: eventData
            };
        } catch (error) {
            console.error('Error fetching event by ID:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to fetch event', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve the event. Please try again.'
            });
        }
    }

    /**
     * Create a new event with recipients
     * @param {Object} eventData - Event details
     * @param {Array} userIds - Array of user IDs to create recipients for
     * @param {number} ownerId - Owner user ID
     * @returns {Promise<Object>} - Created event with recipients
     */
    static async createEvent(eventData, userIds = [], ownerId) {
        const transaction = await sequelize.transaction();
        try {
            const { name, dueDate, viewerIds = [], archived = false } = eventData;

            // Create the event
            const newEvent = await Event.create({
                name,
                dueDate,
                ownerId,
                viewerIds,
                archived
            }, { transaction });

            // Create event recipients if userIds provided
            const recipients = [];
            if (userIds && Array.isArray(userIds) && userIds.length > 0) {
                for (const userId of userIds) {
                    const recipient = await EventRecipient.create({
                        eventId: newEvent.id,
                        userId: userId,
                        status: 'pending'
                    }, { transaction });
                    recipients.push(recipient);
                }
            }

            await transaction.commit();

            // Fetch the complete event with recipients
            const completeEvent = await Event.findByPk(newEvent.id, {
                include: [{
                    model: EventRecipient,
                    as: 'recipients'
                }]
            });

            return {
                success: true,
                data: completeEvent
            };
        } catch (error) {
            await transaction.rollback();
            console.error('Error creating event:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to create event', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to create the event. Please try again.'
            });
        }
    }

    /**
     * Update an event and its recipients
     * @param {number} eventId - Event ID to update
     * @param {Object} eventData - Updated event details
     * @param {Array} userIds - Array of user IDs for recipients
     * @param {number} userId - Current user ID (must be owner)
     * @returns {Promise<Object>} - Updated event with recipients
     */
    static async updateEvent(eventId, eventData, userIds = [], userId) {
        const transaction = await sequelize.transaction();
        try {
            const event = await Event.findByPk(eventId, { transaction });

            if (!event) {
                throw new ApiError('Event not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The event you are trying to update could not be found.'
                });
            }

            // Check if user is the owner
            if (event.ownerId !== userId) {
                throw new ApiError('Access denied', {
                    status: 403,
                    errorType: 'ACCESS_DENIED',
                    publicMessage: 'You do not have permission to update this event.'
                });
            }

            // Update event details
            const { name, dueDate, viewerIds, archived } = eventData;
            const updateData = {};
            if (name !== undefined) updateData.name = name;
            if (dueDate !== undefined) updateData.dueDate = dueDate;
            if (viewerIds !== undefined) updateData.viewerIds = viewerIds;
            if (archived !== undefined) updateData.archived = archived;

            await event.update(updateData, { transaction });

            // Update recipients if userIds provided
            if (userIds && Array.isArray(userIds)) {
                // Remove existing recipients
                await EventRecipient.destroy({
                    where: { eventId: eventId },
                    transaction
                });

                // Create new recipients
                for (const recipientUserId of userIds) {
                    await EventRecipient.create({
                        eventId: eventId,
                        userId: recipientUserId,
                        status: 'pending'
                    }, { transaction });
                }
            }

            await transaction.commit();

            // Fetch the updated event with recipients
            const updatedEvent = await Event.findByPk(eventId, {
                include: [{
                    model: EventRecipient,
                    as: 'recipients'
                }]
            });

            return {
                success: true,
                data: updatedEvent
            };
        } catch (error) {
            await transaction.rollback();
            console.error('Error updating event:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to update event', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to update the event. Please try again.'
            });
        }
    }

    /**
     * Update event recipients
     * @param {Array} recipientUpdates - Array of recipient update objects
     * @param {number} userId - Current user ID
     * @returns {Promise<Object>} - Updated recipients
     */
    static async updateEventRecipients(recipientUpdates, userId) {
        const transaction = await sequelize.transaction();
        try {
            if (!Array.isArray(recipientUpdates) || recipientUpdates.length === 0) {
                throw new ApiError('Invalid data format', {
                    status: 400,
                    errorType: 'INVALID_INPUT',
                    publicMessage: 'Expected an array of recipient update objects.'
                });
            }

            const results = [];
            const errors = [];

            for (let i = 0; i < recipientUpdates.length; i++) {
                try {
                    const { recipientId, note, status, budget } = recipientUpdates[i];

                    if (!recipientId) {
                        errors.push({
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
                        errors.push({
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
                        errors.push({
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
                    if (budget !== undefined) updateData.budget = budget;

                    await recipient.update(updateData, { transaction });

                    results.push({
                        index: i,
                        recipientId,
                        success: true,
                        data: recipient.toJSON()
                    });

                } catch (itemError) {
                    console.error(`Error processing recipient at index ${i}:`, itemError);
                    errors.push({
                        index: i,
                        recipientId: recipientUpdates[i]?.recipientId || 'unknown',
                        error: itemError.message || 'Unknown error occurred'
                    });
                }
            }

            await transaction.commit();

            const overallSuccess = errors.length === 0;
            const message = errors.length === 0
                ? `Successfully updated ${results.length} recipients`
                : `Updated ${results.length} recipients with ${errors.length} errors`;

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
            console.error('Error updating event recipients:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to update event recipients', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to update event recipients. Please try again.'
            });
        }
    }
}

module.exports = EventService;
