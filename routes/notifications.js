const express = require('express');
const passport = require('passport');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

// Authentication middleware
const auth = passport.authenticate('jwt', { session: false });

router.get('/', passport.authenticate('jwt', { session: false }), notificationController.getNotifications);
router.get('/unread-count', passport.authenticate('jwt', { session: false }), notificationController.getUnreadCount);
router.put('/:id/read', passport.authenticate('jwt', { session: false }), notificationController.markAsRead);
router.put('/mark-all-read', passport.authenticate('jwt', { session: false }), notificationController.markAllAsRead);
router.delete('/:id', passport.authenticate('jwt', { session: false }), notificationController.deleteNotification);
router.post('/', passport.authenticate('jwt', { session: false }), notificationController.createNotification);

module.exports = router;
