'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class WantsToGoInOn extends Model {
        static associate(models) {
            // Example: this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
            // Example: this.belongsTo(models.ListItem, { foreignKey: 'itemId', as: 'item' });
        }
    }

    WantsToGoInOn.init({
        userId: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        itemId: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        addedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW, // Automatically set to current timestamp
        },
    }, {
        sequelize,
        modelName: 'WantsToGoInOn',
        tableName: 'wants_to_go_in_on', // Explicitly specify the table name
        timestamps: false, // No createdAt or updatedAt
    });

    return WantsToGoInOn;
};
