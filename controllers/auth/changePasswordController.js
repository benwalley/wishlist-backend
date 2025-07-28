const bcrypt = require('bcryptjs');
const models = require('../../models');
const { User } = models;

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required.',
            });
        }

        // Get user with password
        const user = await User.findByPk(userId, {
            attributes: {
                include: ['password']
            }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        const passwordFromDB = user.getDataValue('password');

        // Check if user has a password set
        if (!passwordFromDB) {
            return res.status(400).json({
                success: false,
                message: 'No password is currently set for this account.',
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, passwordFromDB);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect.',
            });
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await user.update({ password: hashedNewPassword });

        res.status(200).json({
            success: true,
            message: 'Password changed successfully.',
        });
    } catch (error) {
        console.error('Error changing password:', error.message);

        res.status(500).json({
            success: false,
            message: 'Failed to change password.',
        });
    }
};
