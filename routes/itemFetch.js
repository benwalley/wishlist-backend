const express = require('express');
const router = express.Router();
const { fetchItemData } = require('../controllers/itemFetchController');
const passport = require("passport");

router.post('/fetch', passport.authenticate('jwt', { session: false }), fetchItemData);

module.exports = router;
