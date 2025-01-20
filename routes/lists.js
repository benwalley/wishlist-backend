const express = require('express');
const createController = require('../controllers/lists/createController');
const getMineController = require('../controllers/lists/getMineController');
const getByIdController = require('../controllers/lists/getByIdController');
// const updateController = require('../controllers/listItems/updateController');
// const deleteController = require('../controllers/listItems/deleteController');
const passport = require("passport");

const router = express.Router();

router.post('/create',  passport.authenticate('jwt', { session: false }), createController.create);
router.get('/mine', passport.authenticate('jwt', { session: false }), getMineController.getListsByCurrentUser);
router.get('/:id', passport.authenticate('jwt', { session: false }), getByIdController.getById);
// router.put('/:id', updateController.update);
// router.delete('/:id', deleteController.delete);

module.exports = router;

