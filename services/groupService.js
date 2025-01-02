// services/GroupService.js
const { Group } = require('../models'); // Assumes your Sequelize model is named "Group"
const { Op } = require('sequelize'); // Import Op from Sequelize


class GroupService {
    /**
     * Create a new group.
     * @param {Object} groupData - The data for the new group.
     * @returns {Promise<Object>} The created group.
     */
    static async createGroup(groupData) {
        try {
            const group = await Group.create(groupData);
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
            await group.update(updateData);
            return group;
        } catch (error) {
            throw new Error(`Failed to update group: ${error.message}`);
        }
    }

    /**
     * Delete a group by its ID.
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
     * Get all groups with optional filters.
     * @param {Object} filters - Filters to apply (e.g., ownerId, groupName).
     * @returns {Promise<Array>} A list of groups matching the filters.
     */
    static async getAllGroups(filters = {}) {
        try {
            const groups = await Group.findAll({ where: filters });
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
            const members = group.members || [];
            const updatedMembers = members.filter((id) => id !== memberId);
            await group.update({ members: updatedMembers });
            return group;
        } catch (error) {
            throw new Error(`Failed to remove member: ${error.message}`);
        }
    }

    /**
     * Get groups where a user is a member.
     * @param {number} userId - The ID of the user.
     * @returns {Promise<Array>} A list of groups where the user is a member.
     */
    static async getGroupsByMember(userId) {
        try {
            const groups = await Group.findAll({
                where: {
                    members: {
                        [Op.contains]: [userId],
                    },
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
                    invitedIds: {
                        [Op.contains]: [userId],
                    },
                },
            });
            return groups;
        } catch (error) {
            throw new Error(`Failed to retrieve groups by invitation: ${error.message}`);
        }
    }
}

module.exports = GroupService;
