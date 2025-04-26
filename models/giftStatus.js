'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class GiftStatus extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         */
        static associate(models) {
            // Define relationships
            this.belongsTo(models.ListItem, { foreignKey: 'itemId', as: 'item' });
            this.belongsTo(models.User, { foreignKey: 'purchaserId', as: 'purchaser' });
        }
    }

    GiftStatus.init({
        itemId: {
            type: DataTypes.INTEGER,
            allowNull: false, // Required field
        },
        purchaserId: {
            type: DataTypes.INTEGER,
            allowNull: true, // Optional, in case no purchaser is assigned yet
        },
        isOrdered: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false, // Defaults to false
        },
        isArrived: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false, // Defaults to false
        },
        isWrapped: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false, // Defaults to false
        },
        isGiven: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false, // Defaults to false
        },
        actualPrice: {
            type: DataTypes.DECIMAL(10, 2), // 2 decimal places for price
            allowNull: true, // Optional, in case the price is not known
        },
    }, {
        sequelize,
        modelName: 'GiftStatus',
        tableName: 'gift_status', // Explicitly specify the table name
        timestamps: true, // Adds createdAt and updatedAt fields
    });

    return GiftStatus;
};
