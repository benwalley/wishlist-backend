const express = require('express');
const loadRoutes = require('../utils/routeLoader');
const router = express.Router();

loadRoutes(router, __dirname);

module.exports = router;
