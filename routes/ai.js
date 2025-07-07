const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const passport = require("passport");

// Generate AI response from query
router.post('/generate', passport.authenticate('jwt', { session: false }), aiController.generate);

// Get AI service status
router.get('/status', passport.authenticate('jwt', { session: false }), aiController.status);

module.exports = router;
