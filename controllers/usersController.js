const models = require('../models');
const { Op } = require('sequelize');
const UserService = require('../services/UserService');

/**
 * Get the current authenticated user
 */
exports.getCurrentUser = async (req, res) => {
    // Passport populates req.user with the authenticated user
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    res.json(req.user);
};

/**
 * Get the current user and their subusers
 */
exports.getYourUsers = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    try {
        const yourUsers = await models.User.findAll({
            where: {
                [Op.or]: [
                    { id: req.user.id },
                    { parentId: req.user.id }
                ]
            }
        });

        res.json(yourUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'An error occurred while fetching users.' });
    }
};

/**
 * Get all users that the current user has access to
 * (current user + user's subusers + users in the same groups)
 */
exports.getAccessibleUsers = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    try {
        const accessibleUsers = await UserService.getAccessibleUsers(req.user.id);
        res.json(accessibleUsers);
    } catch (error) {
        console.error('Error fetching accessible users:', error);
        res.status(500).json({ error: 'An error occurred while fetching accessible users.' });
    }
};

/**
 * Get public users based on search query
 */
exports.getPublicUsers = async (req, res, next) => {
    try {
        const { search } = req.query;

        if (!search || search.trim() === '') {
            return res.status(400).json({ error: 'Search query is required.' });
        }

        const users = await models.User.findAll({
            where: {
                isPublic: true,
                [models.Sequelize.Op.or]: [
                    { name: { [models.Sequelize.Op.iLike]: `%${search}%` } },
                    { email: { [models.Sequelize.Op.iLike]: `%${search}%` } },
                ],
            },
        });

        res.json(users);
    } catch (error) {
        console.error('Error fetching public users:', error);
        next(error);
    }
};

/**
 * Update a user's information
 */
exports.updateUser = async (req, res, next) => {
    try {
        const { userId, name, publicDescription, image, notes, isPublic } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required.' });
        }

        // Ensure at least one update field is provided.
        if (
            name === undefined &&
            publicDescription === undefined &&
            image === undefined &&
            notes === undefined &&
            isPublic === undefined
        ) {
            return res.status(400).json({
                error:
                    'At least one field (name, publicDescription, image, notes, isPublic) is required for update.'
            });
        }

        // Fetch the user to update.
        const user = await models.User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Update fields if they are provided.
        if (name !== undefined) {
            user.name = name;
        }
        if (publicDescription !== undefined) {
            user.publicDescription = publicDescription;
        }
        if (image !== undefined) {
            user.image = image;
        }
        if (notes !== undefined) {
            user.notes = notes;
        }
        if (isPublic !== undefined) {
            user.isPublic = isPublic;
        }

        // Save changes to the database.
        const updatedUser = await user.save();

        res.status(200).json({
            success: true,
            message: 'User updated successfully.',
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating user:', error);
        next(error);
    }
};

/**
 * Alias for getPublicUsers - used for the root /users endpoint
 */
exports.getUserData = exports.getPublicUsers;