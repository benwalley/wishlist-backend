const express = require('express');
const proposalController = require('../controllers/proposalController');
const passport = require("passport");

const router = express.Router();

// Create a new proposal
router.post('/create', passport.authenticate('jwt', { session: false }), proposalController.create);

// Get all proposals (with optional filtering)
router.get('/', passport.authenticate('jwt', { session: false }), proposalController.getAll);

// Get all approved proposals
router.get('/approved', passport.authenticate('jwt', { session: false }), proposalController.getApproved);

// Get proposals created by the authenticated user
router.get('/my-proposals', passport.authenticate('jwt', { session: false }), proposalController.getMyProposals);

// Get proposals that include the authenticated user
router.get('/for-me', passport.authenticate('jwt', { session: false }), proposalController.getProposalsForMe);

// Get all proposals for a specific item
router.get('/by-item/:itemId', passport.authenticate('jwt', { session: false }), proposalController.getByItemId);

// Accept a proposal
router.post('/accept/:proposalId', passport.authenticate('jwt', { session: false }), proposalController.acceptProposal);

// Decline a proposal
router.post('/decline/:proposalId', passport.authenticate('jwt', { session: false }), proposalController.declineProposal);

// Update the authenticated user's response to a proposal (generic)
router.put('/response/:proposalId', passport.authenticate('jwt', { session: false }), proposalController.updateMyResponse);

// Get a specific proposal by ID
router.get('/:id', passport.authenticate('jwt', { session: false }), proposalController.getById);

// Update a proposal
router.put('/:id', passport.authenticate('jwt', { session: false }), proposalController.update);

// Delete a proposal
router.delete('/:id', passport.authenticate('jwt', { session: false }), proposalController.delete);

module.exports = router;