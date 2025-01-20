const { List, Group, ListItem } = require('../models');
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
            const list = await List.findByPk(id);
            if (!list) {
                return { error: 'List not found' };
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
                return { error: 'You are not allowed to view this list' };
            }

            // Fetch listItems based on the provided conditions
            const listItems = await ListItem.findAll({
                where: {
                    lists: { [Op.contains]: [list.id] },
                    [Op.or]: [
                        { createdById: String(userId) },
                        { visibleToUsers: { [Op.contains]: [String(userId)] } },
                        { isPublic: true }
                    ]
                }
            });

            return { ...list.toJSON(), listItems };

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
}

module.exports = new ListService();
