const models = require('../models');
const { Op } = require('sequelize');

/**
 * Get all users with their complete data including lists, groups, and invitations
 * @param {Object} options - Query options
 * @param {string} options.query - Search term to filter by name or email
 * @param {number} options.limit - Number of results per page
 * @param {number} options.offset - Offset for pagination
 */
exports.getAllUsers = async ({ query = null, limit = 20, offset = 0 } = {}) => {
    try {
        // Build where clause for filtering
        const whereClause = {};

        if (query) {
            whereClause[Op.or] = [
                { name: { [Op.iLike]: `%${query}%` } },
                { email: { [Op.iLike]: `%${query}%` } }
            ];
        }

        const { count, rows: users } = await models.User.findAndCountAll({
            where: whereClause,
            attributes: {
                exclude: ['password'] // Don't include password in response
            },
            include: [
                {
                    model: models.List,
                    as: 'owner',
                    required: false,
                    separate: true
                }
            ],
            limit,
            offset,
            order: [['id', 'ASC']]
        });

        // For each user, fetch their group memberships and invitations
        const usersWithGroups = await Promise.all(users.map(async (user) => {
            const userJson = user.toJSON();

            // Find groups where user is a member
            const groups = await models.Group.findAll({
                where: {
                    members: {
                        [models.Sequelize.Op.contains]: [user.id]
                    }
                },
                attributes: ['id', 'groupName', 'groupDescription', 'ownerId', 'members', 'adminIds', 'createdAt']
            });

            // Find groups where user is invited
            const groupInvitations = await models.Group.findAll({
                where: {
                    invitedIds: {
                        [models.Sequelize.Op.contains]: [user.id]
                    }
                },
                attributes: ['id', 'groupName', 'groupDescription', 'ownerId', 'invitedIds', 'createdAt']
            });

            // Rename 'owner' to 'lists'
            const { owner: lists, ...rest } = userJson;

            return {
                ...rest,
                lists,
                groups,
                groupInvitations
            };
        }));

        return {
            users: usersWithGroups,
            total: count,
            totalPages: Math.ceil(count / limit),
            currentPage: Math.floor(offset / limit) + 1,
            pageSize: limit
        };
    } catch (error) {
        console.error('Error in superAdminService.getAllUsers:', error);
        throw error;
    }
};

/**
 * Get list of all available database tables
 * @returns {Array} List of table names
 */
exports.getDatabaseTables = () => {
    // Whitelist of allowed tables
    const allowedTables = [
        'User',
        'List',
        'ListItem',
        'Group',
        'Event',
        'EventRecipient',
        'Contributor',
        'Comment',
        'Question',
        'Answer',
        'Proposal',
        'ProposalParticipant',
        'Notification',
        'Image',
        'ItemLink',
        'ItemView',
        'Getting',
        'GoInOn',
        'Money',
        'Job',
        'Seen',
        'RefreshToken',
        'PasswordReset',
        'Address',
        'Cms'
    ];

    return allowedTables.sort();
};

/**
 * Get paginated data from any database table with filtering
 * @param {Object} options - Query options
 * @param {string} options.tableName - Name of the table/model
 * @param {number} options.page - Page number
 * @param {number} options.limit - Results per page
 * @param {string} options.sortBy - Column to sort by
 * @param {string} options.sortOrder - Sort order (ASC/DESC)
 * @param {Object} options.filters - Column filters { columnName: value }
 * @param {number} options.idMin - Minimum ID
 * @param {number} options.idMax - Maximum ID
 */
exports.getDatabaseTable = async ({
    tableName,
    page = 1,
    limit = 20,
    sortBy = 'id',
    sortOrder = 'ASC',
    filters = {},
    idMin = null,
    idMax = null
} = {}) => {
    try {
        // Validate table name against whitelist
        const allowedTables = exports.getDatabaseTables();
        if (!allowedTables.includes(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
        }

        // Get the model
        const model = models[tableName];
        if (!model) {
            throw new Error(`Model not found: ${tableName}`);
        }

        // Build where clause
        const whereClause = {};

        // Add ID range filter
        if (idMin !== null || idMax !== null) {
            whereClause.id = {};
            if (idMin !== null) {
                whereClause.id[Op.gte] = idMin;
            }
            if (idMax !== null) {
                whereClause.id[Op.lte] = idMax;
            }
        }

        // Add column filters
        const modelAttributes = Object.keys(model.rawAttributes);
        Object.keys(filters).forEach(column => {
            // Validate column exists in model
            if (modelAttributes.includes(column)) {
                const value = filters[column];
                // Use ILIKE for string columns, exact match for others
                const attributeType = model.rawAttributes[column].type.constructor.name;
                if (attributeType === 'STRING' || attributeType === 'TEXT') {
                    whereClause[column] = { [Op.iLike]: `%${value}%` };
                } else {
                    whereClause[column] = value;
                }
            }
        });

        // Validate sortBy column
        if (!modelAttributes.includes(sortBy)) {
            sortBy = 'id'; // Fallback to id
        }

        // Validate sortOrder
        const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'ASC';

        // Calculate offset
        const offset = (page - 1) * limit;

        // Build attributes - exclude password if it's User table
        const attributes = tableName === 'User'
            ? { exclude: ['password'] }
            : undefined;

        // Query database
        const { count, rows } = await model.findAndCountAll({
            where: whereClause,
            attributes,
            limit: Math.min(limit, 100), // Cap at 100
            offset,
            order: [[sortBy, validSortOrder]]
        });

        return {
            tableName,
            data: rows,
            pagination: {
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: page,
                pageSize: limit
            },
            filters: {
                sortBy,
                sortOrder: validSortOrder,
                appliedFilters: filters,
                idRange: { min: idMin, max: idMax }
            }
        };
    } catch (error) {
        console.error('Error in superAdminService.getDatabaseTable:', error);
        throw error;
    }
};
