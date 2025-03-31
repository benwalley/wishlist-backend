const express = require('express');
const passport = require('passport');
const qaController = require('../controllers/qaController');

const router = express.Router();

router.post('/create', passport.authenticate('jwt', { session: false }), qaController.create);

router.get('/', passport.authenticate('jwt', { session: false }), qaController.getAll);

router.get('/user/:userId', passport.authenticate('jwt', { session: false }), qaController.getByUserId);

router.get('/:id', passport.authenticate('jwt', { session: false }), qaController.getById);

router.put('/question', passport.authenticate('jwt', { session: false }), qaController.updateQuestion);

router.put('/answer', passport.authenticate('jwt', { session: false }), qaController.updateAnswer);

router.delete('/question/:id', passport.authenticate('jwt', { session: false }), qaController.deleteQuestion);

router.delete('/answer/:id', passport.authenticate('jwt', { session: false }), qaController.deleteAnswer);

module.exports = router;
