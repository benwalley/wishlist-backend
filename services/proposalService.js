const { Proposal, ProposalParticipant, User, ListItem, sequelize } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

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
                        include: [{ model: User, as: 'user' }]
                    },
                    { model: ListItem, as: 'itemData' },
                    { model: User, as: 'creator' }
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

            // Soft delete the proposal by adding a deleted column
            await proposal.update({ deleted: true });

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
            // First find all proposal IDs where the user is a participant
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
                        include: [{ model: User, as: 'user' }]
                    },
                    { model: ListItem, as: 'itemData' },
                    { model: User, as: 'creator' }
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
}

module.exports = ProposalService;
