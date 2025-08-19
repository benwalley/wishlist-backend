const express = require('express');
const passport = require('passport');
const generateController = require('../../controllers/images/generateController');

const router = express.Router();

// POST /images/generate - Generate an image with Gemini AI
router.post('/', passport.authenticate('jwt', { session: false }), generateController.generateImage);

module.exports = router;