'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Contributor extends Model {
        static associate(models) {
            this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
            this.belongsTo(models.ListItem, { foreignKey: 'itemId', as: 'item' });
        }
    }

    Contributor.init(
        {
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            itemId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            getting: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
            contributing: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
            contributeAmount: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
            },
            isAmountPrivate: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
            numberGetting: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            status: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: 'none'
            },
            actualPrice: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
            },
        },
        {
            sequelize,
            modelName: 'Contributor',
            tableName: 'contributors', // Explicitly specify the table name
            timestamps: false,         // Disable createdAt and updatedAt
        }
    );

    return Contributor;
};
