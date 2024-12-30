const express = require('express');
const loginController = require('../../controllers/auth/loginController');

const router = express.Router();

router.post('/', loginController.login);

module.exports = router;
