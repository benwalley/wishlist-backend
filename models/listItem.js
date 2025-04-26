'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class ListItem extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         */
        static associate(models) {
            // Define relationships
            this.belongsTo(models.User, { foreignKey: 'createdById', as: 'creator' });
            this.belongsToMany(models.List, { through: 'list_items_lists', foreignKey: 'itemId', as: 'associatedLists' });
            this.hasMany(models.Contributor, { foreignKey: 'itemId', as: 'contributors' });
            this.hasMany(models.GiftStatus, { foreignKey: 'itemId', as: 'giftStatuses' });
            this.hasMany(models.Seen, { foreignKey: 'itemId', as: 'seenBy' });
            this.hasMany(models.Comment, { foreignKey: 'itemId', as: 'comments' });
            this.hasMany(models.Money, { foreignKey: 'itemId', as: 'moneyTransactions' });
        }
    }

    ListItem.init({
        createdById: {
            type: DataTypes.INTEGER,
            allowNull: false, // Required field
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        lists: {
            type: DataTypes.ARRAY(DataTypes.INTEGER), // Array of item IDs
            allowNull: true,
            defaultValue: [], // Defaults to an empty array
        },
        price: {
            type: DataTypes.STRING,
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
        links: {
            type: DataTypes.ARRAY(DataTypes.STRING),
            allowNull: true, // Optional link
        },
        notes: {
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
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            allowNull: true,
            defaultValue: [], // Defaults to empty array
        },
        matchListVisibility: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true, // Defaults to false
        },
        amountWanted: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: '',
        },
        minAmountWanted: {
            type: DataTypes.DECIMAL,
            allowNull: true,
        },
        maxAmountWanted: {
            type: DataTypes.DECIMAL,
            allowNull: true,
        },
        priority: {
            type: DataTypes.DECIMAL,
            allowNull: true,
            defaultValue: 0,
        },
        visibleToUsers: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            allowNull: true,
            defaultValue: [], // Defaults to empty array
        },
        isPublic: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true, // Defaults to true
        },
        imageIds: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
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
