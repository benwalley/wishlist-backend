const { List, ListItem } = require('../models');
const { ApiError } = require('../middleware/errorHandler');

class PermissionService {
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

            // Verify user owns all the lists
            for (const list of lists) {
                if (String(list.ownerId) !== String(userId)) {
                    return {
                        canAccess: false,
                        error: 'You can only add items to lists you own',
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

            if (String(item.createdById) !== String(userId)) {
                return {
                    canAccess: false,
                    error: 'You can only modify items you created',
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
     * @returns {Promise<{canAccess: boolean, list?: Object, error?: string}>}
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

            if (String(list.ownerId) !== String(userId)) {
                return {
                    canAccess: false,
                    error: 'You do not have access to this list',
                    errorType: 'UNAUTHORIZED'
                };
            }

            return { canAccess: true, list };
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
     * @returns {boolean} - True if the user can view the item, false otherwise
     */
    static canUserViewItem(item, userId, hasListAccess) {
        // User created the item
        if (String(item.createdById) === String(userId)) {
            return true;
        }

        // Item is explicitly shared with user
        if (item.visibleToUsers && item.visibleToUsers.includes(String(userId))) {
            return true;
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
