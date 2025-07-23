const crypto = require('crypto');
const models = require('../models');
const { User, PasswordReset } = models;
const { ApiError } = require('../middleware/errorHandler');
const emailService = require('./emailService');
const bcrypt = require('bcryptjs');

class PasswordResetService {
    static async requestPasswordReset(email) {
        if (!email) {
            throw new ApiError('Email is required.', {
                status: 400,
                errorType: 'VALIDATION_ERROR',
                publicMessage: 'Email address is required.'
            });
        }

        const user = await User.findOne({ 
            where: { email, isActive: true },
            attributes: ['id', 'email', 'name']
        });

        if (!user) {
            throw new ApiError('User not found.', {
                status: 404,
                errorType: 'NOT_FOUND',
                publicMessage: 'No account found with this email address.'
            });
        }

        await PasswordReset.update(
            { used: true },
            { 
                where: { 
                    userId: user.id, 
                    used: false,
                    expiresAt: { [models.Sequelize.Op.gt]: new Date() }
                }
            }
        );

        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await PasswordReset.create({
            token: hashedToken,
            userId: user.id,
            expiresAt,
            used: false
        });

        try {
            await emailService.sendPasswordResetEmail(user.email, resetToken, user.name);
        } catch (error) {
            console.error('Failed to send password reset email:', error);
            throw new ApiError('Failed to send password reset email.', {
                status: 500,
                errorType: 'EMAIL_ERROR',
                publicMessage: 'Unable to send password reset email. Please try again later.'
            });
        }

        return {
            message: 'Password reset email sent successfully.',
            email: user.email
        };
    }

    static async validateResetToken(token) {
        if (!token) {
            throw new ApiError('Reset token is required.', {
                status: 400,
                errorType: 'VALIDATION_ERROR',
                publicMessage: 'Reset token is required.'
            });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        
        const resetRecord = await PasswordReset.findOne({
            where: { 
                token: hashedToken,
                used: false,
                expiresAt: { [models.Sequelize.Op.gt]: new Date() }
            },
            include: [{
                model: User,
                attributes: ['id', 'email', 'name']
            }]
        });

        if (!resetRecord) {
            throw new ApiError('Invalid or expired reset token.', {
                status: 400,
                errorType: 'INVALID_TOKEN',
                publicMessage: 'This password reset link is invalid or has expired.'
            });
        }

        return resetRecord;
    }

    static async resetPassword(token, newPassword) {
        if (!token || !newPassword) {
            throw new ApiError('Token and new password are required.', {
                status: 400,
                errorType: 'VALIDATION_ERROR',
                publicMessage: 'Reset token and new password are required.'
            });
        }

        if (newPassword.length < 6) {
            throw new ApiError('Password must be at least 6 characters long.', {
                status: 400,
                errorType: 'VALIDATION_ERROR',
                publicMessage: 'Password must be at least 6 characters long.'
            });
        }

        const resetRecord = await this.validateResetToken(token);
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        await User.update(
            { password: hashedPassword },
            { where: { id: resetRecord.userId } }
        );

        await PasswordReset.update(
            { used: true },
            { where: { id: resetRecord.id } }
        );

        await this.cleanupExpiredTokens();

        return {
            message: 'Password reset successfully.',
            userId: resetRecord.userId
        };
    }

    static async cleanupExpiredTokens() {
        try {
            await PasswordReset.destroy({
                where: {
                    [models.Sequelize.Op.or]: [
                        { expiresAt: { [models.Sequelize.Op.lt]: new Date() } },
                        { used: true }
                    ]
                }
            });
        } catch (error) {
            console.error('Error cleaning up expired tokens:', error);
        }
    }

    static async revokeUserTokens(userId) {
        try {
            await PasswordReset.update(
                { used: true },
                { where: { userId, used: false } }
            );
        } catch (error) {
            console.error('Error revoking user tokens:', error);
        }
    }

    static async deleteAllRequests() {
        try {
            const deletedCount = await PasswordReset.destroy({
                where: {},
                truncate: true
            });
            console.log(`Deleted ${deletedCount} password reset requests`);
            return deletedCount;
        } catch (error) {
            console.error('Error deleting all password reset requests:', error);
            throw error;
        }
    }
}

module.exports = PasswordResetService;