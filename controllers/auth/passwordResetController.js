const PasswordResetService = require('../../services/passwordResetService');

exports.requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;
        
        const result = await PasswordResetService.requestPasswordReset(email);
        
        res.status(200).json({
            success: true,
            message: result.message
        });
    } catch (error) {
        console.error('Error requesting password reset:', error.message);
        
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to request password reset.'
        });
    }
};

exports.validateResetToken = async (req, res) => {
    try {
        const { token } = req.params;
        
        const resetRecord = await PasswordResetService.validateResetToken(token);
        
        res.status(200).json({
            success: true,
            message: 'Token is valid',
            user: {
                email: resetRecord.User.email,
                name: resetRecord.User.name
            }
        });
    } catch (error) {
        console.error('Error validating reset token:', error.message);
        
        res.status(error.statusCode || 400).json({
            success: false,
            message: error.message || 'Invalid reset token.'
        });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        const result = await PasswordResetService.resetPassword(token, newPassword);
        
        res.status(200).json({
            success: true,
            message: result.message
        });
    } catch (error) {
        console.error('Error resetting password:', error.message);
        
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to reset password.'
        });
    }
};