const express = require('express');
const router = express.Router();
const {
    startWishlistImport,
    getJobStatus,
    cancelJob,
    getUserJobs,
    processImportImages
} = require('../controllers/asyncWishlistImportController');
const passport = require("passport");

// Start an import job, then poll its status (includes progress + progressMessage)
router.post('/start', passport.authenticate('jwt', { session: false }), startWishlistImport);
router.get('/status/:jobId', passport.authenticate('jwt', { session: false }), getJobStatus);
router.delete('/cancel/:jobId', passport.authenticate('jwt', { session: false }), cancelJob);
router.get('/jobs', passport.authenticate('jwt', { session: false }), getUserJobs);

// Download images for the items the user chose to import
router.post('/images', passport.authenticate('jwt', { session: false }), processImportImages);

module.exports = router;
