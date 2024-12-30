'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class List extends Model {
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

    List.init({
        ownerId: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        listName: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        items: {
            type: DataTypes.ARRAY(DataTypes.STRING), // Array of item IDs
            allowNull: true,
            defaultValue: [], // Defaults to an empty array
        },
        visibleToGroups: {
            type: DataTypes.ARRAY(DataTypes.STRING), // Array of group IDs
            allowNull: true,
            defaultValue: [], // Defaults to an empty array
        },
        visibleToUsers: {
            type: DataTypes.ARRAY(DataTypes.STRING), // Array of user IDs
            allowNull: true,
            defaultValue: [], // Defaults to an empty array
        },
        public: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false, // Defaults to false
        },
        description: {
            type: DataTypes.TEXT, // Optional, for additional context
            allowNull: true,
        },
        parentId: {
            type: DataTypes.STRING,
            allowNull: true, // Optional, for hierarchical lists
        },
        sharedWith: {
            type: DataTypes.ARRAY(DataTypes.STRING), // Array of user IDs
            allowNull: true,
            defaultValue: [], // Defaults to an empty array
        },
    }, {
        sequelize,
        modelName: 'List',
        tableName: 'lists', // Explicitly specify the lowercase table name
        timestamps: true, // Ensures createdAt and updatedAt columns are automatically managed
    });

    return List;
};
