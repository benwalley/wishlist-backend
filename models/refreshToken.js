'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class RefreshToken extends Model {
        static associate(models) {
            // A RefreshToken belongs to a User
            this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
        }
    }

    RefreshToken.init({
        token: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true, // Ensure tokens are unique
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    }, {
        sequelize,
        modelName: 'RefreshToken',
        tableName: 'refresh_tokens',
        timestamps: false, // No createdAt/updatedAt fields needed
    });

    return RefreshToken;
};
