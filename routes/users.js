const express = require('express');
const passport = require("passport");
const currentUserController = require("../controllers/users/currentUserController");
const publicUsersController = require("../controllers/users/publicUsersController");
const updateUserController = require("../controllers/users/updateUserController");
const {getUserData} = require("../controllers/users/userController");

const router = express.Router();

router.get('/current', passport.authenticate('jwt', { session: false }), currentUserController.getCurrentUser);
router.get('/yours', passport.authenticate('jwt', { session: false }), currentUserController.getYourUsers);
router.get('/public', publicUsersController.getPublicUsers);
router.put('/', passport.authenticate('jwt', { session: false }), updateUserController.updateUser);
router.get('/', getUserData);


module.exports = router; // Ensure this is a `Router` instance
