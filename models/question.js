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
            // Define associations
            this.hasMany(models.Answer, { foreignKey: 'questionId', as: 'answers' });
            this.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });

            this.belongsToMany(models.Group, {
                through: 'QuestionGroups',
                foreignKey: 'questionId',
                otherKey: 'groupId',
                as: 'sharedWithGroups'
            });
        }
    }

    Question.init({
        askedById: {
            type: DataTypes.INTEGER,
            allowNull: false, // Makes this field required
        },
        isAnonymous: { // Fixed spelling
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: 'false', // Default value
        },
        questionText: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        sharedWithGroupIds: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            allowNull: true, // Optional
        },
        sharedWithUserIds: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            allowNull: true, // Optional
        },
        dueDate: {
            type: DataTypes.DATE, // Timestamp
            allowNull: true, // Optional
        },
        deleted: {
            type: DataTypes.BOOLEAN,
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
