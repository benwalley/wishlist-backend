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
            // Define relationships
            this.belongsTo(models.ListItem, { foreignKey: 'itemId', as: 'item' });
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
    }, {
        sequelize,
        modelName: 'Money',
        tableName: 'money', // Explicitly specify the lowercase table name
        timestamps: true, // Ensures createdAt and updatedAt columns are automatically managed
        validate: {
            // Custom validation to ensure either owedFrom or owedTo is provided
            owedFromOrTo() {
                if (!this.owedFromId && !this.owedFromName && !this.owedToId && !this.owedToName) {
                    throw new Error('At least one of owedFromId, owedFromName, owedToId, or owedToName must be provided.');
                }
            },
        },
    });

    return Money;
};
