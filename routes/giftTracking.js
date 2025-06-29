const express = require('express');
const router = express.Router();
const { authenticateRoute } = require('../middleware/auth/authenticateRoute');
const giftTrackingController = require('../controllers/giftTrackingController');
const passport = require("passport");
const groupController = require("../controllers/groupController");


router.get('/', passport.authenticate('jwt', { session: false }), giftTrackingController.getTrackedGifts);
router.get('/getting', passport.authenticate('jwt', { session: false }), giftTrackingController.getItemsUserIsGetting);
router.get('/usersWithoutGifts', passport.authenticate('jwt', { session: false }), giftTrackingController.getUsersWithoutGifts);
router.post('/save', passport.authenticate('jwt', { session: false }), giftTrackingController.saveGiftTracking);
router.post('/bulkSave', passport.authenticate('jwt', { session: false }), giftTrackingController.bulkSaveGiftTracking);
router.post('/bulkUpdateGetting', passport.authenticate('jwt', { session: false }), giftTrackingController.bulkUpdateGetting);
router.post('/bulkUpdateGoInOn', passport.authenticate('jwt', { session: false }), giftTrackingController.bulkUpdateGoInOn);

module.exports = router;
