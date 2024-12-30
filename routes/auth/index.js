const express = require('express');
const loginRoute = require('./login');
const logoutRoute = require('./logout');
const createUserRoute = require('./create');
const refreshTokenRoute = require('./refresh');

const router = express.Router();

router.use('/login', loginRoute);
router.use('/refresh', refreshTokenRoute);
router.use('/logout', logoutRoute);
router.use('/create', createUserRoute);

module.exports = router;
