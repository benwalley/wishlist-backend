const express = require('express');
const router = express.Router();
const wishlistImportController = require('../controllers/wishlistImportController');
const { 
    startWishlistImport, 
    getJobStatus, 
    cancelJob, 
    getUserJobs 
} = require('../controllers/asyncWishlistImportController');
const passport = require("passport");

// Fetch products from any URL
router.post('/fetch-products', passport.authenticate('jwt', { session: false }), wishlistImportController.fetchWishlist);

// Get Amazon product details (without creating list item) - kept for backwards compatibility
router.post('/product-details', passport.authenticate('jwt', { session: false }), wishlistImportController.getProductDetails);

// Import single Amazon product as list item - kept for backwards compatibility
router.post('/import-product', passport.authenticate('jwt', { session: false }), wishlistImportController.importProduct);

// Alias for backwards compatibility
router.post('/fetch-wishlist', passport.authenticate('jwt', { session: false }), wishlistImportController.fetchWishlist);

// New asynchronous endpoints
router.post('/start', passport.authenticate('jwt', { session: false }), startWishlistImport);
router.get('/status/:jobId', passport.authenticate('jwt', { session: false }), getJobStatus);
router.delete('/cancel/:jobId', passport.authenticate('jwt', { session: false }), cancelJob);
router.get('/jobs', passport.authenticate('jwt', { session: false }), getUserJobs);

module.exports = router;