const express = require('express');
const changePasswordController = require('../../controllers/auth/changePasswordController');
const requireAuth = require('../../middleware/auth/authenticate');

const router = express.Router();

router.post('/', requireAuth, changePasswordController.changePassword);

module.exports = router;