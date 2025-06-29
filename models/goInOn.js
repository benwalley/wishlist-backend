'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class GoInOn extends Model {
        static associate(models) {
            this.belongsTo(models.ListItem, { foreignKey: 'itemId', as: 'item' });
        }
    }

    GoInOn.init(
        {
            giverId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                }
            },
            getterId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                }
            },
            itemId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'list_items',
                    key: 'id'
                }
            },
        },
        {
            sequelize,
            modelName: 'GoInOn',
            tableName: 'go_in_on',
            timestamps: true,
        }
    );

    return GoInOn;
};