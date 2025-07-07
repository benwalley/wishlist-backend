const express = require('express');
const router = express.Router();
const wishlistImportController = require('../controllers/wishlistImportController');
const passport = require("passport");

// Fetch Amazon wishlist items
router.post('/fetch-wishlist', passport.authenticate('jwt', { session: false }), wishlistImportController.fetchWishlist);

// Get Amazon product details (without creating list item)
router.post('/product-details', passport.authenticate('jwt', { session: false }), wishlistImportController.getProductDetails);

// Import single Amazon product as list item
router.post('/import-product', passport.authenticate('jwt', { session: false }), wishlistImportController.importProduct);

module.exports = router;