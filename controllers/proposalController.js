const ProposalService = require('../services/proposalService');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Create a new proposal with associated users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.create = async (req, res, next) => {
    try {
        // Get the authenticated user's ID
        const proposalCreatorId = req.user.id;
        // Extract the proposal data and proposal participants from the request body
        const { itemId, proposalParticipants } = req.body;

        if (!itemId) {
            return res.status(400).json({
                success: false,
                message: 'Item ID is required'
            });
        }

        if (!proposalParticipants || !Array.isArray(proposalParticipants) || proposalParticipants.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one proposal participant is required'
            });
        }

        // Create the proposal data object
        const proposalData = {
            itemId,
            proposalCreatorId
        };

        // Create the proposal
        const newProposal = await ProposalService.createProposal(proposalData, proposalParticipants);

        res.status(201).json({
            success: true,
            data: newProposal
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get a proposal by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const proposal = await ProposalService.getProposalById(id);

        console.log('Proposal participants count:', proposal.proposalParticipants?.length);
        console.log('Proposal participants:', JSON.stringify(proposal.proposalParticipants, null, 2));

        res.status(200).json({
            success: true,
            data: proposal
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all proposals (with optional filtering)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getAll = async (req, res, next) => {
    try {
        const filter = req.query; // Use query params for filtering
        const proposals = await ProposalService.getAllProposals(filter);

        res.status(200).json({
            success: true,
            data: proposals
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all approved proposals
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getApproved = async (req, res, next) => {
    try {
        const proposals = await ProposalService.getApprovedProposals();
        
        res.status(200).json({
            success: true,
            data: proposals
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update a proposal
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const userId = req.user.id;

        const updatedProposal = await ProposalService.updateProposal(id, updates, userId);

        res.status(200).json({
            success: true,
            data: updatedProposal
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete a proposal (soft delete)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.delete = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const deletedProposal = await ProposalService.deleteProposal(id, userId);

        res.status(200).json({
            success: true,
            data: deletedProposal
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all proposals for a specific item
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getByItemId = async (req, res, next) => {
    try {
        const { itemId } = req.params;
        const proposals = await ProposalService.getProposalsByItemId(itemId);

        res.status(200).json({
            success: true,
            data: proposals
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get proposals created by the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getMyProposals = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const proposals = await ProposalService.getProposalsByCreator(userId);

        res.status(200).json({
            success: true,
            data: proposals
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get proposals that include the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getProposalsForMe = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const proposals = await ProposalService.getProposalsForUser(userId);

        res.status(200).json({
            success: true,
            data: proposals
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update the authenticated user's response to a proposal
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateMyResponse = async (req, res, next) => {
    try {
        const { proposalId } = req.params;
        const { accepted, isBuying } = req.body;
        const userId = req.user.id;

        if (accepted === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Accepted status is required'
            });
        }

        const updatedResponse = await ProposalService.updateProposalResponse(
            proposalId,
            userId,
            accepted,
            isBuying || false
        );

        res.status(200).json({
            success: true,
            data: updatedResponse
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Accept a proposal (set accepted=true)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.acceptProposal = async (req, res, next) => {
    try {
        const { proposalId } = req.params;
        const { isBuying } = req.body;
        const userId = req.user.id;

        const updatedResponse = await ProposalService.updateProposalResponse(
            proposalId,
            userId,
            true, // accepted = true
            isBuying || false
        );

        res.status(200).json({
            success: true,
            message: 'Proposal accepted successfully',
            data: updatedResponse
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Decline a proposal (set accepted=false)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.declineProposal = async (req, res, next) => {
    try {
        const { proposalId } = req.params;
        const userId = req.user.id;

        const updatedResponse = await ProposalService.updateProposalResponse(
            proposalId,
            userId,
            false, // accepted = false
            false  // isBuying = false (since declining)
        );

        res.status(200).json({
            success: true,
            message: 'Proposal declined successfully',
            data: updatedResponse
        });
    } catch (error) {
        next(error);
    }
};
