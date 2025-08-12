const express = require('express');
const passport = require('passport');
const groupController = require('../controllers/groupController');

const router = express.Router();

// Get groups where user is a member
router.get('/current', passport.authenticate('jwt', { session: false }), groupController.getCurrentGroups);

// Get groups where user is invited
router.get('/invited', passport.authenticate('jwt', { session: false }), groupController.getInvitedGroups);

// Accept a group invitation
router.post('/accept/:groupId', passport.authenticate('jwt', { session: false }), groupController.acceptInvitation);

// Decline a group invitation
router.post('/decline/:groupId', passport.authenticate('jwt', { session: false }), groupController.declineInvitation);

// Get users invited to a specific group
router.get('/:groupId/invited', passport.authenticate('jwt', { session: false }), groupController.getInvitedUsers);

// Remove invitation for a user
router.delete('/:groupId/invited/:userId', passport.authenticate('jwt', { session: false }), groupController.removeInvite);

// Get specific group route
router.get('/:groupId', passport.authenticate('jwt', { session: false }), groupController.getGroup);

// Update group route
router.put('/:groupId', passport.authenticate('jwt', { session: false }), groupController.updateGroup);

// Delete group route (soft delete)
router.delete('/:groupId', passport.authenticate('jwt', { session: false }), groupController.deleteGroup);

// Leave group route
router.post('/:groupId/leave', passport.authenticate('jwt', { session: false }), groupController.leaveGroup);

// Get group members route
router.get('/:groupId/members', passport.authenticate('jwt', { session: false }), groupController.getGroupMembers);

// Remove member from group route
router.delete('/:groupId/members/:memberId', passport.authenticate('jwt', { session: false }), groupController.removeMember);

// Create group route
router.post('/create', passport.authenticate('jwt', { session: false }), groupController.addGroup);

// Invite user to group route
router.post('/:groupId/invite', passport.authenticate('jwt', { session: false }), groupController.inviteToGroup);

// Add users to group route
router.post('/users', passport.authenticate('jwt', { session: false }), groupController.addUsers);

// Bulk share lists and questions with a group
router.post('/:groupId/bulk-share', passport.authenticate('jwt', { session: false }), groupController.bulkShareWithGroup);

module.exports = router;