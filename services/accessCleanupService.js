const { List, ListItem, Address, Comment, Answer, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const UserService = require('./userService');

class AccessCleanupService {
    /**
     * Clean up all sharing when a group is deleted
     * @param {number} groupId - ID of the group being deleted
     */
    static async cleanupGroupDeletion(groupId) {
        const transaction = await sequelize.transaction();
        
        try {
            // Remove the group from all visibleToGroups arrays
            await Promise.all([
                List.update(
                    { visibleToGroups: sequelize.fn('array_remove', sequelize.col('visibleToGroups'), groupId) },
                    { where: { visibleToGroups: { [Op.contains]: [groupId] } }, transaction }
                ),
                ListItem.update(
                    { visibleToGroups: sequelize.fn('array_remove', sequelize.col('visibleToGroups'), groupId) },
                    { where: { visibleToGroups: { [Op.contains]: [groupId] } }, transaction }
                ),
                Address.update(
                    { visibleToGroups: sequelize.fn('array_remove', sequelize.col('visibleToGroups'), groupId) },
                    { where: { visibleToGroups: { [Op.contains]: [groupId] } }, transaction }
                ),
                Comment.update(
                    { visibleToGroups: sequelize.fn('array_remove', sequelize.col('visibleToGroups'), groupId) },
                    { where: { visibleToGroups: { [Op.contains]: [groupId] } }, transaction }
                ),
                Answer.update(
                    { visibleToGroups: sequelize.fn('array_remove', sequelize.col('visibleToGroups'), groupId) },
                    { where: { visibleToGroups: { [Op.contains]: [groupId] } }, transaction }
                )
            ]);
            
            await transaction.commit();
            console.log(`Cleaned up all sharing references for deleted group ${groupId}`);
            
        } catch (error) {
            await transaction.rollback();
            console.error('Error during group deletion cleanup:', error);
            throw error;
        }
    }

    /**
     * Clean up access permissions when a user leaves a group
     * @param {number} userId - ID of the user leaving the group
     * @param {number} groupId - ID of the group being left
     * @param {Array<number>} affectedUserIds - Array of user IDs that were also removed (subusers)
     */
    static async cleanupUserGroupAccess(userId, groupId, affectedUserIds = []) {
        const transaction = await sequelize.transaction();
        
        try {
            // Include the primary user in affected users
            const allAffectedUserIds = [userId, ...affectedUserIds];
            
            // For each affected user, determine who they can still access
            const cleanupPromises = allAffectedUserIds.map(async (affectedUserId) => {
                // Get users this person can still access after leaving the group
                const accessibleUserIds = await this.getAccessibleUserIds(affectedUserId);
                
                // Clean up sharing for each entity type
                await Promise.all([
                    this.cleanupListSharing(affectedUserId, groupId, accessibleUserIds, transaction),
                    this.cleanupListItemSharing(affectedUserId, groupId, accessibleUserIds, transaction),
                    this.cleanupAddressSharing(affectedUserId, groupId, accessibleUserIds, transaction),
                    this.cleanupCommentSharing(affectedUserId, groupId, accessibleUserIds, transaction),
                    this.cleanupAnswerSharing(affectedUserId, groupId, accessibleUserIds, transaction)
                ]);
                
                // Also clean up bidirectional access - remove this user from others' visibleToUsers
                await this.cleanupBidirectionalAccess(affectedUserId, accessibleUserIds, transaction);
            });
            
            await Promise.all(cleanupPromises);
            
            await transaction.commit();
            
            console.log(`Access cleanup completed for users [${allAffectedUserIds.join(', ')}] leaving group ${groupId}`);
            
        } catch (error) {
            await transaction.rollback();
            console.error('Error during access cleanup:', error);
            throw error;
        }
    }
    
    /**
     * Get all user IDs that a given user can still access
     * @param {number} userId - ID of the user
     * @returns {Promise<Set<number>>} Set of accessible user IDs
     */
    static async getAccessibleUserIds(userId) {
        try {
            // Get all users this user can access through UserService
            const accessibleUsers = await UserService.getAccessibleUsers(userId);
            const accessibleUserIds = new Set(accessibleUsers.map(user => user.id));
            
            // Always include self
            accessibleUserIds.add(userId);
            
            return accessibleUserIds;
        } catch (error) {
            console.error('Error getting accessible user IDs:', error);
            // Return at minimum self-access
            return new Set([userId]);
        }
    }
    
    /**
     * Clean up list sharing permissions
     * @param {number} userId - User whose sharing needs cleanup
     * @param {number} groupId - Group ID being removed
     * @param {Set<number>} accessibleUserIds - User IDs still accessible 
     * @param {Object} transaction - Database transaction
     */
    static async cleanupListSharing(userId, groupId, accessibleUserIds, transaction) {
        // Find lists owned by this user that have group or user sharing
        const listsToClean = await List.findAll({
            where: {
                ownerId: userId,
                [Op.or]: [
                    { visibleToGroups: { [Op.contains]: [groupId] } },
                    { visibleToUsers: { [Op.ne]: [] } }
                ]
            },
            transaction
        });
        
        for (const list of listsToClean) {
            let needsUpdate = false;
            const updates = {};
            
            // Remove the group from visibleToGroups
            if (list.visibleToGroups && list.visibleToGroups.includes(groupId)) {
                updates.visibleToGroups = list.visibleToGroups.filter(gId => gId !== groupId);
                needsUpdate = true;
            }
            
            // Clean up visibleToUsers - remove users no longer accessible
            if (list.visibleToUsers && list.visibleToUsers.length > 0) {
                const filteredUsers = list.visibleToUsers.filter(uId => accessibleUserIds.has(uId));
                if (filteredUsers.length !== list.visibleToUsers.length) {
                    updates.visibleToUsers = filteredUsers;
                    needsUpdate = true;
                }
            }
            
            if (needsUpdate) {
                await list.update(updates, { transaction });
            }
        }
    }
    
    /**
     * Clean up list item sharing permissions
     * @param {number} userId - User whose sharing needs cleanup
     * @param {number} groupId - Group ID being removed
     * @param {Set<number>} accessibleUserIds - User IDs still accessible
     * @param {Object} transaction - Database transaction
     */
    static async cleanupListItemSharing(userId, groupId, accessibleUserIds, transaction) {
        // Find list items created by this user that have group or user sharing
        const itemsToClean = await ListItem.findAll({
            where: {
                createdById: userId,
                [Op.or]: [
                    { visibleToGroups: { [Op.contains]: [groupId] } },
                    { visibleToUsers: { [Op.ne]: [] } }
                ]
            },
            transaction
        });
        
        for (const item of itemsToClean) {
            let needsUpdate = false;
            const updates = {};
            
            // Remove the group from visibleToGroups
            if (item.visibleToGroups && item.visibleToGroups.includes(groupId)) {
                updates.visibleToGroups = item.visibleToGroups.filter(gId => gId !== groupId);
                needsUpdate = true;
            }
            
            // Clean up visibleToUsers
            if (item.visibleToUsers && item.visibleToUsers.length > 0) {
                const filteredUsers = item.visibleToUsers.filter(uId => accessibleUserIds.has(uId));
                if (filteredUsers.length !== item.visibleToUsers.length) {
                    updates.visibleToUsers = filteredUsers;
                    needsUpdate = true;
                }
            }
            
            if (needsUpdate) {
                await item.update(updates, { transaction });
            }
        }
    }
    
    /**
     * Clean up address sharing permissions
     * @param {number} userId - User whose sharing needs cleanup
     * @param {number} groupId - Group ID being removed
     * @param {Set<number>} accessibleUserIds - User IDs still accessible
     * @param {Object} transaction - Database transaction
     */
    static async cleanupAddressSharing(userId, groupId, accessibleUserIds, transaction) {
        // Find addresses owned by this user
        const addressesToClean = await Address.findAll({
            where: {
                userId: userId,
                [Op.or]: [
                    { visibleToGroups: { [Op.contains]: [groupId] } },
                    { visibleToUsers: { [Op.ne]: [] } }
                ]
            },
            transaction
        });
        
        for (const address of addressesToClean) {
            let needsUpdate = false;
            const updates = {};
            
            // Remove the group from visibleToGroups
            if (address.visibleToGroups && address.visibleToGroups.includes(groupId)) {
                updates.visibleToGroups = address.visibleToGroups.filter(gId => gId !== groupId);
                needsUpdate = true;
            }
            
            // Clean up visibleToUsers
            if (address.visibleToUsers && address.visibleToUsers.length > 0) {
                const filteredUsers = address.visibleToUsers.filter(uId => accessibleUserIds.has(uId));
                if (filteredUsers.length !== address.visibleToUsers.length) {
                    updates.visibleToUsers = filteredUsers;
                    needsUpdate = true;
                }
            }
            
            if (needsUpdate) {
                await address.update(updates, { transaction });
            }
        }
    }
    
    /**
     * Clean up comment sharing permissions
     * @param {number} userId - User whose sharing needs cleanup
     * @param {number} groupId - Group ID being removed
     * @param {Set<number>} accessibleUserIds - User IDs still accessible
     * @param {Object} transaction - Database transaction
     */
    static async cleanupCommentSharing(userId, groupId, accessibleUserIds, transaction) {
        // Find comments created by this user
        const commentsToClean = await Comment.findAll({
            where: {
                userId: userId,
                [Op.or]: [
                    { visibleToGroups: { [Op.contains]: [groupId] } },
                    { visibleToUsers: { [Op.ne]: [] } }
                ]
            },
            transaction
        });
        
        for (const comment of commentsToClean) {
            let needsUpdate = false;
            const updates = {};
            
            // Remove the group from visibleToGroups
            if (comment.visibleToGroups && comment.visibleToGroups.includes(groupId)) {
                updates.visibleToGroups = comment.visibleToGroups.filter(gId => gId !== groupId);
                needsUpdate = true;
            }
            
            // Clean up visibleToUsers
            if (comment.visibleToUsers && comment.visibleToUsers.length > 0) {
                const filteredUsers = comment.visibleToUsers.filter(uId => accessibleUserIds.has(uId));
                if (filteredUsers.length !== comment.visibleToUsers.length) {
                    updates.visibleToUsers = filteredUsers;
                    needsUpdate = true;
                }
            }
            
            if (needsUpdate) {
                await comment.update(updates, { transaction });
            }
        }
    }
    
    /**
     * Clean up answer sharing permissions
     * @param {number} userId - User whose sharing needs cleanup
     * @param {number} groupId - Group ID being removed
     * @param {Set<number>} accessibleUserIds - User IDs still accessible
     * @param {Object} transaction - Database transaction
     */
    static async cleanupAnswerSharing(userId, groupId, accessibleUserIds, transaction) {
        // Find answers created by this user
        const answersToClean = await Answer.findAll({
            where: {
                userId: userId,
                [Op.or]: [
                    { visibleToGroups: { [Op.contains]: [groupId] } },
                    { visibleToUsers: { [Op.ne]: [] } }
                ]
            },
            transaction
        });
        
        for (const answer of answersToClean) {
            let needsUpdate = false;
            const updates = {};
            
            // Remove the group from visibleToGroups
            if (answer.visibleToGroups && answer.visibleToGroups.includes(groupId)) {
                updates.visibleToGroups = answer.visibleToGroups.filter(gId => gId !== groupId);
                needsUpdate = true;
            }
            
            // Clean up visibleToUsers
            if (answer.visibleToUsers && answer.visibleToUsers.length > 0) {
                const filteredUsers = answer.visibleToUsers.filter(uId => accessibleUserIds.has(uId));
                if (filteredUsers.length !== answer.visibleToUsers.length) {
                    updates.visibleToUsers = filteredUsers;
                    needsUpdate = true;
                }
            }
            
            if (needsUpdate) {
                await answer.update(updates, { transaction });
            }
        }
    }
    
    /**
     * Clean up bidirectional access - remove leaving user from other users' visibleToUsers arrays
     * @param {number} leavingUserId - User who left the group
     * @param {Set<number>} accessibleUserIds - Users still accessible to the leaving user
     * @param {Object} transaction - Database transaction
     */
    static async cleanupBidirectionalAccess(leavingUserId, accessibleUserIds, transaction) {
        // For each entity type, find records where leavingUserId is in visibleToUsers
        // but the owner is not in accessibleUserIds (meaning bidirectional access should be removed)
        
        // Clean up Lists
        await List.update(
            {
                visibleToUsers: sequelize.fn('array_remove', sequelize.col('visibleToUsers'), leavingUserId)
            },
            {
                where: {
                    visibleToUsers: { [Op.contains]: [leavingUserId] },
                    ownerId: { [Op.notIn]: [...accessibleUserIds] }
                },
                transaction
            }
        );
        
        // Clean up ListItems
        await ListItem.update(
            {
                visibleToUsers: sequelize.fn('array_remove', sequelize.col('visibleToUsers'), leavingUserId)
            },
            {
                where: {
                    visibleToUsers: { [Op.contains]: [leavingUserId] },
                    createdById: { [Op.notIn]: [...accessibleUserIds] }
                },
                transaction
            }
        );
        
        // Clean up Addresses
        await Address.update(
            {
                visibleToUsers: sequelize.fn('array_remove', sequelize.col('visibleToUsers'), leavingUserId)
            },
            {
                where: {
                    visibleToUsers: { [Op.contains]: [leavingUserId] },
                    userId: { [Op.notIn]: [...accessibleUserIds] }
                },
                transaction
            }
        );
        
        // Clean up Comments
        await Comment.update(
            {
                visibleToUsers: sequelize.fn('array_remove', sequelize.col('visibleToUsers'), leavingUserId)
            },
            {
                where: {
                    visibleToUsers: { [Op.contains]: [leavingUserId] },
                    userId: { [Op.notIn]: [...accessibleUserIds] }
                },
                transaction
            }
        );
        
        // Clean up Answers
        await Answer.update(
            {
                visibleToUsers: sequelize.fn('array_remove', sequelize.col('visibleToUsers'), leavingUserId)
            },
            {
                where: {
                    visibleToUsers: { [Op.contains]: [leavingUserId] },
                    userId: { [Op.notIn]: [...accessibleUserIds] }
                },
                transaction
            }
        );
    }
}

module.exports = AccessCleanupService;