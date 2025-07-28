const {User} = require('../models');
const GroupService = require('../services/groupService');
const UserService = require('../services/userService');
const ListService = require('../services/listService');
const QAService = require('../services/qaService');
const {Op} = require('sequelize');

/**
 * Get all groups where the user is a member
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getCurrentGroups = async (req, res) => {
    // Passport populates req.user with the authenticated user
    if (!req.user) {
        return res.status(401).json({error: 'User not authenticated.'});
    }
    const id = req.user?.id;
    const groupList = await GroupService.getGroupsByMember(id);
    res.json(groupList);
};

/**
 * Get all groups where the user is invited
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getInvitedGroups = async (req, res) => {
    // Passport populates req.user with the authenticated user
    if (!req.user) {
        return res.status(401).json({error: 'User not authenticated.'});
    }
    const id = req.user?.id;
    const groupList = await GroupService.getGroupsByInvited(id);
    res.json(groupList);
};

/**
 * Create a new group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.addGroup = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({error: 'User not authenticated.'});
    }
    console.log('creating this')
    try {
        // Add the user as the owner of the group
        const groupData = {
            ...req.body,
            ownerId: req.user.id,
        };

        // Use GroupService to create the group
        const newGroup = await GroupService.createGroup(groupData);

        res.status(201).json({
            success: true,
            message: 'Group created successfully.',
            data: newGroup,
        });
    } catch (error) {
        console.error(`Error creating group: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to create group. Please try again later.',
        });
    }
};

/**
 * Add users to a group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.addUsers = async (req, res) => {
    // Passport populates req.user with the authenticated user
    if (!req.user) {
        return res.status(401).json({error: 'User not authenticated.'});
    }
    const id = req.user?.id;
    const groupList = await GroupService.getGroupsByMember(id);
    res.json(groupList);
};

/**
 * Invite users to a group via email (supports single email or comma-separated emails)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.inviteToGroup = async (req, res) => {
    try {
        // Get authenticated user's ID
        if (!req.user) {
            return res.status(401).json({success: false, message: 'User not authenticated.'});
        }

        const invitingUserId = req.user.id;
        const groupId = req.params.groupId;
        const {email} = req.body;

        if (!groupId) {
            return res.status(400).json({success: false, message: 'Group ID is required.'});
        }

        if (!email) {
            return res.status(400).json({success: false, message: 'Email is required.'});
        }

        // Parse emails - handle both single email and comma-separated emails
        const emailList = email.split(',').map(e => e.toLowerCase().trim()).filter(e => e.length > 0);
        console.log(emailList);

        if (emailList.length === 0) {
            return res.status(400).json({success: false, message: 'At least one valid email is required.'});
        }

        const results = [];
        const errors = [];
        const alreadyMembers = [];

        // Process each email
        for (const emailAddress of emailList) {
            try {
                // Find or create a user with the provided email
                const invitedUser = await UserService.findOrCreateUserByEmail(emailAddress);

                // Add user to the group's invited list
                await GroupService.inviteUserToGroup(groupId, invitedUser.id, invitingUserId);

                results.push({
                    email: invitedUser.email,
                    success: true,
                    message: 'Invited successfully'
                });

            } catch (error) {
                if (error.message.includes('User is already a member of this group')) {
                    alreadyMembers.push({
                        email: emailAddress,
                        success: false,
                        message: 'Already a member of this group'
                    });
                } else if (error.message.includes('User has already been invited to this group')) {
                    alreadyMembers.push({
                        email: emailAddress,
                        success: false,
                        message: 'Already invited to this group'
                    });
                } else {
                    errors.push({
                        email: emailAddress,
                        success: false,
                        message: error.message
                    });
                }
            }
        }

        // Determine response based on results
        const successCount = results.length;
        const errorCount = errors.length;
        const alreadyMemberCount = alreadyMembers.length;
        const allResults = [...results, ...errors, ...alreadyMembers];

        // Build response message
        let message = '';
        const messageParts = [];

        if (successCount > 0) {
            messageParts.push(`${successCount} user${successCount > 1 ? 's' : ''} invited successfully`);
        }

        if (alreadyMemberCount > 0) {
            messageParts.push(`${alreadyMemberCount} user${alreadyMemberCount > 1 ? 's' : ''} already part of the group`);
        }

        if (errorCount > 0) {
            messageParts.push(`${errorCount} invitation${errorCount > 1 ? 's' : ''} failed`);
        }

        message = messageParts.join(', ') + '.';

        // Determine status code and success flag
        if (successCount > 0 && errorCount === 0) {
            // All invitations successful (some might be already members)
            return res.status(200).json({
                success: true,
                message: message,
                results: allResults
            });
        } else if (successCount > 0 && errorCount > 0) {
            // Partial success
            return res.status(207).json({
                success: false,
                message: message,
                results: allResults
            });
        } else if (alreadyMemberCount > 0 && errorCount === 0) {
            // All users were already members/invited
            return res.status(200).json({
                success: true,
                message: message,
                results: allResults
            });
        } else {
            // All failed
            return res.status(400).json({
                success: false,
                message: message,
                results: allResults
            });
        }

    } catch (error) {
        console.error('Error inviting user to group:', error);
        return res.status(500).json({success: false, message: 'Failed to invite user to group.'});
    }
};

/**
 * Get group by id with authorization check
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getGroup = async (req, res) => {
    try {
        // Get authenticated user's ID
        if (!req.user) {
            return res.status(401).json({error: 'User not authenticated.'});
        }

        const userId = req.user.id;
        const groupId = req.params.groupId;

        if (!groupId) {
            return res.status(400).json({error: 'Group ID is required.'});
        }

        try {
            const {group} = await GroupService.getGroupWithAccessCheck(groupId, userId);

            // Return the group
            return res.json(group);
        } catch (error) {
            if (error.message.includes('Group not found')) {
                return res.status(404).json({error: 'Group not found.'});
            } else if (error.message.includes('Access denied')) {
                return res.status(403).json({error: error.message});
            }
            throw error; // Re-throw for the outer catch block to handle
        }
    } catch (error) {
        console.error('Error getting group:', error);
        return res.status(500).json({error: 'Failed to retrieve group.'});
    }
};

/**
 * Get all members of a specific group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getGroupMembers = async (req, res) => {
    try {
        // Get authenticated user's ID
        if (!req.user) {
            return res.status(401).json({error: 'User not authenticated.'});
        }

        const userId = req.user.id;
        const groupId = req.params.groupId;

        if (!groupId) {
            return res.status(400).json({error: 'Group ID is required.'});
        }

        try {
            // Get all group members with roles using the service
            const members = await GroupService.getGroupMembers(groupId, userId);

            // Return the members with roles
            return res.json(members);

        } catch (error) {
            if (error.message.includes('Group not found')) {
                return res.status(404).json({error: 'Group not found.'});
            } else if (error.message.includes('Access denied')) {
                return res.status(403).json({error: error.message});
            }
            throw error; // Re-throw for the outer catch block to handle
        }
    } catch (error) {
        console.error('Error getting group members:', error);
        return res.status(500).json({error: 'Failed to retrieve group members.'});
    }
};

/**
 * Get all users invited to a specific group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getInvitedUsers = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({error: 'User not authenticated.'});
        }

        const userId = req.user.id;
        const groupId = req.params.groupId;

        // Get group by ID to include all users (including inactive ones)
        const group = await GroupService.getGroupById(groupId);
        if (!group) {
            return res.status(404).json({error: 'Group not found'});
        }
        const access = GroupService.checkUserAccess(userId, group);
        if (!access.hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You must be an owner, admin, member, or invitee of this group.'
            });
        }

        // Get invited user IDs from the group
        const invitedIds = group.invitedIds || [];

        // If there are no invited users, return empty array
        if (invitedIds.length === 0) {
            return res.json([]);
        }

        // Fetch user details for invited users
        const invitedUsers = await User.findAll({
            where: {
                id: {
                    [Op.in]: invitedIds
                }
            },
            attributes: {
                exclude: ['password', 'refreshToken'] // Don't return sensitive data
            }
        });

        res.json(invitedUsers);
    } catch (error) {
        console.error('Error in getInvitedUsers:', error);

        if (error.message === 'Group not found') {
            return res.status(404).json({error: 'Group not found'});
        }

        if (error.message.includes('Access denied')) {
            return res.status(403).json({error: 'Access denied. You must be an owner, admin, member, or invitee of this group.'});
        }

        res.status(500).json({error: 'Failed to retrieve invited users'});
    }
};

/**
 * Remove a user's invitation from a group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.removeInvite = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({error: 'User not authenticated.'});
        }

        const userId = req.user.id;
        const groupId = req.params.groupId;
        const invitedUserId = req.params.userId; // The user ID to remove from invited list

        if (!invitedUserId) {
            return res.status(400).json({error: 'User ID is required'});
        }

        // Get group by ID to include all users (including inactive ones)
        const group = await GroupService.getGroupById(groupId);
        if (!group) {
            return res.status(404).json({success: false, message: 'Group not found'});
        }

        // Check if user has access to the group
        const access = GroupService.checkUserAccess(userId, group);

        // Only group owners and admins can remove invites
        if (!access.isOwner && !access.isAdmin) {
            return res.status(403).json({success: false, message: 'Only group owners and admins can remove invitations'});
        }

        // Get invited user IDs from the group
        const invitedIds = group.invitedIds || [];

        // Check if the user is actually invited
        if (!invitedIds.includes(Number(invitedUserId))) {
            return res.status(404).json({error: 'User is not invited to this group'});
        }

        // Remove the user from the invited list
        const updatedInvitedIds = invitedIds.filter(id => id !== Number(invitedUserId));

        // Update the group through the service
        await GroupService.updateGroup(groupId, {invitedIds: updatedInvitedIds});

        res.json({success: true, message: 'Invitation removed successfully'});
    } catch (error) {
        console.error('Error in removeInvite:', error);

        if (error.message === 'Group not found') {
            return res.status(404).json({error: 'Group not found'});
        }

        if (error.message.includes('Access denied')) {
            return res.status(403).json({error: 'Access denied. You must be an owner or admin of this group.'});
        }

        res.status(500).json({error: 'Failed to remove invitation'});
    }
};

/**
 * Update group details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateGroup = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({error: 'User not authenticated.'});
        }

        const userId = req.user.id;
        const groupId = req.params.groupId;
        const updateData = req.body;

        const updatedGroup = await GroupService.updateGroupWithAccessCheck(groupId, userId, updateData);

        res.json({
            success: true,
            message: 'Group updated successfully',
            data: updatedGroup
        });
    } catch (error) {
        console.error('Error in updateGroup:', error);

        res.status(500).json({error: 'Failed to update group'});
    }
};

/**
 * Delete a group (soft delete - mark as deleted)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.deleteGroup = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({error: 'User not authenticated.'});
        }

        const userId = req.user.id;
        const groupId = req.params.groupId;

        // Call service method to soft delete group with access check
        await GroupService.softDeleteGroupWithAccessCheck(groupId, userId);

        res.json({
            success: true,
            message: 'Group deleted successfully'
        });
    } catch (error) {
        console.error('Error in deleteGroup:', error);

        if (error.message === 'Group not found') {
            return res.status(404).json({error: 'Group not found'});
        }

        if (error.message.includes('Only the group owner')) {
            return res.status(403).json({error: error.message});
        }

        if (error.message.includes('Access denied')) {
            return res.status(403).json({error: error.message});
        }

        res.status(500).json({error: 'Failed to delete group'});
    }
};

/**
 * Leave a group - remove user from members and admins, add to invited list
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.leaveGroup = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({error: 'User not authenticated.'});
        }

        const userId = req.user.id;
        const groupId = req.params.groupId;

        // Call service method to handle leaving the group
        await GroupService.leaveGroup(groupId, userId);

        res.json({
            success: true,
            message: 'You have left the group successfully'
        });
    } catch (error) {
        console.error('Error in leaveGroup:', error);

        if (error.message === 'Group not found') {
            return res.status(404).json({success: false, error: 'Group not found'});
        }

        if (error.message.includes('not a member')) {
            return res.status(400).json({success: false, error: error.message});
        }

        if (error.message.includes('owner cannot leave')) {
            return res.status(403).json({success: false, error: error.message});
        }

        res.status(500).json({success: false, error: error.message});
    }
};

/**
 * Accept an invitation to join a group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.acceptInvitation = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({error: 'User not authenticated.'});
        }

        const userId = req.user.id;
        const groupId = req.params.groupId;

        // Call service method to accept the invitation
        await GroupService.acceptGroupInvitation(groupId, userId);

        res.json({
            success: true,
            message: 'Group invitation accepted successfully'
        });
    } catch (error) {
        console.error('Error in acceptInvitation:', error);

        if (error.message === 'Group not found') {
            return res.status(404).json({success: false, error: 'Group not found'});
        }

        if (error.message.includes('not invited')) {
            return res.status(400).json({success: false, error: error.message});
        }

        res.status(500).json({success: false, error: 'Failed to accept group invitation'});
    }
};

/**
 * Decline an invitation to join a group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.declineInvitation = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({error: 'User not authenticated.'});
        }

        const userId = req.user.id;
        const groupId = req.params.groupId;

        // Call service method to decline the invitation
        await GroupService.declineGroupInvitation(groupId, userId);

        res.json({
            success: true,
            message: 'Group invitation declined successfully'
        });
    } catch (error) {
        console.error('Error in declineInvitation:', error);

        if (error.message === 'Group not found') {
            return res.status(404).json({success: false, error: 'Group not found'});
        }

        if (error.message.includes('not invited')) {
            return res.status(400).json({success: false, error: error.message});
        }

        res.status(500).json({success: false, error: 'Failed to decline group invitation'});
    }
};

/**
 * Bulk share lists and questions with a group
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
exports.bulkShareWithGroup = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated.'
            });
        }

        const {groupId} = req.params;
        const {listIds, questionIds} = req.body;
        const userId = req.user.id;

        // Array to collect results
        const results = {
            success: true,
            lists: null,
            questions: null
        };

        // Process lists if provided
        if (Array.isArray(listIds) && listIds.length > 0) {
            const listResults = await ListService.bulkShareListsWithGroup(listIds, groupId, userId);
            results.lists = listResults;

            // If lists sharing failed, mark overall operation as failed
            if (!listResults.success) {
                results.success = false;
            }
        }

        // Process questions if provided
        if (Array.isArray(questionIds) && questionIds.length > 0) {
            const questionResults = await QAService.bulkShareQuestionsWithGroup(questionIds, groupId, userId);
            results.questions = questionResults;

            // If questions sharing failed, mark overall operation as failed
            if (!questionResults.success) {
                results.success = false;
            }
        }

        // If neither lists nor questions were provided
        if (!Array.isArray(listIds) && !Array.isArray(questionIds)) {
            return res.status(400).json({
                success: false,
                message: 'No lists or questions provided for sharing'
            });
        }

        // Return appropriate status based on success
        return res.status(results.success ? 200 : 400).json(results);
    } catch (error) {
        console.error('Error in bulkShareWithGroup:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while processing bulk share request',
            error: error.message
        });
    }
};
