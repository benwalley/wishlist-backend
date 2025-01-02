const express = require('express');
const passport = require('passport');
const {addGroup} = require("../../controllers/groups/addGroupController");

const router = express.Router();

router.post('/', passport.authenticate('jwt', { session: false }), addGroup);

module.exports = router;
