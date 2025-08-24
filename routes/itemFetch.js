const express = require('express');
const router = express.Router();
const { fetchItemData } = require('../controllers/itemFetchController');
const { 
    startItemFetch, 
    getJobStatus, 
    cancelJob, 
    getUserJobs,
    getProcessorStatus 
} = require('../controllers/asyncItemFetchController');
const passport = require("passport");

// Existing synchronous endpoint (kept for backward compatibility)
router.post('/fetch', passport.authenticate('jwt', { session: false }), fetchItemData);

// New asynchronous endpoints
router.post('/start', passport.authenticate('jwt', { session: false }), startItemFetch);
router.get('/status/:jobId', passport.authenticate('jwt', { session: false }), getJobStatus);
router.delete('/cancel/:jobId', passport.authenticate('jwt', { session: false }), cancelJob);
router.get('/jobs', passport.authenticate('jwt', { session: false }), getUserJobs);

// Admin endpoint for monitoring
router.get('/processor/status', passport.authenticate('jwt', { session: false }), getProcessorStatus);

module.exports = router;
