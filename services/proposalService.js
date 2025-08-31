const { Proposal, ProposalParticipant, User, ListItem, Getting, sequelize } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');
const NotificationService = require('./notificationService');

class ProposalService {
    /**
     * Create a new proposal with associated proposal users
     * @param {Object} data - The proposal data
     * @param {Array} proposalParticipants - Array of users to include in the proposal
     * @returns {Object} - The created proposal
     */
    static async createProposal(data, proposalParticipants) {
        const transaction = await sequelize.transaction();
        try {
            // Create the proposal
            const newProposal = await Proposal.create(data, { transaction });

            // Create the associated proposal users
            if (proposalParticipants && Array.isArray(proposalParticipants) && proposalParticipants.length > 0) {
                const proposalUserRecords = proposalParticipants.map(user => ({
                    ...user,
                    proposalId: newProposal.id
                }));

                await ProposalParticipant.bulkCreate(proposalUserRecords, { transaction });
            }

            await transaction.commit();

            // Send notifications to proposal participants
            await this.notifyProposalCreated(newProposal.id, data.proposalCreatorId);

            // Fetch the complete proposal with its users
            return this.getProposalById(newProposal.id);
        } catch (error) {
            await transaction.rollback();
            console.error('Error creating Proposal:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to create proposal', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to create proposal. Please try again.'
            });
        }
    }

    /**
     * Get a single proposal by ID with associated users
     * @param {number|string} id - The proposal ID
     * @returns {Object} - The proposal with its users
     */
    static async getProposalById(id) {
        try {
            const proposal = await Proposal.findByPk(id, {
                include: [
                    {
                        model: ProposalParticipant,
                        as: 'proposalParticipants',
                    },
                    { model: ListItem, as: 'itemData' },
                ]
            });

            if (!proposal) {
                throw new ApiError('Proposal not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The requested proposal could not be found'
                });
            }

            return proposal;
        } catch (error) {
            console.error('Error fetching Proposal by ID:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to fetch proposal', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve the proposal. Please try again.'
            });
        }
    }

    /**
     * Get all proposals (optionally filter by criteria)
     * @param {Object} filter - Filter criteria
     * @returns {Array} - List of proposals
     */
    static async getAllProposals(filter = {}) {
        try {
            const proposals = await Proposal.findAll({
                where: filter,
                include: [
                    {
                        model: ProposalParticipant,
                        as: 'proposalParticipants',
                        include: [{ model: User, as: 'user' }]
                    },
                    { model: ListItem, as: 'itemData' },
                    { model: User, as: 'creator' }
                ]
            });

            return proposals;
        } catch (error) {
            console.error('Error fetching Proposals:', error);
            throw new ApiError('Failed to fetch proposals', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve proposals. Please try again.'
            });
        }
    }

    /**
     * Get all approved proposals
     * @returns {Array} - List of approved proposals
     */
    static async getApprovedProposals() {
        try {
            const proposals = await Proposal.findAll({
                where: {
                    proposalStatus: 'accepted',
                    deleted: { [Op.not]: true }
                },
                include: [
                    {
                        model: ProposalParticipant,
                        as: 'proposalParticipants',
                        include: [{ model: User, as: 'user' }]
                    },
                    { model: ListItem, as: 'itemData' },
                    { model: User, as: 'creator' }
                ]
            });

            return proposals;
        } catch (error) {
            console.error('Error fetching approved Proposals:', error);
            throw new ApiError('Failed to fetch approved proposals', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve approved proposals. Please try again.'
            });
        }
    }

    /**
     * Update a proposal
     * @param {number|string} id - The proposal ID
     * @param {Object} updates - The updates to apply
     * @param {number|string} userId - The ID of the user making the update
     * @returns {Object} - The updated proposal
     */
    static async updateProposal(id, updates, userId) {
        const transaction = await sequelize.transaction();
        try {
            // Find the proposal
            const proposal = await Proposal.findByPk(id);
            if (!proposal) {
                throw new ApiError('Proposal not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The proposal you are trying to update could not be found'
                });
            }

            // Check if the current user is the creator of the proposal
            if (String(proposal.proposalCreatorId) !== String(userId)) {
                throw new ApiError('Unauthorized', {
                    status: 403,
                    errorType: 'UNAUTHORIZED',
                    publicMessage: 'You do not have permission to update this proposal'
                });
            }

            // Update the proposal
            await proposal.update(updates, { transaction });

            // Handle updates to proposal users if provided
            if (updates.proposalParticipants && Array.isArray(updates.proposalParticipants)) {
                // Get existing proposal users
                const existingUsers = await ProposalParticipant.findAll({
                    where: { proposalId: id },
                    transaction
                });

                // Create a map of existing users by ID for quick lookup
                const existingUserMap = existingUsers.reduce((map, user) => {
                    map[user.userId] = user;
                    return map;
                }, {});

                // Process each user in the updates
                for (const userUpdate of updates.proposalParticipants) {
                    if (existingUserMap[userUpdate.userId]) {
                        // Update existing user
                        await existingUserMap[userUpdate.userId].update({
                            amountRequested: userUpdate.amountRequested,
                            accepted: userUpdate.accepted,
                            isBuying: userUpdate.isBuying
                        }, { transaction });
                    } else {
                        // Create new user association
                        await ProposalParticipant.create({
                            proposalId: id,
                            userId: userUpdate.userId,
                            amountRequested: userUpdate.amountRequested,
                            accepted: userUpdate.accepted,
                            isBuying: userUpdate.isBuying
                        }, { transaction });
                    }
                }
            }

            await transaction.commit();

            // Fetch the updated proposal with its users
            return this.getProposalById(id);
        } catch (error) {
            await transaction.rollback();
            console.error('Error updating Proposal:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to update proposal', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to update the proposal. Please try again.'
            });
        }
    }

    /**
     * Delete a proposal (soft delete)
     * @param {number|string} id - The proposal ID
     * @param {number|string} userId - The ID of the user requesting deletion
     * @returns {Object} - The deleted proposal
     */
    static async deleteProposal(id, userId) {
        try {
            // Find the proposal
            const proposal = await Proposal.findByPk(id);
            if (!proposal) {
                throw new ApiError('Proposal not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The proposal you are trying to delete could not be found'
                });
            }

            // Check if the current user is the creator of the proposal
            if (String(proposal.proposalCreatorId) !== String(userId)) {
                throw new ApiError('Unauthorized', {
                    status: 403,
                    errorType: 'UNAUTHORIZED',
                    publicMessage: 'You do not have permission to delete this proposal'
                });
            }

            // Get participants before deletion for notifications
            const proposalWithParticipants = await Proposal.findByPk(id, {
                include: [
                    {
                        model: ProposalParticipant,
                        as: 'proposalParticipants'
                    },
                    {
                        model: ListItem,
                        as: 'itemData',
                        attributes: ['name']
                    }
                ]
            });

            // Soft delete the proposal by adding a deleted column
            await proposal.update({ deleted: true });

            // Send notifications to participants (excluding the deleter)
            await this.notifyProposalDeleted(proposalWithParticipants, userId);

            return proposal;
        } catch (error) {
            console.error('Error deleting Proposal:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to delete proposal', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to delete the proposal. Please try again.'
            });
        }
    }

    /**
     * Get all proposals for a specific item
     * @param {number|string} itemId - The item ID
     * @returns {Array} - The proposals associated with the item
     */
    static async getProposalsByItemId(itemId) {
        try {
            const proposals = await Proposal.findAll({
                where: {
                    itemId,
                    deleted: { [Op.not]: true }
                },
                include: [
                    {
                        model: ProposalParticipant,
                        as: 'proposalParticipants',
                        include: [{ model: User, as: 'user' }]
                    },
                    { model: User, as: 'creator' }
                ]
            });

            return proposals;
        } catch (error) {
            console.error('Error fetching Proposals by item ID:', error);
            throw new ApiError('Failed to fetch proposals for this item', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve proposals for this item. Please try again.'
            });
        }
    }

    /**
     * Get all proposals created by a specific user
     * @param {number|string} userId - The user ID
     * @returns {Array} - The proposals created by the user
     */
    static async getProposalsByCreator(userId) {
        try {
            const proposals = await Proposal.findAll({
                where: {
                    proposalCreatorId: userId,
                    deleted: { [Op.not]: true }
                },
                include: [
                    {
                        model: ProposalParticipant,
                        as: 'proposalParticipants',
                        include: [{ model: User, as: 'user' }]
                    },
                    { model: ListItem, as: 'itemData' }
                ]
            });

            return proposals;
        } catch (error) {
            console.error('Error fetching Proposals by creator:', error);
            throw new ApiError('Failed to fetch your proposals', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve your proposals. Please try again.'
            });
        }
    }

    /**
     * Get all proposals that include a specific user
     * @param {number|string} userId - The user ID
     * @returns {Array} - The proposals that include the user
     */
    static async getProposalsForUser(userId) {
        try {
            const participantRecords = await ProposalParticipant.findAll({
                attributes: ['proposalId'],
                where: { userId },
                raw: true
            });

            const proposalIds = participantRecords.map(r => r.proposalId);

            // If the user isn't in any proposals, return an empty array early
            if (proposalIds.length === 0) return [];

            // Fetch the proposals and include *all* participants for each
            const proposals = await Proposal.findAll({
                where: {
                    id: { [Op.in]: proposalIds },
                    deleted: { [Op.not]: true }
                },
                include: [
                    {
                        model: ProposalParticipant,
                        as: 'proposalParticipants',
                    },
                    { model: ListItem, as: 'itemData' },
                ]
            });

            return proposals;
        } catch (error) {
            console.error('Error fetching Proposals for user:', error);
            throw new ApiError('Failed to fetch proposals you are included in', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve proposals you are included in. Please try again.'
            });
        }
    }

    /**
     * Update a user's response to a proposal (accept/decline)
     * @param {number|string} proposalId - The proposal ID
     * @param {number|string} userId - The user ID
     * @param {boolean} accepted - Whether the user accepts the proposal
     * @param {boolean} isBuying - Whether the user will be buying
     * @returns {Object} - The updated proposal user record
     */
    static async updateProposalResponse(proposalId, userId, accepted, isBuying) {
        const transaction = await sequelize.transaction();
        try {
            const proposalUser = await ProposalParticipant.findOne({
                where: { proposalId, userId },
                transaction
            });

            if (!proposalUser) {
                throw new ApiError('Proposal user record not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'You are not part of this proposal'
                });
            }

            await proposalUser.update({
                accepted,
                rejected: !accepted,
                isBuying
            }, { transaction });

            // Get all participants for this proposal to determine overall status
            const allParticipants = await ProposalParticipant.findAll({
                where: { proposalId },
                transaction
            });

            // Determine new proposal status
            let newStatus = 'pending';
            const hasRejected = allParticipants.some(p => p.rejected === true);
            const allAccepted = allParticipants.every(p => p.accepted === true);

            if (hasRejected) {
                newStatus = 'rejected';
            } else if (allAccepted) {
                newStatus = 'accepted';
            }

            // Update the proposal status
            await Proposal.update(
                { proposalStatus: newStatus },
                { where: { id: proposalId }, transaction }
            );

            // Handle Getting relationships when proposal is accepted
            if (newStatus === 'accepted') {
                const proposal = await Proposal.findByPk(proposalId, { transaction });
                await this.handleGettingRelationships(proposal, allParticipants, transaction);
                
                // Send notifications that proposal was fully accepted
                await this.notifyProposalAccepted(proposalId, proposal.proposalCreatorId);
            }

            await transaction.commit();
            return proposalUser;
        } catch (error) {
            await transaction.rollback();
            console.error('Error updating proposal response:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to update your response to the proposal', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to update your response. Please try again.'
            });
        }
    }

    /**
     * Handle Getting relationships when a proposal is created
     * @param {Object} proposal - The created proposal
     * @param {Array} proposalParticipants - Array of proposal participants
     * @param {Object} transaction - Database transaction
     */
    static async handleGettingRelationships(proposal, proposalParticipants, transaction) {
        try {
            // Get the item to find out who owns it (getterId)
            const item = await ListItem.findByPk(proposal.itemId, { transaction });
            if (!item) {
                throw new ApiError('Item not found', {
                    status: 404,
                    errorType: 'NOT_FOUND',
                    publicMessage: 'The item for this proposal could not be found'
                });
            }

            const getterId = item.createdById;

            // Collect all userIds that should have Getting records (proposal creator + participants)
            const allUserIds = [proposal.proposalCreatorId];
            if (proposalParticipants && Array.isArray(proposalParticipants)) {
                proposalParticipants.forEach(participant => {
                    if (participant.userId && !allUserIds.includes(participant.userId)) {
                        allUserIds.push(participant.userId);
                    }
                });
            }

            // Check for existing Getting records for these users and this item
            const existingGettingRecords = await Getting.findAll({
                where: {
                    itemId: proposal.itemId,
                    getterId: getterId,
                    giverId: { [Op.in]: allUserIds }
                },
                transaction
            });

            // Create a map of existing records by giverId for quick lookup
            const existingGettingMap = existingGettingRecords.reduce((map, record) => {
                map[record.giverId] = record;
                return map;
            }, {});

            // Process each user - either update existing Getting record or create new one
            for (const userId of allUserIds) {
                if (existingGettingMap[userId]) {
                    // Update existing Getting record with the proposal ID
                    await existingGettingMap[userId].update({
                        proposalId: proposal.id
                    }, { transaction });
                } else {
                    // Create new Getting record
                    await Getting.create({
                        giverId: userId,
                        getterId: getterId,
                        itemId: proposal.itemId,
                        proposalId: proposal.id,
                        status: 'none',
                        numberGetting: 1,
                        actualPrice: 0
                    }, { transaction });
                }
            }
        } catch (error) {
            console.error('Error handling Getting relationships:', error);
            throw error;
        }
    }

    /**
     * Send notification to proposal participants when a proposal is created
     * @param {number} proposalId - The proposal ID
     * @param {number} creatorId - The ID of the user who created the proposal
     */
    static async notifyProposalCreated(proposalId, creatorId) {
        try {
            // Get proposal with participants and item data
            const proposal = await Proposal.findByPk(proposalId, {
                include: [
                    {
                        model: ProposalParticipant,
                        as: 'proposalParticipants'
                    },
                    {
                        model: ListItem,
                        as: 'itemData',
                        attributes: ['name']
                    }
                ]
            });

            if (!proposal || !proposal.proposalParticipants) {
                return;
            }

            // Get creator name
            const creator = await User.findByPk(creatorId, {
                attributes: ['name']
            });
            const creatorName = creator?.name || 'Someone';
            const itemName = proposal.itemData?.name || 'Unknown item';

            // Send notification to each participant (excluding the creator)
            for (const participant of proposal.proposalParticipants) {
                if (participant.userId !== creatorId) {
                    await NotificationService.createNotification({
                        message: `${creatorName} added you to a proposal for ${itemName}`,
                        notificationType: 'proposal_created',
                        userId: participant.userId,
                        metadata: {
                            proposalId: proposal.id,
                            itemId: proposal.itemId,
                            itemName: itemName,
                            creatorId: creatorId,
                            creatorName: creatorName,
                            action: 'created'
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error notifying proposal participants:', error);
            // Don't throw - notifications are not critical to the main operation
        }
    }

    /**
     * Send notification to all participants when a proposal is fully accepted
     * @param {number} proposalId - The proposal ID
     * @param {number} creatorId - The ID of the user who created the proposal
     */
    static async notifyProposalAccepted(proposalId, creatorId) {
        try {
            // Get proposal with participants and item data
            const proposal = await Proposal.findByPk(proposalId, {
                include: [
                    {
                        model: ProposalParticipant,
                        as: 'proposalParticipants'
                    },
                    {
                        model: ListItem,
                        as: 'itemData',
                        attributes: ['name']
                    }
                ]
            });

            if (!proposal) {
                return;
            }

            const itemName = proposal.itemData?.name || 'Unknown item';

            // Collect all user IDs (creator + participants)
            const allUserIds = [creatorId];
            if (proposal.proposalParticipants) {
                proposal.proposalParticipants.forEach(participant => {
                    if (!allUserIds.includes(participant.userId)) {
                        allUserIds.push(participant.userId);
                    }
                });
            }

            // Send notification to everyone involved
            for (const userId of allUserIds) {
                await NotificationService.createNotification({
                    message: `The proposal for ${itemName} has been accepted by everyone`,
                    notificationType: 'proposal_accepted',
                    userId: userId,
                    metadata: {
                        proposalId: proposal.id,
                        itemId: proposal.itemId,
                        itemName: itemName,
                        action: 'accepted'
                    }
                });
            }
        } catch (error) {
            console.error('Error notifying proposal acceptance:', error);
            // Don't throw - notifications are not critical to the main operation
        }
    }

    /**
     * Send notification to proposal participants when a proposal is deleted
     * @param {Object} proposal - The proposal object with participants and item data
     * @param {number} deleterId - The ID of the user who deleted the proposal
     */
    static async notifyProposalDeleted(proposal, deleterId) {
        try {
            if (!proposal || !proposal.proposalParticipants) {
                return;
            }

            const itemName = proposal.itemData?.name || 'Unknown item';

            // Collect all user IDs (creator + participants) excluding the deleter
            const allUserIds = [];
            
            // Check if creator has accepted (creator is implicitly considered accepted if proposal was created)
            const creatorParticipant = proposal.proposalParticipants.find(p => p.userId === proposal.proposalCreatorId);
            const creatorAccepted = creatorParticipant ? creatorParticipant.accepted : true; // Default to true for creator
            
            // Add creator if they're not the deleter and have accepted
            if (proposal.proposalCreatorId !== deleterId && creatorAccepted) {
                allUserIds.push(proposal.proposalCreatorId);
            }

            // Add participants if they're not the deleter AND have accepted the proposal
            proposal.proposalParticipants.forEach(participant => {
                if (participant.userId !== deleterId && participant.accepted === true && !allUserIds.includes(participant.userId)) {
                    allUserIds.push(participant.userId);
                }
            });

            // Send notification to each affected user
            for (const userId of allUserIds) {
                await NotificationService.createNotification({
                    message: `A proposal you were part of for ${itemName} has been deleted`,
                    notificationType: 'proposal_deleted',
                    userId: userId,
                    metadata: {
                        proposalId: proposal.id,
                        itemId: proposal.itemId,
                        itemName: itemName,
                        deleterId: deleterId,
                        action: 'deleted'
                    }
                });
            }
        } catch (error) {
            console.error('Error notifying proposal deletion:', error);
            // Don't throw - notifications are not critical to the main operation
        }
    }
}

module.exports = ProposalService;
