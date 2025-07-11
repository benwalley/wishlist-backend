const UserService = require('../../services/UserService');

exports.login = async (req, res) => {
    try {
        const { email, password, username } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.',
            });
        }

        // Authenticate user and generate tokens
        const { user, tokens } = await UserService.authenticateUser(email, password, username);

        // Respond with tokens and user info
        res.status(200).json({
            success: true,
            message: 'Login successful.',
            tokens, // Include tokens explicitly
            user,
        });
    } catch (error) {
        console.error('Error logging in user:', error.message);

        // Respond with a clear error message
        res.status(error.statusCode || 401).json({
            success: false,
            message: error.message || 'Failed to log in.',
        });
    }
};
