const express = require('express');
const passport = require("passport");
const usersController = require("../controllers/usersController");

const router = express.Router();

router.get('/current', passport.authenticate('jwt', { session: false }), usersController.getCurrentUser);
router.get('/yours', passport.authenticate('jwt', { session: false }), usersController.getYourUsers);
router.get('/accessible', passport.authenticate('jwt', { session: false }), usersController.getAccessibleUsers);
router.get('/public', usersController.getPublicUsers);
router.put('/', passport.authenticate('jwt', { session: false }), usersController.updateUser);
router.get('/:id', passport.authenticate('jwt', { session: false }), usersController.getUserById);
router.get('/', usersController.getUserData);

module.exports = router;
