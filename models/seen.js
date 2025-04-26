'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Seen extends Model {
        static associate(models) {
            // A Seen record belongs to a User
            this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
            
            // A Seen record belongs to an Item
            this.belongsTo(models.ListItem, { foreignKey: 'itemId', as: 'item' });
        }
    }

    Seen.init({
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        itemId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        seenAt: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: DataTypes.NOW,
        },
    }, {
        sequelize,
        modelName: 'Seen',
        tableName: 'seen',
        timestamps: false, // Timestamps managed manually via seenAt
    });

    return Seen;
};
