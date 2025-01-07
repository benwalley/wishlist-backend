const express = require('express');
const multer = require('multer');
const imagesController = require('../../controllers/images/uploadController');

const router = express.Router();

// Configure multer for in-memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Handle image upload
router.post(
    '/',
    upload.single('image'), // Expecting a single file with the field name 'image'
    imagesController.uploadImage // Call the controller to handle the uploaded image
);

module.exports = router;
