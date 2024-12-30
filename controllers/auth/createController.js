const UserService = require('../../services/userService');

exports.createUser = async (req, res, next) => {
    try {
        const { username, email, password } = req.body;

        const { user, tokens } = await UserService.createUser({ username, email, password });

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            jwtToken: tokens.jwtToken,
            refreshToken: tokens.refreshToken,
            user,
        });
    } catch (error) {
        res.status(error.message === 'A user with this email already exists.' ? 409 : 400).json({
            success: false,
            error: error.message,
        });
    }
};
