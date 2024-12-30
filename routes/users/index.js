const express = require('express');
const publicUsersRoutes = require('./public');
const singleUserRoute = require('./user');
const currentUserRoute = require('./current');

const router = express.Router();

router.use('/user', singleUserRoute);
router.use('/public', publicUsersRoutes);
router.use('/current', currentUserRoute);

module.exports = router; // Ensure this is a `Router` instance
