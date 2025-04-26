const { List, Group, ListItem, sequelize } = require('../models');
const { Op } = require('sequelize'); // Import Op from Sequelize


class ListService {
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
        console.log(userId)
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

            // Fetch listItems based on the provided conditions
            const listItems = await ListItem.findAll({
                where: {
                    lists: { [Op.contains]: [list.id] },
                    deleted: false,
                    [Op.or]: [
                        { createdById: String(userId) },
                        { visibleToUsers: { [Op.contains]: [String(userId)] } },
                        { isPublic: true }
                    ]
                }
            });

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
            // First get all item IDs that are in any list using the junction table
            const itemsInLists = await sequelize.query(`
                SELECT DISTINCT "itemId" 
                FROM "list_items_lists"
            `, { type: sequelize.QueryTypes.SELECT });
            
            const itemIdsInLists = itemsInLists.map(item => item.itemId);
            
            // Now find items created by the user that are not in any list
            const orphanedItems = await ListItem.findAll({
                where: {
                    createdById: userId,
                    deleted: false,
                    // Only include items that don't exist in the list_items_lists table
                    id: {
                        [Op.notIn]: itemIdsInLists.length > 0 ? itemIdsInLists : [0] // Use [0] if empty to avoid SQL error
                    }
                }
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
            console.log('got passedl list')
            if (!list) {
                throw new Error('List not found');
            }

            await list.destroy();
            return { message: 'List deleted successfully' };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new ListService();
