const express = require('express');
const createController = require('../controllers/listItems/createController');
const getAllController = require('../controllers/listItems/getAllController');
const getByIdController = require('../controllers/listItems/getByIdController');
const updateController = require('../controllers/listItems/updateController');
const deleteController = require('../controllers/listItems/deleteController');
const passport = require("passport");
const {addGroup} = require("../controllers/groups/addGroupController");

const router = express.Router();

router.post('/create',  passport.authenticate('jwt', { session: false }), createController.create);
router.get('/', getAllController.getAll);
router.get('/:id', getByIdController.getById);
router.put('/:id', updateController.update);
router.delete('/:id', deleteController.delete);

module.exports = router;

