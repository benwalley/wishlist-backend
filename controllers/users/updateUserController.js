const models = require('../../models');

exports.updateUser = async (req, res, next) => {
    try {
        const { userId, type, value } = req.body;

        if (!userId || !type || !value) {
            return res.status(400).json({ error: 'User ID, type, and value are required.' });
        }

        // Validate type
        const validTypes = ['username', 'email', 'password'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid type. Allowed types are username, email, and password.' });
        }

        // Fetch the user to update
        const user = await models.User.findByPk(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        user[type] = value;

        // Save changes to the database
        const updatedUser = await user.save();

        res.status(200).json({
            success: true,
            message: 'User updated successfully.',
            user: updatedUser,
        });
    } catch (error) {
        console.error('Error updating user:', error);
        next(error);
    }
};
