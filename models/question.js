'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Question extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // Define associations here
            // Example: this.belongsTo(models.User, { foreignKey: 'askedById' });
        }
    }

    Question.init({
        askedById: {
            type: DataTypes.STRING,
            allowNull: false, // Makes this field required
        },
        isAnonymous: { // Fixed spelling
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'false', // Default value
        },
        questionText: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        groupId: {
            type: DataTypes.STRING,
            allowNull: true, // Optional
        },
        userId: {
            type: DataTypes.STRING,
            allowNull: true, // Optional
        },
        dueDate: {
            type: DataTypes.DATE, // Timestamp
            allowNull: true, // Optional
        },
    }, {
        sequelize,
        modelName: 'Question',
        tableName: 'questions', // Explicitly specify the lowercase table name
        timestamps: true, // Adds createdAt and updatedAt
    });

    return Question;
};
