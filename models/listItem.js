'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class ListItem extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         */
        static associate(models) {
            // Define relationships here if needed
            // Example: this.hasMany(models.Gotten, { foreignKey: 'itemId', as: 'gottenByUsers' });
            // Example: this.hasMany(models.WantsToGoInOn, { foreignKey: 'itemId', as: 'wantsToGoInOnUsers' });
        }
    }

    ListItem.init({
        createdById: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true, // Optional price field
        },
        minPrice: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true, // Optional min price
        },
        maxPrice: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true, // Optional max price
        },
        link: {
            type: DataTypes.STRING,
            allowNull: true, // Optional link
            validate: { isUrl: true }, // Validate as a proper URL
        },
        note: {
            type: DataTypes.TEXT, // Multi-line string
            allowNull: true,
        },
        isCustom: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false, // Defaults to false
        },
        deleteOnDate: {
            type: DataTypes.DATE,
            allowNull: true, // Nullable date for deletion scheduling
        },
        visibleToGroups: {
            type: DataTypes.ARRAY(DataTypes.STRING),
            allowNull: true,
            defaultValue: [], // Defaults to empty array
        },
        visibleToUsers: {
            type: DataTypes.ARRAY(DataTypes.STRING),
            allowNull: true,
            defaultValue: [], // Defaults to empty array
        },
        isPublic: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true, // Defaults to true
        },
        imageIds: {
            type: DataTypes.ARRAY(DataTypes.STRING),
            allowNull: true,
            defaultValue: [], // Defaults to empty array
        },
        deleted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false, // Defaults to false
        },
    }, {
        sequelize,
        modelName: 'ListItem',
        tableName: 'list_items', // Explicitly specify the table name
        timestamps: true, // Adds createdAt and updatedAt
    });

    return ListItem;
};
