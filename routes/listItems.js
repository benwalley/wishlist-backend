const express = require('express');
const listItemController = require('../controllers/listItemController');
const itemViewController = require('../controllers/itemViewController');
const publicItemController = require('../controllers/publicItemController');
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

// Item view tracking routes
router.post('/mark-viewed',  passport.authenticate('jwt', { session: false }), itemViewController.markItemsViewed);
router.get('/viewed',  passport.authenticate('jwt', { session: false }), itemViewController.getViewedItems);
router.post('/check-seen',  passport.authenticate('jwt', { session: false }), itemViewController.checkSeenItemsFromList);
router.get('/',  passport.authenticate('jwt', { session: false }), listItemController.getAll);
router.get('/my-items',  passport.authenticate('jwt', { session: false }), listItemController.getMyItems);
router.get('/search/:query',  passport.authenticate('jwt', { session: false }), listItemController.searchAccessibleItems);
router.get('/orphaned',  passport.authenticate('jwt', { session: false }), listItemController.getNotInList);
router.get('/public/:id', publicItemController.getPublicById);
router.put('/:id',  passport.authenticate('jwt', { session: false }), listItemController.update);
router.delete('/:id',  passport.authenticate('jwt', { session: false }), listItemController.delete);
router.get('/:id',  passport.authenticate('jwt', { session: false }), listItemController.getById);

// Item-specific view tracking routes
router.get('/:id/viewers',  passport.authenticate('jwt', { session: false }), itemViewController.getItemViewers);
router.get('/:id/view-count',  passport.authenticate('jwt', { session: false }), itemViewController.getItemViewCount);
router.get('/:id/has-seen',  passport.authenticate('jwt', { session: false }), itemViewController.hasSeenItem);

module.exports = router;
