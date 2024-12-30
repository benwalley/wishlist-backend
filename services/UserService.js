const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, RefreshToken } = require('../models');

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
                throw new Error('All fields are required.');
            }

            // Check if email already exists
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                throw new Error('A user with this email already exists.');
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
     * Authenticate a user and return tokens
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} - JWT token and refresh token
     */
    static async authenticateUser(email, password) {
        if (!email || !password) {
            throw new Error('Email and password are required.');
        }

        // Find the user by email
        const user = await User.findOne({
            where: { email },
        });

        if (!user) {
            throw new Error('Invalid email or password.');
        }

        // Compare password
        const isPasswordValid = await bcrypt.compare(password, user.dataValues.password);
        if (!isPasswordValid) {
            throw new Error('Invalid email or password.');
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
            throw new Error('User not found.');
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
            throw new Error('User not found.');
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
            throw new Error('Refresh token is required.');
        }

        // Verify the refresh token
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

        // Check if the token is valid in the database
        const tokenRecord = await RefreshToken.findOne({
            where: { token: refreshToken, userId: decoded.userId },
        });
        if (!tokenRecord || new Date() > tokenRecord.expiresAt) {
            throw new Error('Invalid or expired refresh token.');
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
}

module.exports = UserService;
