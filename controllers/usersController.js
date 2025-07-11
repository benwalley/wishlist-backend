const models = require('../models');
const { Op } = require('sequelize');
const UserService = require('../services/UserService');
const listService = require('../services/listService');
const bcrypt = require('bcryptjs');

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
        return res.status(401).json({ 
            success: false, 
            message: 'User not authenticated.' 
        });
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

        res.status(200).json({
            success: true,
            data: yourUsers
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred while fetching users.' 
        });
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
 * Get a specific user by ID
 * Checks access permissions based on:
 * 1. If the user is requesting their own profile
 * 2. If the target user is public
 * 3. If the current user is the parent of the target user
 * 4. If both users are in the same group
 */
exports.getUserById = async (req, res, next) => {
    try {
        const currentUserId = req.user.id;
        const targetUserId = parseInt(req.params.id);

        if (isNaN(targetUserId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format'
            });
        }

        const user = await UserService.getUserByIdWithAccess(currentUserId, targetUserId);

        return res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Error fetching user by ID:', error);
        next(error);
    }
};

/**
 * Get all subusers for the current authenticated user
 */
exports.getSubusers = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated.'
            });
        }

        // Get all active users where parentId matches the current user's ID
        const subusers = await models.User.findAll({
            where: {
                parentId: req.user.id,
                isActive: true
            },
            attributes: { exclude: ['password'] } // Exclude password from response
        });

        // Get groups for each subuser
        const subusersWithGroups = await Promise.all(subusers.map(async (subuser) => {
            // Find all groups where this subuser is a member
            const groups = await models.Group.findAll({
                where: {
                    members: {
                        [models.Sequelize.Op.contains]: [subuser.id]
                    },
                    deleted: false
                },
                attributes: ['id', 'groupName', 'groupDescription'] // Only return basic group info
            });

            return {
                ...subuser.toJSON(),
                groups: groups
            };
        }));

        res.status(200).json({
            success: true,
            data: subusersWithGroups
        });
    } catch (error) {
        console.error('Error fetching subusers:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching subusers'
        });
    }
};

/**
 * Edit a subuser's information (only if it belongs to the current user)
 */
exports.editSubuser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, publicDescription, image, notes, isPublic } = req.body;

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated.'
            });
        }

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Subuser ID is required.'
            });
        }

        // Ensure at least one update field is provided
        if (
            name === undefined &&
            publicDescription === undefined &&
            image === undefined &&
            notes === undefined &&
            isPublic === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: 'At least one field (name, publicDescription, image, notes, isPublic) is required for update.'
            });
        }

        // Find the subuser and verify it belongs to the current user
        const subuser = await models.User.findOne({
            where: {
                id: id,
                parentId: req.user.id,
                isActive: true
            }
        });

        if (!subuser) {
            return res.status(404).json({
                success: false,
                message: 'Subuser not found or you do not have permission to edit this user.'
            });
        }

        // Update fields if they are provided
        if (name !== undefined) {
            subuser.name = name;
        }
        if (publicDescription !== undefined) {
            subuser.publicDescription = publicDescription;
        }
        if (image !== undefined) {
            subuser.image = image;
        }
        if (notes !== undefined) {
            subuser.notes = notes;
        }
        if (isPublic !== undefined) {
            subuser.isPublic = isPublic;
        }

        // Save changes to the database
        const updatedSubuser = await subuser.save();

        // Remove password from response
        const { password: _, ...subuserResponse } = updatedSubuser.toJSON();

        res.status(200).json({
            success: true,
            message: 'Subuser updated successfully',
            user: subuserResponse
        });
    } catch (error) {
        console.error('Error updating subuser:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while updating the subuser'
        });
    }
};

/**
 * Update groups for a subuser (only if it belongs to the current user)
 */
exports.updateSubuserGroups = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { groupIds } = req.body;

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated.'
            });
        }

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Subuser ID is required.'
            });
        }

        if (!Array.isArray(groupIds)) {
            return res.status(400).json({
                success: false,
                message: 'groupIds must be an array of group IDs.'
            });
        }

        // Find the subuser and verify it belongs to the current user
        const subuser = await models.User.findOne({
            where: {
                id: id,
                parentId: req.user.id,
                isActive: true
            }
        });

        if (!subuser) {
            return res.status(404).json({
                success: false,
                message: 'Subuser not found or you do not have permission to edit this user.'
            });
        }

        // Get all groups where the current user has permission to add members
        const userGroups = await models.Group.findAll({
            where: {
                [models.Sequelize.Op.or]: [
                    { ownerId: req.user.id },
                    { adminIds: { [models.Sequelize.Op.contains]: [req.user.id] } }
                ],
                deleted: false
            }
        });

        const allowedGroupIds = userGroups.map(group => group.id);

        // Validate that all requested group IDs are groups the user can manage
        const invalidGroupIds = groupIds.filter(groupId => !allowedGroupIds.includes(groupId));
        if (invalidGroupIds.length > 0) {
            return res.status(403).json({
                success: false,
                message: `You do not have permission to add users to groups: ${invalidGroupIds.join(', ')}`
            });
        }

        // Remove subuser from all current groups where parent user has permission
        await models.Group.update(
            {
                members: models.Sequelize.literal(`array_remove(members, ${subuser.id})`)
            },
            {
                where: {
                    [models.Sequelize.Op.or]: [
                        { ownerId: req.user.id },
                        { adminIds: { [models.Sequelize.Op.contains]: [req.user.id] } }
                    ],
                    deleted: false
                }
            }
        );

        // Add subuser to the new groups
        if (groupIds.length > 0) {
            await models.Group.update(
                {
                    members: models.Sequelize.literal(`array_append(members, ${subuser.id})`)
                },
                {
                    where: {
                        id: { [models.Sequelize.Op.in]: groupIds },
                        deleted: false
                    }
                }
            );
        }

        res.status(200).json({
            success: true,
            message: 'Subuser groups updated successfully',
            groupIds: groupIds
        });
    } catch (error) {
        console.error('Error updating subuser groups:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while updating subuser groups'
        });
    }
};

/**
 * Delete a subuser by ID (only if it belongs to the current user)
 */
exports.deleteSubuser = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated.'
            });
        }

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Subuser ID is required.'
            });
        }

        // Find the subuser and verify it belongs to the current user
        const subuser = await models.User.findOne({
            where: {
                id: id,
                parentId: req.user.id
            }
        });

        if (!subuser) {
            return res.status(404).json({
                success: false,
                message: 'Subuser not found or you do not have permission to delete this user.'
            });
        }

        // Deactivate the subuser instead of deleting
        await subuser.update({ isActive: false });

        res.status(200).json({
            success: true,
            message: 'Subuser deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting subuser:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while deleting the subuser'
        });
    }
};

/**
 * Create a subuser for the current authenticated user
 */
exports.createSubuser = async (req, res, next) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required.'
            });
        }

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated.'
            });
        }

        // Check if the password is the same as the parent user's password
        const parentUser = await models.User.findByPk(req.user.id);
        if (parentUser && parentUser.password) {
            const isSamePassword = await bcrypt.compare(password, parentUser.password);
            if (isSamePassword) {
                return res.status(400).json({
                    success: false,
                    message: 'The password can\'t match the parent user'
                });
            }
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create the subuser
        const subuser = await models.User.create({
            name: username,
            email: req.user.email,
            password: hashedPassword,
            parentId: req.user.id,
            isUser: true,
            isActive: true
        });

        // Create a default list for the subuser
        await listService.createList({
            ownerId: subuser.id,
            listName: username,
            visibleToGroups: [],
            visibleToUsers: [],
            public: false,
            description: "Default wishlist",
        });

        // Remove password from response
        const { password: _, ...subuserResponse } = subuser.toJSON();

        res.status(201).json({
            success: true,
            message: 'Subuser created successfully',
            user: subuserResponse
        });
    } catch (error) {
        console.error('Error creating subuser:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while creating the subuser'
        });
    }
};

/**
 * Alias for getPublicUsers - used for the root /users endpoint
 */
exports.getUserData = exports.getPublicUsers;
