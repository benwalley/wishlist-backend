'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Answer extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            this.belongsTo(models.Question, { foreignKey: 'questionId', as: 'question' });
        }
    }

    Answer.init({
        questionId: {
            type: DataTypes.INTEGER,
            allowNull: false, // Required field
        },
        answererId: {
            type: DataTypes.INTEGER,
            allowNull: false, // Required field
        },
        answerText: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        visibleToGroups: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            defaultValue: [],
        },
        visibleToUsers: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            defaultValue: [],
        },
    }, {
        sequelize,
        modelName: 'Answer',
        tableName: 'answers', // Explicitly specify the lowercase table name
        timestamps: true, // Ensures createdAt and updatedAt columns are automatically managed
    });

    return Answer;
};
