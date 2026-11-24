const express = require('express');
const router = express.Router();
const { 
    startItemFetch, 
    getJobStatus, 
    cancelJob, 
    getUserJobs,
    getProcessorStatus 
} = require('../controllers/asyncItemFetchController');
const passport = require("passport");

// Starts a fetch: returns the data directly when the fast path succeeds, otherwise a jobId to poll
router.post('/start', passport.authenticate('jwt', { session: false }), startItemFetch);
router.get('/status/:jobId', passport.authenticate('jwt', { session: false }), getJobStatus);
router.delete('/cancel/:jobId', passport.authenticate('jwt', { session: false }), cancelJob);
router.get('/jobs', passport.authenticate('jwt', { session: false }), getUserJobs);

// Admin endpoint for monitoring
router.get('/processor/status', passport.authenticate('jwt', { session: false }), getProcessorStatus);

module.exports = router;
