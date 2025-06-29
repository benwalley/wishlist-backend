const { List, Group, ListItem, Getting, GoInOn, sequelize } = require('../models');
const { Op } = require('sequelize'); // Import Op from Sequelize


class ListService {
    /**
     * Share multiple lists with a group
     * @param {Array<number>} listIds - Array of list IDs to share
     * @param {number} groupId - Group ID to share with
     * @param {number} userId - ID of user performing the share operation
     * @returns {Promise<Object>}
     */
    async bulkShareListsWithGroup(listIds, groupId, userId) {
        try {
            // Verify group exists and user has access to it
            const group = await Group.findByPk(groupId);
            if (!group) {
                return {
                    success: false,
                    message: 'Group not found'
                };
            }

            // Check if user is a member, admin, or owner of the group
            const isMember = group.members && group.members.includes(userId);
            const isAdmin = group.adminIds && group.adminIds.includes(userId);
            const isOwner = group.ownerId === userId;
            if (!isMember && !isAdmin && !isOwner) {
                return {
                    success: false,
                    message: 'You do not have access to this group'
                };
            }

            if (!Array.isArray(listIds) || listIds.length === 0) {
                return {
                    success: false,
                    message: 'No lists provided for sharing'
                };
            }

            // Get all lists and check user ownership
            const lists = await List.findAll({
                where: {
                    id: {
                        [Op.in]: listIds
                    }
                }
            });

            if (lists.length === 0) {
                return {
                    success: false,
                    message: 'No valid lists found'
                };
            }

            // Track results
            const results = {
                success: true,
                sharedLists: [],
                failedLists: []
            };

            // Update each list
            for (const list of lists) {
                // Only allow sharing if user is the owner
                if (String(list.ownerId) !== String(userId)) {
                    results.failedLists.push({
                        id: list.id,
                        reason: 'You can only share lists you own'
                    });
                    continue;
                }

                // Add group to visibleToGroups if not already there
                const visibleToGroups = Array.isArray(list.visibleToGroups) ? [...list.visibleToGroups] : [];

                if (!visibleToGroups.includes(groupId)) {
                    visibleToGroups.push(groupId);
                    await list.update({ visibleToGroups });
                    results.sharedLists.push(list.id);
                } else {
                    // Already shared with this group
                    results.sharedLists.push(list.id);
                }
            }

            return results;
        } catch (error) {
            console.error('Error in bulkShareListsWithGroup:', error);
            return {
                success: false,
                message: 'An error occurred while sharing lists with the group',
                error: error.message
            };
        }
    }

    /**
     * Create a new List
     * @param {Object} listData
     * @returns {Promise<Object>}
     */
    async createList(listData) {
        try {
            const newList = await List.create(listData);
            return newList;
        } catch (error) {
            // Handle error or rethrow
            throw error;
        }
    }

    /**
     * Get a list by its ID
     * @param {String} id
     * @param userId
     * @returns {Promise<Object|null>}
     */
    async getListById(id, userId) {
        try {
            // Handle special case for list zero (orphaned items)
            if (id === '0') {
                return this.getOrphanedItemsList(userId);
            }

            const list = await List.findByPk(id);
            if (!list) {
                return {
                    success: false,
                    message: 'List not found'
                };
            }

            let allowedToViewList = false;

            // Check if the user is the owner of the list
            if (String(list.ownerId) === String(userId)) {
                allowedToViewList = true;
            }

            // Check if the user is in the "visibleToUsers" array
            if (!allowedToViewList && list.visibleToUsers.includes(String(userId))) {
                allowedToViewList = true;
            }

            // Check if the user is in any group that is in the "visibleToGroups" array
            if (!allowedToViewList) {
                const userGroups = await Group.findAll({
                    where: {
                        members: {
                            [Op.contains]: [String(userId)]
                        }
                    },
                    attributes: ['id']
                });

                const userGroupIds = userGroups.map(group => group.id);

                allowedToViewList = list.visibleToGroups.some(groupId => userGroupIds.includes(groupId));
            }

            if (!allowedToViewList) {
                return {
                    success: false,
                    message: 'You are not allowed to view this list'
                };
            }

            // First get all non-deleted items in this list with getting and goInOn data
            const allListItems = await ListItem.findAll({
                where: {
                    lists: { [Op.contains]: [list.id] },
                    deleted: false
                },
                include: [
                    {
                        model: Getting,
                        as: 'getting'
                    },
                    {
                        model: GoInOn,
                        as: 'goInOn'
                    }
                ]
            });

            // Filter items based on visibility permissions
            const ListItemService = require('./listItemService');
            const listItems = allListItems.filter(item =>
                ListItemService.canUserViewItem(item, userId, allowedToViewList)
            );

            return {
                success: true,
                data: {
                    ...list.toJSON(),
                    listItems,
                    numberItems: listItems.length
                }
            };

        } catch (error) {
            throw error;
        }
    }


    /**
     * Get all lists
     * @returns {Promise<Array>}
     */
    async getAllLists() {
        try {
            const lists = await List.findAll();
            return lists;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get all lists by owner ID
     * @param {String} ownerId
     * @returns {Promise<Array>}
     */
    async getAllListsByOwnerId(ownerId) {
        try {
            const lists = await List.findAll({
                where: { ownerId: String(ownerId) }, // Ensure ownerId is cast to a string
            });
            return lists;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get all lists by owner ID with "list zero" containing orphaned items
     * @param {String} userId
     * @returns {Promise<Array>}
     */
    /**
     * Get a special list containing orphaned items for a user
     * @param {String} userId
     * @returns {Promise<Object>}
     */
    async getOrphanedItemsList(userId) {
        try {
            // 1. Get all existing lists (to check against later)
            const existingLists = await List.findAll({
                attributes: ['id'],
                raw: true
            });
            const existingListIds = existingLists.map(list => list.id);

            // 2. Get all non-deleted items created by the user
            const userItems = await ListItem.findAll({
                where: {
                    createdById: userId,
                    deleted: false
                },
                raw: true
            });

            if (userItems.length === 0) {
                // Return early if the user has no items
                return {
                    success: true,
                    data: {
                        id: 0,
                        ownerId: String(userId),
                        listName: "Unassigned Items",
                        visibleToGroups: [],
                        visibleToUsers: [],
                        public: false,
                        description: "Items that are not assigned to any list",
                        parentId: null,
                        sharedWith: [],
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        listItems: [],
                        isVirtualList: true
                    }
                };
            }

            // 3. Filter for orphaned items - those with no lists or only deleted lists
            const orphanedItems = userItems.filter(item => {
                // Check the 'lists' array in the item
                if (!item.lists || item.lists.length === 0) {
                    return true; // Item has no lists at all
                }

                // Check if item has any lists that still exist
                const hasValidList = item.lists.some(listId =>
                    existingListIds.includes(parseInt(listId))
                );

                return !hasValidList; // Return true for orphaned items (no valid lists)
            });

            // Create a virtual "list zero" containing orphaned items
            const listZero = {
                id: 0,
                ownerId: String(userId),
                listName: "Unassigned Items",
                visibleToGroups: [],
                visibleToUsers: [],
                public: false,
                description: "Items that are not assigned to any list",
                parentId: null,
                sharedWith: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                listItems: orphanedItems,
                isVirtualList: true // Flag to identify this as a virtual list
            };

            return {
                success: true,
                data: listZero
            };
        } catch (error) {
            console.error('Error fetching orphaned items list:', error);
            return {
                success: false,
                message: 'Failed to fetch orphaned items'
            };
        }
    }

    async getAllListsWithOrphaned(userId) {
        try {
            // Get user's regular lists
            const lists = await List.findAll({
                where: { ownerId: String(userId) },
            });

            // Add number of non-deleted items for each list
            const listsWithCount = await Promise.all(lists.map(async (list) => {
                const itemCount = await ListItem.count({
                    where: {
                        deleted: false
                    },
                    include: [{
                        model: List,
                        as: 'associatedLists',
                        where: {
                            id: list.id
                        },
                        through: {
                            attributes: []
                        }
                    }]
                });

                return {
                    ...list.toJSON(),
                    numberItems: itemCount
                };
            }));

            // Get orphaned items list
            const { data: listZeroWithItems } = await this.getOrphanedItemsList(userId);

            // Remove listItems from list zero and add numberItems property
            const listZero = {
                ...listZeroWithItems,
                numberItems: listZeroWithItems.listItems.length
            };

            // Remove listItems property from listZero
            delete listZero.listItems;

            // Add list zero as the first item in the list array
            return [listZero, ...listsWithCount];
        } catch (error) {
            throw error;
        }
    }

    /**
     * Update a list by ID
     * @param {String} id
     * @param {Object} updateData
     * @returns {Promise<Object>}
     */
    async updateList(id, updateData) {
        try {
            const list = await List.findByPk(id);
            if (!list) {
                throw new Error('List not found');
            }

            const updatedList = await list.update(updateData);
            return updatedList;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Delete a list by ID
     * @param {String} id
     * @returns {Promise<Object>}
     */
    async deleteList(id) {
        try {
            const list = await List.findByPk(id);
            if (!list) {
                throw new Error('List not found');
            }

            await list.destroy();
            return { message: 'List deleted successfully' };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get all lists shared with a specific group
     * @param {number} groupId - ID of the group
     * @param {number} userId - ID of the user making the request
     * @returns {Promise<Array>} - Lists shared with the group
     */
    async getListsSharedWithGroup(groupId, userId) {
        try {
            // First verify the user is in the group
            const group = await Group.findByPk(groupId);

            if (!group) {
                return {
                    success: false,
                    message: 'Group not found'
                };
            }

            // Check if the user is a member, admin, or owner of the group
            const isMember = group.members && group.members.includes(userId);
            const isAdmin = group.adminIds && group.adminIds.includes(userId);
            const isOwner = group.ownerId === userId;
            if (!isMember && !isAdmin && !isOwner) {
                return {
                    success: false,
                    message: 'You do not have access to this group'
                };
            }

            // Get all lists shared with this group
            const sharedLists = await List.findAll({
                where: {
                    visibleToGroups: {
                        [Op.contains]: [groupId]
                    }
                }
            });

            // Add number of non-deleted items for each list
            const listsWithCount = await Promise.all(sharedLists.map(async (list) => {
                const itemCount = await ListItem.count({
                    where: {
                        deleted: false
                    },
                    include: [{
                        model: List,
                        as: 'associatedLists',
                        where: {
                            id: list.id
                        },
                        through: {
                            attributes: []
                        }
                    }]
                });

                return {
                    ...list.toJSON(),
                    numberItems: itemCount
                };
            }));

            return {
                success: true,
                data: listsWithCount
            };
        } catch (error) {
            console.error('Error fetching lists shared with group:', error);
            return {
                success: false,
                message: 'An error occurred while fetching lists shared with the group',
                error: error.message
            };
        }
    }

    /**
     * Get lists owned by a specific user that are accessible to the current user
     * @param {String} targetUserId - ID of the user whose lists we want to get
     * @param {String} currentUserId - ID of the currently authenticated user
     * @returns {Promise<Object>} - Lists owned by targetUserId that currentUserId can access
     */
    async getListsByUserIdForCurrentUser(targetUserId, currentUserId) {
        try {
            // Get all lists owned by the target user
            const targetUserLists = await List.findAll({
                where: { ownerId: String(targetUserId) }
            });

            if (targetUserLists.length === 0) {
                return {
                    success: true,
                    data: []
                };
            }

            // Get user's groups to check group-based access
            const userGroups = await Group.findAll({
                where: {
                    members: {
                        [Op.contains]: [String(currentUserId)]
                    },
                    deleted: false
                },
                attributes: ['id']
            });

            const userGroupIds = userGroups.map(group => group.id);

            // Filter lists that the current user can access
            const accessibleLists = targetUserLists.filter(list => {
                // Current user is the owner (same as target user)
                if (String(list.ownerId) === String(currentUserId)) {
                    return true;
                }

                // List is shared directly with current user
                if (list.visibleToUsers && list.visibleToUsers.includes(String(currentUserId))) {
                    return true;
                }

                // List is shared with a group the current user belongs to
                if (list.visibleToGroups && list.visibleToGroups.some(groupId => userGroupIds.includes(groupId))) {
                    return true;
                }

                return false;
            });

            // Add number of non-deleted items for each accessible list
            const listsWithCount = await Promise.all(accessibleLists.map(async (list) => {
                const itemCount = await ListItem.count({
                    where: {
                        lists: { [Op.contains]: [list.id] },
                        deleted: false
                    }
                });

                return {
                    ...list.toJSON(),
                    numberItems: itemCount
                };
            }));

            return {
                success: true,
                data: listsWithCount
            };
        } catch (error) {
            console.error('Error fetching lists by user ID for current user:', error);
            return {
                success: false,
                message: 'An error occurred while fetching user lists',
                error: error.message
            };
        }
    }

    /**
     * Get all lists a user has access to (owned, shared directly, or via groups)
     * @param {String} userId - User ID
     * @returns {Promise<Object>} - All accessible lists
     */
    async getAllAccessibleLists(userId) {
        try {
            // 1. Get lists the user owns (including orphaned items list)
            const ownedListsResult = await this.getAllListsWithOrphaned(userId);

            // 2. Get lists shared directly with the user
            const sharedDirectlyLists = await List.findAll({
                where: {
                    visibleToUsers: {
                        [Op.contains]: [String(userId)]
                    }
                }
            });

            // 3. Get user's groups
            const userGroups = await Group.findAll({
                where: {
                    members: {
                        [Op.contains]: [String(userId)]
                    },
                    deleted: false
                },
                attributes: ['id']
            });

            const userGroupIds = userGroups.map(group => group.id);

            // 4. Get lists shared with the user's groups
            const sharedViaGroupsLists = await List.findAll({
                where: {
                    visibleToGroups: {
                        [Op.overlap]: userGroupIds
                    }
                }
            });

            // 5. Combine all lists, removing duplicates
            const allLists = [...ownedListsResult];

            // Add shared directly lists if not already included
            sharedDirectlyLists.forEach(list => {
                if (!allLists.some(l => l.id === list.id)) {
                    allLists.push(list);
                }
            });

            // Add shared via groups lists if not already included
            sharedViaGroupsLists.forEach(list => {
                if (!allLists.some(l => l.id === list.id)) {
                    allLists.push(list);
                }
            });

            // Add number of non-deleted items for each list (for lists that don't already have this property)
            const listsWithCount = await Promise.all(allLists.map(async (list) => {
                // Skip if list already has numberItems property
                if (list.numberItems !== undefined) {
                    return list;
                }

                const itemCount = await ListItem.count({
                    where: {
                        deleted: false
                    },
                    include: [{
                        model: List,
                        as: 'associatedLists',
                        where: {
                            id: list.id
                        },
                        through: {
                            attributes: []
                        }
                    }]
                });

                return {
                    ...(list.toJSON ? list.toJSON() : list),
                    numberItems: itemCount
                };
            }));

            return {
                success: true,
                data: listsWithCount
            };
        } catch (error) {
            console.error('Error fetching all accessible lists:', error);
            return {
                success: false,
                message: 'An error occurred while fetching accessible lists',
                error: error.message
            };
        }
    }
}

module.exports = new ListService();
