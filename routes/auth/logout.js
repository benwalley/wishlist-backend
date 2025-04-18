const express = require('express');
const logoutController = require('../../controllers/auth/logoutController');

const router = express.Router();

router.post('/', logoutController.logout);

module.exports = router;
