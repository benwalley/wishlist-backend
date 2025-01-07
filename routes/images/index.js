const express = require('express');
const uploadImageRoute = require('./upload');
const getImageRoute = require('./get');


const router = express.Router();

router.use('/upload', uploadImageRoute);
router.use('/get', getImageRoute);

module.exports = router; // Ensure this is a `Router` instance

