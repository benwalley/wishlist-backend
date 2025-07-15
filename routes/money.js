const express = require('express');
const passport = require('passport');
const moneyController = require('../controllers/moneyController');

const router = express.Router();

// Create a new money item
router.post('/', passport.authenticate('jwt', { session: false }), moneyController.createMoneyItem);

// Get all money items owned by the current user
router.get('/', passport.authenticate('jwt', { session: false }), moneyController.getMyMoneyItems);

// Update a money item by ID
router.put('/:id', passport.authenticate('jwt', { session: false }), moneyController.updateMoneyItem);

// Delete a money item by ID
router.delete('/:id', passport.authenticate('jwt', { session: false }), moneyController.deleteMoneyItem);

module.exports = router;