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
            // Define relationships here if needed
            // Example: this.belongsTo(models.User, { foreignKey: 'ownerId', as: 'owner' });
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
            type: DataTypes.ARRAY(DataTypes.STRING),
            defaultValue: [],
        },
        groupImage: {
            type: DataTypes.BLOB, // Image blob
            allowNull: true, // Optional
        },
        invitedIds: {
            type: DataTypes.ARRAY(DataTypes.STRING),
            defaultValue: [],
        },
        adminIds: {
            type: DataTypes.ARRAY(DataTypes.STRING),
            defaultValue: [],
        },
        ownerId: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
    }, {
        sequelize,
        modelName: 'Group',
        tableName: 'groups', // Explicitly specify the lowercase table name
        timestamps: true, // Ensures createdAt and updatedAt columns are automatically managed
    });

    return Group;
};
