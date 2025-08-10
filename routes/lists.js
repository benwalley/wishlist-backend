const express = require('express');
const createController = require('../controllers/lists/createController');
const getMineController = require('../controllers/lists/getMineController');
const getMineAndSubusersController = require('../controllers/lists/getMineAndSubusersController');
const getByIdController = require('../controllers/lists/getByIdController');
const getByGroupController = require('../controllers/lists/getByGroupController');
const getAccessibleController = require('../controllers/lists/getAccessibleController');
const getByUserController = require('../controllers/lists/getByUserController');
const getPublicByUserController = require('../controllers/lists/getPublicByUserController');
const getPublicByIdController = require('../controllers/lists/getPublicByIdController');
const updateController = require('../controllers/lists/updateController');
const deleteController = require('../controllers/lists/deleteController');
const passport = require("passport");

const router = express.Router();

router.post('/create',  passport.authenticate('jwt', { session: false }), createController.create);
router.get('/mine', passport.authenticate('jwt', { session: false }), getMineController.getListsByCurrentUser);
router.get('/mineAndSubusers', passport.authenticate('jwt', { session: false }), getMineAndSubusersController.getListsByCurrentUserAndSubusers);
router.get('/accessible', passport.authenticate('jwt', { session: false }), getAccessibleController.getAccessibleLists);
router.get('/group/:groupId', passport.authenticate('jwt', { session: false }), getByGroupController.getListsByGroup);
router.get('/user/:userId', passport.authenticate('jwt', { session: false }), getByUserController.getByUser);
router.get('/user/:userId/public', getPublicByUserController.getPublicByUser);
router.get('/public/:id', getPublicByIdController.getPublicById);
router.get('/:id', passport.authenticate('jwt', { session: false }), getByIdController.getById);
router.put('/:id', passport.authenticate('jwt', { session: false }), updateController.update);
router.delete('/:id', passport.authenticate('jwt', { session: false }), deleteController.delete);

module.exports = router;

