const express = require('express');
const passport = require('passport');
const updateUserController = require('../../controllers/users/updateUserController');

const router = express.Router();

router.put('/', passport.authenticate('jwt', { session: false }), updateUserController.updateUser);

module.exports = router;
