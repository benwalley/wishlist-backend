const express = require('express');
const publicUsersController = require('../../controllers/users/publicUsersController');

const router = express.Router();

router.get('/', publicUsersController.getPublicUsers);

module.exports = router;

