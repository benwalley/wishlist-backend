const express = require('express');
const listItemController = require('../controllers/listItemController');
const passport = require("passport");

const router = express.Router();

router.post('/create',  passport.authenticate('jwt', { session: false }), listItemController.create);
router.post('/bulk-create',  passport.authenticate('jwt', { session: false }), listItemController.bulkCreate);
router.post('/bulk-add-to-list',  passport.authenticate('jwt', { session: false }), listItemController.bulkAddToList);
router.put('/bulk-update-delete-date',  passport.authenticate('jwt', { session: false }), listItemController.updateDeleteDate);
router.put('/bulk-update-visibility',  passport.authenticate('jwt', { session: false }), listItemController.updateVisibility);
router.put('/bulk-update-lists',  passport.authenticate('jwt', { session: false }), listItemController.updateLists);
router.put('/bulk-update-publicity-priority',  passport.authenticate('jwt', { session: false }), listItemController.bulkUpdatePublicityPriority);
router.delete('/bulk-delete',  passport.authenticate('jwt', { session: false }), listItemController.bulkDelete);
router.get('/',  passport.authenticate('jwt', { session: false }), listItemController.getAll);
router.get('/my-items',  passport.authenticate('jwt', { session: false }), listItemController.getMyItems);
router.get('/orphaned',  passport.authenticate('jwt', { session: false }), listItemController.getNotInList);
router.put('/:id',  passport.authenticate('jwt', { session: false }), listItemController.update);
router.delete('/:id',  passport.authenticate('jwt', { session: false }), listItemController.delete);
router.get('/:id',  passport.authenticate('jwt', { session: false }), listItemController.getById);

module.exports = router;
