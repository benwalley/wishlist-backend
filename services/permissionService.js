const { List, ListItem, User, Group } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const UserService = require('./userService');

class PermissionService {
    /**
     * Check if a user is the parent of another user
     * @param {number|string} parentUserId - The potential parent user ID
     * @param {number|string} childUserId - The potential child user ID
     * @returns {Promise<boolean>} - True if parentUserId is parent of childUserId
     */
    static async isParentOfUser(parentUserId, childUserId) {
        try {
            const childUser = await User.findByPk(childUserId);
            return childUser && String(childUser.parentId) === String(parentUserId);
        } catch (error) {
            console.error('Error checking parent-child relationship:', error);
            return false;
        }
    }

    /**
     * Check if a user has access to a group (member, admin, or owner)
     * @param {number|string} userId - The user ID
     * @param {number|string} groupId - The group ID
     * @returns {Promise<{canAccess: boolean, group?: Object, error?: string}>}
     */
    static async canUserAccessGroup(userId, groupId) {
        try {
            const group = await Group.findByPk(groupId);
            if (!group) {
                return {
                    canAccess: false,
                    error: 'Group not found',
                    errorType: 'GROUP_NOT_FOUND'
                };
            }

            // Check if user is a member, admin, or owner of the group
            const isMember = group.members && group.members.includes(Number(userId));
            const isAdmin = group.adminIds && group.adminIds.includes(Number(userId));
            const isOwner = Number(group.ownerId) === Number(userId);

            if (!isMember && !isAdmin && !isOwner) {
                return {
                    canAccess: false,
                    error: 'You do not have access to this group',
                    errorType: 'UNAUTHORIZED'
                };
            }

            return { canAccess: true, group };
        } catch (error) {
            console.error('Error checking group access:', error);
            return {
                canAccess: false,
                error: 'Failed to check group access',
                errorType: 'PERMISSION_CHECK_ERROR'
            };
        }
    }

    /**
     * Check if a user can add items to specific lists
     * @param {number|string} userId - The user ID
     * @param {Array<number>} listIds - Array of list IDs to check
     * @returns {Promise<{canAccess: boolean, lists?: Array, error?: string}>}
     */
    static async canUserAddToLists(userId, listIds) {
        try {
            if (!Array.isArray(listIds) || listIds.length === 0) {
                return { canAccess: true }; // No lists specified, no restriction
            }

            // Get all specified lists
            const lists = await List.findAll({
                where: { id: listIds }
            });

            // Check that all lists exist
            if (lists.length !== listIds.length) {
                return {
                    canAccess: false,
                    error: 'Some lists were not found',
                    errorType: 'LISTS_NOT_FOUND'
                };
            }

            // Verify user owns all the lists OR is parent of list owners
            for (const list of lists) {
                const isOwner = String(list.ownerId) === String(userId);
                const isParentOfOwner = await this.isParentOfUser(userId, list.ownerId);

                if (!isOwner && !isParentOfOwner) {
                    return {
                        canAccess: false,
                        error: 'You can only add items to lists you own or your subusers own',
                        errorType: 'UNAUTHORIZED'
                    };
                }
            }

            return { canAccess: true, lists };
        } catch (error) {
            console.error('Error checking list permissions:', error);
            return {
                canAccess: false,
                error: 'Failed to check list permissions',
                errorType: 'PERMISSION_CHECK_ERROR'
            };
        }
    }

    /**
     * Check if a user can modify a specific list item
     * @param {number|string} userId - The user ID
     * @param {number|string} itemId - The item ID
     * @returns {Promise<{canAccess: boolean, item?: Object, error?: string}>}
     */
    static async canUserModifyItem(userId, itemId) {
        try {
            const item = await ListItem.findByPk(itemId);

            if (!item) {
                return {
                    canAccess: false,
                    error: 'Item not found',
                    errorType: 'ITEM_NOT_FOUND'
                };
            }

            // For custom items, allow the customItemCreator to modify
            if (item.isCustom && item.customItemCreator && String(item.customItemCreator) === String(userId)) {
                return { canAccess: true, item };
            }

            const isItemCreator = String(item.createdById) === String(userId);
            const isParentOfCreator = await this.isParentOfUser(userId, item.createdById);

            if (!isItemCreator && !isParentOfCreator) {
                return {
                    canAccess: false,
                    error: 'You can only modify items you created or items created by your subusers',
                    errorType: 'UNAUTHORIZED'
                };
            }

            return { canAccess: true, item };
        } catch (error) {
            console.error('Error checking item permissions:', error);
            return {
                canAccess: false,
                error: 'Failed to check item permissions',
                errorType: 'PERMISSION_CHECK_ERROR'
            };
        }
    }

    /**
     * Check if a user can access a specific list
     * @param {number|string} userId - The user ID
     * @param {number|string} listId - The list ID
     * @returns {Promise<{canAccess: boolean, list?: Object, accessType?: string, explicitlyInvited?: boolean, error?: string}>}
     * accessType: 'owner' | 'explicit_user' | 'explicit_group' | 'public'
     * explicitlyInvited: true if user was explicitly added via visibleToUsers or visibleToGroups
     */
    static async canUserAccessList(userId, listId) {
        try {
            const list = await List.findByPk(listId);

            if (!list) {
                return {
                    canAccess: false,
                    error: 'List not found',
                    errorType: 'LIST_NOT_FOUND'
                };
            }

            // Check if user is the owner
            if (String(list.ownerId) === String(userId)) {
                return {
                    canAccess: true,
                    list,
                    accessType: 'owner',
                    explicitlyInvited: false
                };
            }

            // Check if user is in visibleToUsers array
            if (list.visibleToUsers && list.visibleToUsers.map(id => String(id)).includes(String(userId))) {
                return {
                    canAccess: true,
                    list,
                    accessType: 'explicit_user',
                    explicitlyInvited: true
                };
            }

            // Check if user is in any group that has access to the list
            if (list.visibleToGroups && Array.isArray(list.visibleToGroups) && list.visibleToGroups.length > 0) {
                const userGroups = await UserService.getUserGroups(userId);
                const userGroupIds = userGroups.map(group => group.id);

                if (list.visibleToGroups.some(groupId => userGroupIds.includes(Number(groupId)))) {
                    return {
                        canAccess: true,
                        list,
                        accessType: 'explicit_group',
                        explicitlyInvited: true
                    };
                }
            }

            // Check if list is public
            if (list.public === true) {
                return {
                    canAccess: true,
                    list,
                    accessType: 'public',
                    explicitlyInvited: false
                };
            }

            return {
                canAccess: false,
                error: 'You do not have access to this list',
                errorType: 'UNAUTHORIZED'
            };
        } catch (error) {
            console.error('Error checking list access:', error);
            return {
                canAccess: false,
                error: 'Failed to check list access',
                errorType: 'PERMISSION_CHECK_ERROR'
            };
        }
    }

    /**
     * Determine if a user has permission to view a list item
     * @param {Object} item - The list item to check
     * @param {number|string} userId - The ID of the user
     * @param {boolean} hasListAccess - Whether the user has access to the list this item belongs to
     * @returns {Promise<boolean>} - True if the user can view the item, false otherwise
     */
    static async canUserViewItem(item, userId, hasListAccess, explicitlyAllowedToViewList = undefined) {
        // Special handling for custom items: they are never public and ignore visibility settings
        // Custom items are only visible to users with list access (except list owner, handled in listService)
        if (item.isCustom) {
            // User is the custom item creator
            if (item.customItemCreator && String(item.customItemCreator) === String(userId)) {
                return true;
            }

            if(explicitlyAllowedToViewList === false) {
                return false;
            }

            // User created the item (list owner)
            if (String(item.createdById) === String(userId)) {
                return false;
            }

            // manually check if they are specifically invited to see the list
            // If user has list access, they can see custom items
            if (hasListAccess) {
                return true;
            }

            // Otherwise, custom items are not visible
            return false;
        }

        // User created the item
        if (String(item.createdById) === String(userId)) {
            return true;
        }

        // Item is explicitly shared with user
        if (item.visibleToUsers && item.visibleToUsers.map(id => String(id)).includes(String(userId))) {
            return true;
        }

        // Item is shared with groups that the user is a member of
        if (item.visibleToGroups && Array.isArray(item.visibleToGroups) && item.visibleToGroups.length > 0) {
            const userGroups = await UserService.getUserGroups(userId);
            const userGroupIds = userGroups.map(group => group.id);

            if (item.visibleToGroups.some(groupId => userGroupIds.includes(Number(groupId)))) {
                return true;
            }
        }

        // Item is public
        if (item.isPublic) {
            return true;
        }

        // Item inherits list visibility and user has access to the list
        if (item.matchListVisibility && hasListAccess) {
            return true;
        }

        return false;
    }

    /**
     * Check if a user can see items marked as "gotten"
     * Users cannot see gotten status on items they own (to prevent spoilers)
     * @param {Object} item - The list item to check
     * @param {number|string} userId - The ID of the user
     * @returns {boolean} - True if the user can see gotten status, false otherwise
     */
    static canUserSeeGotten(item, userId) {
        // For custom items, the custom item creator can see gotten status (they're coordinating the surprise)
        // but the list owner cannot (they can't even see the item)
        if (item.isCustom) {
            // If user is the custom item creator, they can see gotten status
            if (item.customItemCreator && String(item.customItemCreator) === String(userId)) {
                return true;
            }
            // If user is the list owner (createdById), they can't see it (but they can't see the item anyway)
            if (String(item.createdById) === String(userId)) {
                return false;
            }
            // Other users with access can see gotten status
            return true;
        }

        // If the current user owns the item, they cannot see gotten status (prevents spoilers)
        if (String(item.createdById) === String(userId)) {
            return false;
        }

        // Otherwise, they can see gotten status
        return true;
    }

    /**
     * Throw an ApiError based on permission check result
     * @param {Object} permissionResult - Result from permission check
     * @param {number} defaultStatus - Default HTTP status code
     */
    static throwPermissionError(permissionResult, defaultStatus = 403) {
        const statusMap = {
            'LISTS_NOT_FOUND': 404,
            'ITEM_NOT_FOUND': 404,
            'LIST_NOT_FOUND': 404,
            'GROUP_NOT_FOUND': 404,
            'UNAUTHORIZED': 403,
            'PERMISSION_CHECK_ERROR': 500
        };

        const status = statusMap[permissionResult.errorType] || defaultStatus;

        throw new ApiError(permissionResult.error, {
            status,
            errorType: permissionResult.errorType,
            publicMessage: permissionResult.error
        });
    }
}

module.exports = PermissionService;
