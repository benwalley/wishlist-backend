const express = require('express');
const multer = require('multer');
const router = express.Router();
const csvImportController = require('../controllers/csvImportController');
const { 
    getJobStatus, 
    cancelJob, 
    getUserJobs 
} = require('../controllers/asyncWishlistImportController');
const passport = require("passport");

// Configure multer for CSV file upload
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow CSV files
        if (file.mimetype === 'text/csv' || 
            file.mimetype === 'application/csv' || 
            file.mimetype === 'text/plain' ||
            file.originalname.toLowerCase().endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    }
});

// Process CSV file and return items (immediate processing)
router.post('/fetch-products', 
    passport.authenticate('jwt', { session: false }),
    upload.single('csvFile'),
    csvImportController.fetchFromCsv
);

// Start async CSV import job
router.post('/start', 
    passport.authenticate('jwt', { session: false }),
    upload.single('csvFile'),
    csvImportController.startCsvImport
);

// Reuse existing job management endpoints
router.get('/status/:jobId', passport.authenticate('jwt', { session: false }), getJobStatus);
router.delete('/cancel/:jobId', passport.authenticate('jwt', { session: false }), cancelJob);
router.get('/jobs', passport.authenticate('jwt', { session: false }), getUserJobs);

module.exports = router;