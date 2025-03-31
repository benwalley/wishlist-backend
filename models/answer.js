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
            // // An Answer belongs to a single Question
            // this.belongsTo(models.Question, { foreignKey: 'questionId', as: 'question' });
            //
            // // An Answer is provided by a single User
            // this.belongsTo(models.User, { foreignKey: 'answererId', as: 'answerer' });
        }
    }

    Answer.init({
        questionId: {
            type: DataTypes.INTEGER,
            allowNull: false, // Required field
        },
        answererId: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        answerText: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        visibleToGroups: {
            type: DataTypes.ARRAY(DataTypes.STRING),
            defaultValue: [],
        },
        visibleToUsers: {
            type: DataTypes.ARRAY(DataTypes.STRING),
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
