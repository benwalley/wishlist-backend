'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Group extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // Define relationships
            this.belongsTo(models.User, { foreignKey: 'ownerId', as: 'owner' });
            this.hasMany(models.Question, { foreignKey: 'groupId', as: 'questions' });
            this.hasMany(models.Comment, { foreignKey: 'groupId', as: 'comments' });
        }
    }

    Group.init({
        groupName: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        groupDescription: {
            type: DataTypes.TEXT, // Multi-line string
            allowNull: true, // Optional
        },
        members: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            defaultValue: [],
        },
        groupImage: {
            type: DataTypes.INTEGER, // Image id
            allowNull: true, // Optional
        },
        invitedIds: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            defaultValue: [],
        },
        adminIds: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            defaultValue: [],
        },
        ownerId: {
            type: DataTypes.INTEGER,
            allowNull: false, // Required field
        },
        deleted: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
    }, {
        sequelize,
        modelName: 'Group',
        tableName: 'groups', // Explicitly specify the lowercase table name
        timestamps: true, // Ensures createdAt and updatedAt columns are automatically managed
    });

    return Group;
};
