const models = require('../../models');

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
