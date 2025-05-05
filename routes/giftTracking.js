const express = require('express');
const router = express.Router();
const { authenticateRoute } = require('../middleware/auth/authenticateRoute');
const giftTrackingController = require('../controllers/giftTrackingController');
const passport = require("passport");
const groupController = require("../controllers/groupController");

/**
 * @route   GET /api/gift-tracking
 * @desc    Get all items that the user is getting (purchased) or contributing to
 * @access  Private
 */
router.get('/', passport.authenticate('jwt', { session: false }), giftTrackingController.getTrackedGifts);


module.exports = router;
