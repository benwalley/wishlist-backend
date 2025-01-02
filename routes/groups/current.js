const express = require('express');
const passport = require('passport');
const {getCurrentGroups} = require("../../controllers/groups/currentGroupsController");

const router = express.Router();

router.get('/', passport.authenticate('jwt', { session: false }), getCurrentGroups);

module.exports = router;
