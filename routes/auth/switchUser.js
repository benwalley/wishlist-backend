const express = require('express');
const switchUserController = require('../../controllers/auth/switchUserController');
const passport = require('passport');

const router = express.Router();

router.post('/', passport.authenticate('jwt', { session: false }), switchUserController.switchUser);

module.exports = router;