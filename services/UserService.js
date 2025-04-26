const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const models = require('../models');
const { User, RefreshToken, Group } = models;
const { Op } = require('sequelize');
const { ApiError } = require('../middleware/errorHandler');

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

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

            // Check if email already exists
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                throw new ApiError('A user with this email already exists.', {
                    status: 409,
                    errorType: 'USER_EXISTS',
                    publicMessage: 'An account with this email already exists.'
                });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create the user
            const newUser = await User.create({
                name: username,
                email,
                password: hashedPassword,
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

        return user;
    }

    /**
     * Authenticate a user and return tokens
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} - JWT token and refresh token
     */
    static async authenticateUser(email, password) {
        if (!email || !password) {
            throw new ApiError('Email and password are required.', {
                status: 400,
                errorType: 'VALIDATION_ERROR',
                publicMessage: 'Email and password are required to log in.'
            });
        }

        // Find the user by email
        const user = await User.findOne({
            where: { email },
        });

        if (!user) {
            throw new ApiError('Invalid email or password.', {
                status: 401,
                errorType: 'AUTHENTICATION_ERROR',
                publicMessage: 'The email or password you entered is incorrect.'
            });
        }

        // Compare password
        const isPasswordValid = await bcrypt.compare(password, user.dataValues.password);
        if (!isPasswordValid) {
            throw new ApiError('Invalid email or password.', {
                status: 401,
                errorType: 'AUTHENTICATION_ERROR',
                publicMessage: 'The email or password you entered is incorrect.'
            });
        }

        // Generate tokens
        const tokens = await UserService.generateTokens(user.id, user.email);

        // Convert Sequelize instance to plain object and exclude sensitive fields
        const userSafe = user.get({ plain: true });
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
     * Get all groups a user is part of (as owner, member, or admin)
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
                    { adminIds: { [Op.contains]: [userId] } }
                ]
            }
        });

        return userGroups;
    }

    /**
     * Get all member IDs from a list of groups
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
     * Get all users accessible to the current user (yourself, your subusers, and users in your groups)
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

        // Find all accessible users
        const accessibleUsers = await User.findAll({
            where: {
                id: { [Op.in]: [...allAccessibleIds] }
            },
            attributes: { exclude: ['password'] } // Don't return passwords
        });

        return accessibleUsers;
    }
}

module.exports = UserService;
