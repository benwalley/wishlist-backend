const express = require('express');
const passport = require("passport");
const usersController = require("../controllers/usersController");

const router = express.Router();

router.get('/current', passport.authenticate('jwt', { session: false }), usersController.getCurrentUser);
router.get('/yours', passport.authenticate('jwt', { session: false }), usersController.getYourUsers);
router.get('/accessible', passport.authenticate('jwt', { session: false }), usersController.getAccessibleUsers);
router.get('/public', usersController.getPublicUsers);
router.get('/subusers', passport.authenticate('jwt', { session: false }), usersController.getSubusers);
router.get('/public/:id', usersController.getPublicUserById);
router.put('/', passport.authenticate('jwt', { session: false }), usersController.updateUser);
router.post('/save-note', passport.authenticate('jwt', { session: false }), usersController.saveNote);
router.post('/subuser', passport.authenticate('jwt', { session: false }), usersController.createSubuser);
router.put('/subuser/:id', passport.authenticate('jwt', { session: false }), usersController.editSubuser);
router.put('/subuser/:id/groups', passport.authenticate('jwt', { session: false }), usersController.updateSubuserGroups);
router.delete('/subuser/:id', passport.authenticate('jwt', { session: false }), usersController.deleteSubuser);
router.get('/:id', passport.authenticate('jwt', { session: false }), usersController.getUserById);
router.get('/', usersController.getUserData);

module.exports = router;
