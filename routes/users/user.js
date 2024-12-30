const express = require('express');
const {getUserData} = require("../../controllers/users/userController");

const router = express.Router();

router.get('/', getUserData);

module.exports = router;

