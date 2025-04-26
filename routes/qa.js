const express = require('express');
const passport = require('passport');
const qaController = require('../controllers/qaController');

const router = express.Router();

router.post('/create', passport.authenticate('jwt', { session: false }), qaController.create);

router.post('/answer', passport.authenticate('jwt', { session: false }), qaController.updateAnswer);;


router.get('/', passport.authenticate('jwt', { session: false }), qaController.getAll);

router.get('/user/:userId', passport.authenticate('jwt', { session: false }), qaController.getByUserId);

router.get('/userAsked/:userId', passport.authenticate('jwt', { session: false }), qaController.getByAskerId);

router.get('/:id', passport.authenticate('jwt', { session: false }), qaController.getById);

router.put('/question/:questionId', passport.authenticate('jwt', { session: false }), qaController.updateQuestion);


router.delete('/question/:id', passport.authenticate('jwt', { session: false }), qaController.deleteQuestion);

router.delete('/question/force/:id', passport.authenticate('jwt', { session: false }), qaController.forceDeleteQuestion);

router.delete('/answer/:id', passport.authenticate('jwt', { session: false }), qaController.deleteAnswer);

module.exports = router;
