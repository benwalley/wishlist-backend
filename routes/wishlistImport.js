const express = require('express');
const router = express.Router();
const wishlistImportController = require('../controllers/wishlistImportController');
const passport = require("passport");

// Fetch products from any URL
router.post('/fetch-products', passport.authenticate('jwt', { session: false }), wishlistImportController.fetchWishlist);

// Get Amazon product details (without creating list item) - kept for backwards compatibility
router.post('/product-details', passport.authenticate('jwt', { session: false }), wishlistImportController.getProductDetails);

// Import single Amazon product as list item - kept for backwards compatibility
router.post('/import-product', passport.authenticate('jwt', { session: false }), wishlistImportController.importProduct);

// Alias for backwards compatibility
router.post('/fetch-wishlist', passport.authenticate('jwt', { session: false }), wishlistImportController.fetchWishlist);

module.exports = router;