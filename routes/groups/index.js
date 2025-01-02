const express = require('express');


const router = express.Router();

router.use('/invited', invitedGroupsRoute);
router.use('/current', currentUserGroupRoute);

module.exports = router;
