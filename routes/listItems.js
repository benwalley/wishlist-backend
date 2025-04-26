const express = require('express');
const listItemController = require('../controllers/listItemController');
const passport = require("passport");

const router = express.Router();

router.post('/create',  passport.authenticate('jwt', { session: false }), listItemController.create);
router.get('/',  passport.authenticate('jwt', { session: false }), listItemController.getAll);
router.get('/orphaned',  passport.authenticate('jwt', { session: false }), listItemController.getNotInList);
router.get('/:id',  passport.authenticate('jwt', { session: false }), listItemController.getById);
router.put('/:id',  passport.authenticate('jwt', { session: false }), listItemController.update);
router.delete('/:id',  passport.authenticate('jwt', { session: false }), listItemController.delete);

module.exports = router;
