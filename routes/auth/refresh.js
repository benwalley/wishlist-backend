const express = require('express');
const refreshTokenController = require('../../controllers/auth/refreshTokenController');

const router = express.Router();

router.post('/', refreshTokenController.refreshToken);

module.exports = router;
