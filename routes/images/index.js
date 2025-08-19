const express = require('express');
const uploadImageRoute = require('./upload');
const getImageRoute = require('./get');
const generateImageRoute = require('./generate');

const router = express.Router();

router.use('/upload', uploadImageRoute);
router.use('/get', getImageRoute);
router.use('/generate', generateImageRoute);

module.exports = router; // Ensure this is a `Router` instance

