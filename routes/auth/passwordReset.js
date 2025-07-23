const express = require('express');
const router = express.Router();
const passwordResetController = require('../../controllers/auth/passwordResetController');

router.post('/request', passwordResetController.requestPasswordReset);
router.get('/validate/:token', passwordResetController.validateResetToken);
router.post('/reset', passwordResetController.resetPassword);

module.exports = router;
