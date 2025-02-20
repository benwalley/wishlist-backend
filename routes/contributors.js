const express = require('express');
const passport = require('passport');
const contributorController = require('../controllers/contributorController');

const router = express.Router();

// Create a contributor (requires authentication)
router.post('/create', passport.authenticate('jwt', { session: false }), contributorController.create);

// Get contributors by itemId (expects query param: ?itemId=...)
router.get('/item/:itemId',  passport.authenticate('jwt', { session: false }), contributorController.getByItemId);

// Get a specific contributor by its id
router.get('/:id',  passport.authenticate('jwt', { session: false }), contributorController.getById);

// Update a contributor by id
router.put('/:id',  passport.authenticate('jwt', { session: false }), contributorController.update);

// Delete a contributor by id
router.delete('/:id',  passport.authenticate('jwt', { session: false }), contributorController.delete);

module.exports = router;
