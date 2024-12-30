const express = require('express');
const createController = require('../../controllers/auth/createController');

const router = express.Router();

router.post('/', createController.createUser);

module.exports = router;
