
// services/GroupService.js
const { Group, User } = require('../models'); // Assumes your Sequelize model is named "Group"
const { Op } = require('sequelize'); // Import Op from Sequelize


class GroupService {
    /**
     * Create a new group.
     * @param {Object} groupData - The data for the new group.
     * @returns {Promise<Object>} The created group.
     */
    static async createGroup(groupData) {
        try {
            // Ensure the owner is always included in the members list
            const members = Array.isArray(groupData.members) ? [...groupData.members] : [];
            if (!members.includes(groupData.ownerId)) {
                members.push(groupData.ownerId);
            }
            
            // Update the groupData with the modified members array
            const updatedGroupData = {
                ...groupData,
                members
            };
            
            const group = await Group.create(updatedGroupData);
            return group;
        } catch (error) {
            throw new Error(`Failed to create group: ${error.message}`);
        }
    }

    /**
     * Get a group by its ID.
     * @param {number} id - The ID of the group.
     * @returns {Promise<Object|null>} The group, or null if not found.
     */
    static async getGroupById(id) {
        try {
            const group = await Group.findByPk(id);
            // Check if group exists or is deleted
            if (!group || group.deleted) {
                return null;
            }
            return group;
        } catch (error) {
            throw new Error(`Failed to retrieve group: ${error.message}`);
        }
    }

    /**
     * Update a group by its ID.
     * @param {number} id - The ID of the group.
     * @param {Object} updateData - The data to update.
     * @returns {Promise<Object|null>} The updated group, or null if not found.
     */
    static async updateGroup(id, updateData) {
        try {
            const group = await Group.findByPk(id);
            if (!group) {
                return null;
            }
            
            // If updating members, ensure the owner is included
            if (updateData.members !== undefined) {
                const members = Array.isArray(updateData.members) ? [...updateData.members] : [];
                const ownerId = updateData.ownerId || group.ownerId;
                
                if (!members.includes(ownerId)) {
                    members.push(ownerId);
                }
                
                updateData = {
                    ...updateData,
                    members
                };
            }
            
            await group.update(updateData);
            return group;
        } catch (error) {
            throw new Error(`Failed to update group: ${error.message}`);
        }
    }

    /**
     * Update a group with authorization check and field filtering
     * @param {number} groupId - The ID of the group
     * @param {number} userId - The ID of the user performing the update
     * @param {Object} updateData - The data to update
     * @returns {Promise<Object>} The updated group
     * @throws {Error} If group not found, user has no access, or update is not allowed
     */
    static async updateGroupWithAccessCheck(groupId, userId, updateData) {
        // Get group and verify access
        const { group, access } = await this.getGroupWithAccessCheck(groupId, userId);

        // Only group owners and admins can update group details
        if (!access.isOwner && !access.isAdmin) {
            throw new Error('Only group owners and admins can update group details');
        }

        // Prevent changing the owner if the user is not the owner
        if (updateData.ownerId !== undefined && !access.isOwner) {
            throw new Error('Only the owner can transfer ownership');
        }

        // Fields that can be updated (whitelist approach)
        const allowedFields = ['groupName', 'groupDescription', 'groupImage', 'members'];

        // If user is owner, they can also update these fields
        if (access.isOwner) {
            allowedFields.push('ownerId', 'adminIds');
        }

        // Filter the update data to only include allowed fields
        const filteredUpdateData = {};
        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                filteredUpdateData[field] = updateData[field];
            }
        }
        
        // If updating members, ensure the owner is included
        if (filteredUpdateData.members !== undefined) {
            const members = Array.isArray(filteredUpdateData.members) ? [...filteredUpdateData.members] : [];
            // Use the new owner ID if ownership is being transferred, otherwise use current owner
            const ownerId = filteredUpdateData.ownerId !== undefined ? filteredUpdateData.ownerId : group.ownerId;
            
            if (!members.includes(ownerId)) {
                members.push(ownerId);
            }
            
            filteredUpdateData.members = members;
        }

        // Update the group
        await group.update(filteredUpdateData);
        return group;
    }

    /**
     * Hard delete a group by its ID.
     * @param {number} id - The ID of the group.
     * @returns {Promise<boolean>} True if the group was deleted, false if not found.
     */
    static async deleteGroup(id) {
        try {
            const deleted = await Group.destroy({ where: { id } });
            return deleted > 0;
        } catch (error) {
            throw new Error(`Failed to delete group: ${error.message}`);
        }
    }

    /**
     * Soft delete a group (mark as deleted) with authorization check
     * @param {number} groupId - The ID of the group
     * @param {number} userId - The ID of the user performing the deletion
     * @returns {Promise<Object>} The updated group
     * @throws {Error} If group not found, user has no access, or deletion is not allowed
     */
    static async softDeleteGroupWithAccessCheck(groupId, userId) {
        // Get group and verify access
        const { group, access } = await this.getGroupWithAccessCheck(groupId, userId);

        // Only group owner can delete the group
        if (!access.isOwner) {
            throw new Error('Only the group owner can delete the group');
        }

        // Mark the group as deleted
        await group.update({ deleted: true });

        return group;
    }

    /**
     * Get all groups with optional filters.
     * @param {Object} filters - Filters to apply (e.g., ownerId, groupName).
     * @returns {Promise<Array>} A list of groups matching the filters.
     */
    static async getAllGroups(filters = {}) {
        try {
            // Add 'deleted: false' to the filters
            const whereCondition = {
                ...filters,
                deleted: false
            };

            const groups = await Group.findAll({ where: whereCondition });
            return groups;
        } catch (error) {
            throw new Error(`Failed to retrieve groups: ${error.message}`);
        }
    }

    /**
     * Add a member to a group.
     * @param {number} groupId - The ID of the group.
     * @param {number} memberId - The ID of the member to add.
     * @returns {Promise<Object>} The updated group.
     */
    static async addMember(groupId, memberId) {
        try {
            const group = await Group.findByPk(groupId);
            if (!group) {
                throw new Error('Group not found');
            }
            const members = group.members || [];
            if (!members.includes(memberId)) {
                members.push(memberId);
                await group.update({ members });
            }
            return group;
        } catch (error) {
            throw new Error(`Failed to add member: ${error.message}`);
        }
    }

    /**
     * Remove a member from a group.
     * @param {number} groupId - The ID of the group.
     * @param {number} memberId - The ID of the member to remove.
     * @returns {Promise<Object>} The updated group.
     */
    static async removeMember(groupId, memberId) {
        try {
            const group = await Group.findByPk(groupId);
            if (!group) {
                throw new Error('Group not found');
            }
            
            // Don't allow removing the owner from members
            if (memberId === group.ownerId) {
                throw new Error('Cannot remove the owner from group members');
            }
            
            const members = group.members || [];
            const updatedMembers = members.filter((id) => id !== memberId);
            await group.update({ members: updatedMembers });
            return group;
        } catch (error) {
            throw new Error(`Failed to remove member: ${error.message}`);
        }
    }

    /**
     * Get groups where a user is a member or owner.
     * @param {number} userId - The ID of the user.
     * @returns {Promise<Array>} A list of groups where the user is a member or owner.
     */
    static async getGroupsByMember(userId) {
        try {
            const groups = await Group.findAll({
                where: {
                    [Op.and]: [
                        {
                            [Op.or]: [
                                {
                                    members: {
                                        [Op.contains]: [userId],
                                    }
                                },
                                {
                                    ownerId: userId
                                },
                                {
                                    adminIds: {
                                        [Op.contains]: [userId],
                                    }
                                }
                            ]
                        },
                        {
                            deleted: false
                        }
                    ]
                },
            });
            return groups;
        } catch (error) {
            throw new Error(`Failed to retrieve groups by member: ${error.message}`);
        }
    }

    /**
     * Get groups where a user is invited.
     * @param {number} userId - The ID of the user.
     * @returns {Promise<Array>} A list of groups where the user is invited.
     */
    static async getGroupsByInvited(userId) {
        try {
            const groups = await Group.findAll({
                where: {
                    [Op.and]: [
                        {
                            invitedIds: {
                                [Op.contains]: [userId],
                            }
                        },
                        {
                            deleted: false
                        }
                    ]
                },
            });
            return groups;
        } catch (error) {
            throw new Error(`Failed to retrieve groups by invitation: ${error.message}`);
        }
    }

    /**
     * Check if a user has access to a group
     * @param {number} userId - The ID of the user
     * @param {Object} group - The group object
     * @returns {Object} Access details with boolean properties: hasAccess, isOwner, isAdmin, isMember, isInvited
     */
    static checkUserAccess(userId, group) {
        if (!group || !userId) {
            return { hasAccess: false };
        }

        const isOwner = group.ownerId === userId;
        const isAdmin = group.adminIds && group.adminIds.includes(userId);
        const isMember = group.members && group.members.includes(userId);
        const isInvited = group.invitedIds && group.invitedIds.includes(userId);

        const hasAccess = isOwner || isAdmin || isMember || isInvited;

        return {
            hasAccess,
            isOwner,
            isAdmin,
            isMember,
            isInvited
        };
    }

    /**
     * Get a group by ID and verify user access
     * @param {number} groupId - The ID of the group
     * @param {number} userId - The ID of the user
     * @returns {Promise<Object>} Object containing group and access information
     * @throws {Error} If group not found or user has no access
     */
    static async getGroupWithAccessCheck(groupId, userId) {
        const group = await this.getGroupById(groupId);

        if (!group) {
            throw new Error('Group not found');
        }

        const access = this.checkUserAccess(userId, group);

        if (!access.hasAccess) {
            throw new Error('Access denied. You must be an owner, admin, member, or invitee of this group.');
        }

        return { group, access };
    }

    /**
     * Add a user to a group's invited list
     * @param {number} groupId - The ID of the group
     * @param {number} invitedUserId - The ID of the user to invite
     * @param {number} invitingUserId - The ID of the user sending the invitation
     * @returns {Promise<Object>} The updated group
     * @throws {Error} If group not found or user has no access
     */
    static async inviteUserToGroup(groupId, invitedUserId, invitingUserId) {
        try {
            // First get and verify access
            const { group, access } = await this.getGroupWithAccessCheck(groupId, invitingUserId);

            if (!access.isOwner && !access.isAdmin) {
                throw new Error('Only group owners and admins can invite users');
            }

            // Check if user is already a member or invited
            if (group.members && group.members.includes(invitedUserId)) {
                throw new Error('User is already a member of this group');
            }

            if (group.invitedIds && group.invitedIds.includes(invitedUserId)) {
                throw new Error('User has already been invited to this group');
            }

            // Create a new array with existing invited IDs plus the new one
            let updatedInvitedIds = [];

            // Use existing invitedIds if available, or empty array if not
            if (Array.isArray(group.invitedIds)) {
                updatedInvitedIds = [...group.invitedIds];
            }

            // Add the new invited user ID
            updatedInvitedIds.push(invitedUserId);

            // Update the group with the new invitedIds array
            await group.update({ invitedIds: updatedInvitedIds });
            return true;
        } catch (error) {
            console.error('Error in inviteUserToGroup:', error);
            throw new Error(`Failed to invite user to group: ${error.message}`);
        }
    }

    /**
     * Get all member IDs from a group (owner, admins, and members)
     * @param {Object} group - The group object
     * @returns {Set} - Set of unique user IDs who are members of the group
     */
    static getGroupMemberIds(group) {
        const memberIds = new Set();

        // Add owner
        if (group.ownerId) {
            memberIds.add(group.ownerId);
        }

        // Add all members
        if (Array.isArray(group.members)) {
            group.members.forEach(memberId => {
                memberIds.add(memberId);
            });
        }

        // Add all admins
        if (Array.isArray(group.adminIds)) {
            group.adminIds.forEach(adminId => {
                memberIds.add(adminId);
            });
        }

        return memberIds;
    }

    /**
     * Get all members of a specific group with their roles
     * @param {number} groupId - The ID of the group
     * @param {number} userId - The ID of the user requesting access
     * @returns {Promise<Array>} - List of users with their roles in the group
     * @throws {Error} If group not found or user has no access
     */
    static async getGroupMembers(groupId, userId) {
        // Get group and verify access
        const { group } = await this.getGroupWithAccessCheck(groupId, userId);

        // Get all member IDs
        const memberIds = this.getGroupMemberIds(group);

        // Fetch user details for all members


        const members = await User.findAll({
            where: {
                id: {
                    [Op.in]: [...memberIds]
                }
            },
            attributes: {
                exclude: ['password'] // Don't return passwords
            }
        });

        // Add role information to each user
        const membersWithRoles = members.map(member => {
            const plainMember = member.get({ plain: true });
            return {
                ...plainMember,
                roles: {
                    isOwner: member.id === group.ownerId,
                    isAdmin: group.adminIds && group.adminIds.includes(member.id),
                    isMember: group.members && group.members.includes(member.id)
                }
            };
        });

        return membersWithRoles;
    }

    /**
     * Leave a group - remove user from members and adminIds, add to invitedIds
     * @param {number} groupId - The ID of the group
     * @param {number} userId - The ID of the user leaving the group
     * @returns {Promise<Object>} The updated group
     * @throws {Error} If group not found or if user is the owner
     */
    static async leaveGroup(groupId, userId) {
        // Get group without access check since we're handling the special case
        const group = await this.getGroupById(groupId);

        if (!group) {
            throw new Error('Group not found');
        }

        // Check if user is a member or admin of the group
        const isMember = group.members && group.members.includes(userId);
        const isAdmin = group.adminIds && group.adminIds.includes(userId);

        // Owner cannot leave their own group
        if (group.ownerId === userId) {
            throw new Error('The group owner cannot leave the group. Transfer ownership first or delete the group.');
        }

        // If user is not a member or admin, they aren't in the group
        if (!isMember && !isAdmin) {
            throw new Error('You are not a member of this group');
        }

        // Update fields
        let updatedMembers = [...(group.members || [])];
        let updatedAdminIds = [...(group.adminIds || [])];
        let updatedInvitedIds = [...(group.invitedIds || [])];

        // Remove from members if present
        if (isMember) {
            updatedMembers = updatedMembers.filter(id => id !== userId);
        }

        // Remove from adminIds if present
        if (isAdmin) {
            updatedAdminIds = updatedAdminIds.filter(id => id !== userId);
        }

        // Add to invitedIds if not already there
        if (!updatedInvitedIds.includes(userId)) {
            updatedInvitedIds.push(userId);
        }

        // Ensure that the owner is always in the members list
        if (!updatedMembers.includes(group.ownerId)) {
            updatedMembers.push(group.ownerId);
        }

        // Update the group
        await group.update({
            members: updatedMembers,
            adminIds: updatedAdminIds,
            invitedIds: updatedInvitedIds
        });

        return group;
    }

    /**
     * Accept a group invitation - move user from invitedIds to members
     * @param {number} groupId - The ID of the group
     * @param {number} userId - The ID of the user accepting the invitation
     * @returns {Promise<Object>} The updated group
     * @throws {Error} If group not found or if user is not invited
     */
    static async acceptGroupInvitation(groupId, userId) {
        // Get the group
        const group = await this.getGroupById(groupId);

        if (!group) {
            throw new Error('Group not found');
        }

        // Check if user is invited to the group
        const isInvited = group.invitedIds && group.invitedIds.includes(userId);

        if (!isInvited) {
            throw new Error('You are not invited to this group');
        }

        // Update fields
        let updatedMembers = [...(group.members || [])];
        let updatedInvitedIds = [...group.invitedIds];

        // Add to members if not already there
        if (!updatedMembers.includes(userId)) {
            updatedMembers.push(userId);
        }

        // Remove from invitedIds
        updatedInvitedIds = updatedInvitedIds.filter(id => id !== userId);

        // Update the group
        await group.update({
            members: updatedMembers,
            invitedIds: updatedInvitedIds
        });

        return group;
    }

    /**
     * Decline a group invitation - remove user from invitedIds
     * @param {number} groupId - The ID of the group
     * @param {number} userId - The ID of the user declining the invitation
     * @returns {Promise<Object>} The updated group
     * @throws {Error} If group not found or if user is not invited
     */
    static async declineGroupInvitation(groupId, userId) {
        // Get the group
        const group = await this.getGroupById(groupId);

        if (!group) {
            throw new Error('Group not found');
        }

        // Check if user is invited to the group
        const isInvited = group.invitedIds && group.invitedIds.includes(userId);

        if (!isInvited) {
            throw new Error('You are not invited to this group');
        }

        // Update invitedIds
        let updatedInvitedIds = [...group.invitedIds];

        // Remove from invitedIds
        updatedInvitedIds = updatedInvitedIds.filter(id => id !== userId);

        // Update the group
        await group.update({
            invitedIds: updatedInvitedIds
        });

        return group;
    }
}

module.exports = GroupService;
