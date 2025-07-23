const express = require('express');
const loginRoute = require('./login');
const logoutRoute = require('./logout');
const createUserRoute = require('./create');
const refreshTokenRoute = require('./refresh');
const switchUserRoute = require('./switchUser');
const passwordResetRoute = require('./passwordReset');

const router = express.Router();

router.use('/login', loginRoute);
router.use('/refresh', refreshTokenRoute);
router.use('/logout', logoutRoute);
router.use('/create', createUserRoute);
router.use('/switch-user', switchUserRoute);
router.use('/password-reset', passwordResetRoute);

module.exports = router;
