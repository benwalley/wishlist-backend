const express = require('express');
const listItemController = require('../controllers/listItemController');
const passport = require("passport");

const router = express.Router();

router.post('/create',  passport.authenticate('jwt', { session: false }), listItemController.create);
router.post('/bulk-add-to-list',  passport.authenticate('jwt', { session: false }), listItemController.bulkAddToList);
router.get('/',  passport.authenticate('jwt', { session: false }), listItemController.getAll);
router.get('/my-items',  passport.authenticate('jwt', { session: false }), listItemController.getMyItems);
router.get('/orphaned',  passport.authenticate('jwt', { session: false }), listItemController.getNotInList);
router.get('/:id',  passport.authenticate('jwt', { session: false }), listItemController.getById);
router.put('/:id',  passport.authenticate('jwt', { session: false }), listItemController.update);
router.delete('/:id',  passport.authenticate('jwt', { session: false }), listItemController.delete);

module.exports = router;
