const express = require('express');
const passport = require('passport');
const currentUserController = require('../../controllers/users/currentUserController');

const router = express.Router();

router.get('/', passport.authenticate('jwt', { session: false }), currentUserController.getCurrentUser);

module.exports = router;
