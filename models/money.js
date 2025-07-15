'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Money extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // No associations - completely self contained
        }
    }

    Money.init({
        ownerId: {
            type: DataTypes.INTEGER,
            allowNull: false, // Required field
        },
        owedFromId: {
            type: DataTypes.INTEGER,
            allowNull: true, // Optional, either this or owedFromName should be set
        },
        owedFromName: {
            type: DataTypes.STRING,
            allowNull: true, // Optional
        },
        owedToId: {
            type: DataTypes.INTEGER,
            allowNull: true, // Optional, either this or owedToName should be set
        },
        owedToName: {
            type: DataTypes.STRING,
            allowNull: true, // Optional
        },
        note: {
            type: DataTypes.STRING,
            allowNull: true, // Optional note about the transaction
        },
        itemId: {
            type: DataTypes.INTEGER,
            allowNull: true, // Optional reference to an item
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2), // Stores money values with precision
            allowNull: false, // Required field
        },
        completed: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false, // Defaults to false (not completed)
        },
        completedAt: {
            type: DataTypes.DATE,
            allowNull: true, // Nullable until transaction is completed
            defaultValue: null,
        },
    }, {
        sequelize,
        modelName: 'Money',
        tableName: 'money', // Explicitly specify the lowercase table name
        timestamps: true, // Ensures createdAt and updatedAt columns are automatically managed
    });

    return Money;
};
