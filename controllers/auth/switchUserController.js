const UserService = require('../../services/UserService');
const models = require('../../models');

exports.switchUser = async (req, res) => {
    try {
        const { subuserID } = req.body;

        // Validate input
        if (!subuserID) {
            return res.status(400).json({
                success: false,
                message: 'Subuser ID is required.',
            });
        }

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated.',
            });
        }

        // Find the subuser and verify it belongs to the current user
        const subuser = await models.User.findOne({
            where: {
                id: subuserID,
                parentId: req.user.id,
                isActive: true
            },
            attributes: { exclude: ['password'] }
        });

        if (!subuser) {
            return res.status(404).json({
                success: false,
                message: 'Subuser not found or you do not have permission to switch to this user.',
            });
        }

        // Generate new tokens for the subuser
        const tokens = await UserService.generateTokens(subuser.id, subuser.email);

        // Respond with tokens and subuser info
        res.status(200).json({
            success: true,
            message: 'Successfully switched to subuser.',
            tokens,
            user: subuser,
        });
    } catch (error) {
        console.error('Error switching to subuser:', error.message);

        // Respond with a clear error message
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to switch to subuser.',
        });
    }
};