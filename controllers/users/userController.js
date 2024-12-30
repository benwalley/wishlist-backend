const models = require('../../models');

exports.getUserData = async (req, res, next) => {
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
