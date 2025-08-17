const express = require('express');
const passport = require('passport');
const eventController = require('../controllers/eventController');

const router = express.Router();

// Get all events for current user
router.get('/', passport.authenticate('jwt', { session: false }), eventController.getUserEvents);

// Get event by ID with recipients
router.get('/:id', passport.authenticate('jwt', { session: false }), eventController.getEventById);

// Create a new event
router.post('/', passport.authenticate('jwt', { session: false }), eventController.createEvent);

// Update an event
router.put('/:id', passport.authenticate('jwt', { session: false }), eventController.updateEvent);

// Update event recipients
router.put('/recipients/bulk', passport.authenticate('jwt', { session: false }), eventController.updateEventRecipients);

// Save note for event recipient
router.put('/:eventId/recipients/:recipientUserId/note', passport.authenticate('jwt', { session: false }), eventController.saveRecipientNote);

module.exports = router;