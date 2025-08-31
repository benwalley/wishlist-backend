const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const models = require('../models');
const { User, RefreshToken, Group, List } = models;
const { Op } = require('sequelize');
const { ApiError } = require('../middleware/errorHandler');

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET;

class UserService {
    /**
     * Register a new user
     * @param {Object} userDetails - { username, email, password }
     * @returns {Promise<Object>} - Created user (excluding sensitive info) and tokens
     */
    static async createUser({ username, email, password }) {
            if (!username || !email || !password) {
                throw new ApiError('All fields are required.', {
                    status: 400,
                    errorType: 'VALIDATION_ERROR',
                    publicMessage: 'Username, email, and password are required.'
                });
            }

            // Convert email to lowercase for consistency
            email = email.toLowerCase().trim();

            // Check if email already exists
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                // If user exists but is inactive, reactivate it
                if (existingUser.isActive === false) {
                    // Update the user details
                    const hashedPassword = await bcrypt.hash(password, 10);
                    await existingUser.update({
                        name: username,
                        password: hashedPassword,
                        isActive: true
                    });
                    
                    // Generate tokens
                    const tokens = await UserService.generateTokens(existingUser.id, existingUser.email);
                    
                    return { user: existingUser, tokens };
                } else {
                    // If user exists and is active, return error
                    throw new ApiError('A user with this email already exists.', {
                        status: 409,
                        errorType: 'USER_EXISTS',
                        publicMessage: 'An account with this email already exists.'
                    });
                }
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create the user
            const newUser = await User.create({
                name: username,
                email,
                password: hashedPassword,
                isActive: true
            });

            // Create a default list for the user
            const listService = require('./listService');
            await listService.createList({
                ownerId: newUser.id,
                listName: username,
                visibleToGroups: [],
                visibleToUsers: [],
                public: false,
                description: "Default wishlist",
            });

            // Generate tokens
            const tokens = await UserService.generateTokens(newUser.id, newUser.email);

            return { user: newUser, tokens };
    }

    /**
     * Create a user from just an email (for invitations)
     * @param {string} email - Email address of the user to invite
     * @param {string} name - Optional name for the user
     * @returns {Promise<Object>} - Created or existing user
     */
    static async findOrCreateUserByEmail(email, name = null) {
        if (!email) {
            throw new ApiError('Email is required.', {
                status: 400,
                errorType: 'VALIDATION_ERROR',
                publicMessage: 'Email address is required.'
            });
        }

        // Convert email to lowercase for consistency
        email = email.toLowerCase().trim();

        // Check if the user already exists
        let user = await User.findOne({
            where: { email },
            attributes: { exclude: ['password'] }
        });

        // If user exists, return it
        if (user) {
            return user;
        }

        const userName = name || email.split('@')[0]; // Use part before @ if no name provided
        user = await User.create({
            name: userName,
            email,
            isActive: false // Mark as inactive until they register properly
        });

        // Create a default list for the placeholder user
        const listService = require('./listService');
        await listService.createList({
            ownerId: user.id,
            listName: userName,
            visibleToGroups: [],
            visibleToUsers: [],
            public: false,
            description: "Default wishlist",
        });

        return user;
    }

    /**
     * Authenticate a user and return tokens
     * @param {string} email - User email
     * @param {string} password - User password
     * @param {string} username - Optional username for subuser login
     * @returns {Promise<Object>} - JWT token and refresh token
     */
    static async authenticateUser(email, password, username = null) {
        if (!email || !password) {
            throw new ApiError('Email and password are required.', {
                status: 400,
                errorType: 'VALIDATION_ERROR',
                publicMessage: 'Email and password are required to log in.'
            });
        }

        // Convert email to lowercase for consistency
        email = email.toLowerCase().trim();

        // Helper function to normalize names for comparison
        const normalizeName = (name) => {
            return name.toLowerCase().replace(/[^a-z]/g, '');
        };

        // Build where clause based on username parameter
        let whereClause = { 
            email,
            isActive: true // Only check active users
        };

        // If username is provided and not empty, filter for subusers with matching names
        if (username && username.trim() !== '') {
            whereClause.parentId = { [Op.ne]: null }; // Only subusers (have parentId)
        } else {
            // If no username, only check parent users (no parentId)
            whereClause.parentId = null;
        }

        // Find users with the email and appropriate parent status
        const users = await User.findAll({
            where: whereClause,
            attributes: {
                include: ['password'] // Explicitly include password
            }
        });

        if (!users || users.length === 0) {
            throw new ApiError('Invalid email or password.', {
                status: 401,
                errorType: 'AUTHENTICATION_ERROR',
                publicMessage: 'The email or password you entered is incorrect.'
            });
        }

        // Try to authenticate with each user that has the same email
        let authenticatedUser = null;
        
        for (const user of users) {
            const passwordFromDB = user.getDataValue('password'); // Get raw value bypassing getter
            
            // Skip users without passwords
            if (!passwordFromDB) {
                continue;
            }
            
            // If username is provided, check if it matches the user's name (normalized)
            if (username && username.trim() !== '') {
                const normalizedUsername = normalizeName(username);
                const normalizedUserName = normalizeName(user.name);
                if (normalizedUsername !== normalizedUserName) {
                    continue; // Skip this user if name doesn't match
                }
            }
            
            const isPasswordValid = await bcrypt.compare(password, passwordFromDB);
            if (isPasswordValid) {
                authenticatedUser = user;
                break; // Found a matching user, stop checking
            }
        }

        if (!authenticatedUser) {
            throw new ApiError('Invalid email or password.', {
                status: 401,
                errorType: 'AUTHENTICATION_ERROR',
                publicMessage: 'The email or password you entered is incorrect.'
            });
        }

        // Generate tokens
        const tokens = await UserService.generateTokens(authenticatedUser.id, authenticatedUser.email);

        // Convert Sequelize instance to plain object and exclude sensitive fields
        const userSafe = authenticatedUser.get({ plain: true });
        delete userSafe.password;

        return { user: userSafe, tokens };
    }



    /**
     * Get user details by ID
     * @param {number} userId - ID of the user
     * @returns {Promise<Object>} - User details (excluding sensitive info)
     */
    static async getUserById(userId) {
        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password'] }, // Do not return the password
        });

        if (!user) {
            throw new ApiError('User not found.', {
                status: 404,
                errorType: 'NOT_FOUND',
                publicMessage: 'The requested user could not be found.'
            });
        }

        return user;
    }

    /**
     * Update user details
     * @param {number} userId - ID of the user
     * @param {Object} updates - Fields to update (e.g., { name, email, password })
     * @returns {Promise<Object>} - Updated user
     */
    static async updateUser(userId, updates) {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new ApiError('User not found.', {
                status: 404,
                errorType: 'NOT_FOUND',
                publicMessage: 'The requested user could not be found.'
            });
        }

        // Hash the new password if it’s being updated
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 10);
        }

        await user.update(updates);

        return user;
    }

    /**
     * Generate JWT and Refresh Tokens
     * @param {number} userId - ID of the user
     * @param {string} email - User email
     * @returns {Promise<Object>} - Tokens (jwtToken and refreshToken)
     */
    static async generateTokens(userId, email) {
        const jwtToken = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '1h' });
        const refreshToken = jwt.sign({ userId }, REFRESH_TOKEN_SECRET, { expiresIn: '30d' });

        // Save refresh token
        const refreshTokenDays = 30;
        const refreshTokenExpiration = new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000); // 30 days
        await RefreshToken.create({
            token: refreshToken,
            userId,
            expiresAt: refreshTokenExpiration,
        });

        return { jwtToken, refreshToken };
    }

    /**
     * Validate a refresh token and generate new tokens
     * @param {string} refreshToken - Refresh token
     * @returns {Promise<Object>} - New JWT and refresh token
     */
    static async refreshTokens(refreshToken) {
        if (!refreshToken) {
            throw new ApiError('Refresh token is required.', {
                status: 400,
                errorType: 'VALIDATION_ERROR',
                publicMessage: 'Refresh token is required.'
            });
        }

        // Verify the refresh token
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

        // Check if the token is valid in the database
        const tokenRecord = await RefreshToken.findOne({
            where: { token: refreshToken, userId: decoded.userId },
        });
        if (!tokenRecord || new Date() > tokenRecord.expiresAt) {
            throw new ApiError('Invalid or expired refresh token.', {
                status: 401,
                errorType: 'INVALID_TOKEN',
                publicMessage: 'Your session has expired. Please log in again.'
            });
        }

        // Generate new tokens
        return UserService.generateTokens(decoded.userId, decoded.email);
    }

    /**
     * Revoke a refresh token
     * @param {string} refreshToken - Refresh token
     * @returns {Promise<void>}
     */
    static async revokeRefreshToken(refreshToken) {
        await RefreshToken.destroy({ where: { token: refreshToken } });
    }

    /**
     * Get all groups a user is part of (as owner, member, admin, or invited)
     * @param {number} userId - ID of the user
     * @returns {Promise<Array>} - List of groups
     */
    static async getUserGroups(userId) {
        if (!userId) {
            throw new ApiError('User ID is required', {
                status: 400,
                errorType: 'VALIDATION_ERROR',
                publicMessage: 'User ID is required'
            });
        }

        const userGroups = await Group.findAll({
            where: {
                [Op.or]: [
                    { ownerId: userId },
                    { members: { [Op.contains]: [userId] } },
                    { adminIds: { [Op.contains]: [userId] } },
                    { invitedIds: { [Op.contains]: [userId] } }
                ]
            }
        });

        return userGroups;
    }

    /**
     * Get all member IDs from a list of groups (including invited users)
     * @param {Array} groups - List of group objects
     * @returns {Set} - Set of unique user IDs
     */
    static getGroupMemberIds(groups) {
        const memberIds = new Set();

        groups.forEach(group => {
            // Add owner
            memberIds.add(group.ownerId);

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

            // Add all invited users
            if (Array.isArray(group.invitedIds)) {
                group.invitedIds.forEach(invitedId => {
                    memberIds.add(invitedId);
                });
            }
        });

        return memberIds;
    }

    /**
     * Get family-related users (user, parent, and subusers)
     * @param {number} userId - ID of the user
     * @returns {Promise<Set>} - Set of user IDs
     */
    static async getFamilyUserIds(userId) {
        const familyIds = new Set([userId]); // Include self

        // Find user's parent if exists
        const currentUser = await User.findByPk(userId);
        if (currentUser && currentUser.parentId) {
            familyIds.add(currentUser.parentId);
        }

        // Find subusers
        const subusers = await User.findAll({
            where: { parentId: userId },
            attributes: ['id']
        });

        subusers.forEach(user => familyIds.add(user.id));

        return familyIds;
    }

    /**
     * Get all users accessible to the current user (yourself, your subusers, users in your groups, and users in groups you're invited to)
     * @param {number} userId - ID of the current user
     * @returns {Promise<Array>} - List of accessible users
     */
    static async getAccessibleUsers(userId) {
        if (!userId) {
            throw new ApiError('User ID is required', {
                status: 400,
                errorType: 'VALIDATION_ERROR',
                publicMessage: 'User ID is required'
            });
        }

        // Get groups and their members
        const userGroups = await this.getUserGroups(userId);
        const groupMemberIds = this.getGroupMemberIds(userGroups);

        // Get family users
        const familyUserIds = await this.getFamilyUserIds(userId);

        // Combine all IDs
        const allAccessibleIds = new Set([...groupMemberIds, ...familyUserIds]);

        // Find all accessible users (only active users)
        const accessibleUsers = await User.findAll({
            where: {
                id: { [Op.in]: [...allAccessibleIds] },
                isActive: true
            },
            attributes: { exclude: ['password'] } // Don't return passwords
        });

        return accessibleUsers;
    }
    
    /**
     * Check if a user has access to view another user
     * @param {number} currentUserId - ID of the requesting user
     * @param {number} targetUserId - ID of the user to access
     * @returns {Promise<boolean>} - Whether the current user has access
     */
    static async hasAccessToUser(currentUserId, targetUserId) {
        try {
            // Case 1: Users are the same
            if (currentUserId === targetUserId) {
                return true;
            }
            
            // Case 2: Target user is public
            const targetUser = await User.findByPk(targetUserId);
            if (!targetUser) {
                return false;
            }
            
            if (targetUser.isPublic) {
                return true;
            }
            
            // Case 3: Current user is parent of target user
            if (targetUser.parentId === currentUserId) {
                return true;
            }
            
            // Case 4: Current user and target user are in the same group
            const userGroups = await this.getUserGroups(currentUserId);
            const groupMemberIds = this.getGroupMemberIds(userGroups);
            
            if (groupMemberIds.has(targetUserId)) {
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error checking user access:', error);
            return false;
        }
    }
    
    /**
     * Get a user by ID if the current user has access
     * @param {number} currentUserId - ID of the requesting user
     * @param {number} targetUserId - ID of the user to fetch
     * @returns {Promise<Object>} - User data if accessible
     */
    static async getUserByIdWithAccess(currentUserId, targetUserId) {
        if (!targetUserId) {
            throw new ApiError('Target user ID is required', {
                status: 400,
                errorType: 'VALIDATION_ERROR',
                publicMessage: 'User ID is required'
            });
        }
        
        const hasAccess = await this.hasAccessToUser(currentUserId, targetUserId);
        
        if (!hasAccess) {
            throw new ApiError('Access denied', {
                status: 403,
                errorType: 'ACCESS_DENIED',
                publicMessage: 'You do not have permission to view this user'
            });
        }
        
        const user = await User.findByPk(targetUserId, {
            attributes: { exclude: ['password'] }
        });
        
        if (!user) {
            throw new ApiError('User not found', {
                status: 404,
                errorType: 'NOT_FOUND',
                publicMessage: 'User not found'
            });
        }
        
        return user;
    }
}

module.exports = UserService;
