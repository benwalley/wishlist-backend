const express = require('express');
const imagesController = require('../../controllers/images/getController');

const router = express.Router();

// Handle fetching an image by ID
router.get('/:id', imagesController.getImage);

module.exports = router;
