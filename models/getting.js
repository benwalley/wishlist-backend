'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Getting extends Model {
        static associate(models) {
            this.belongsTo(models.ListItem, { foreignKey: 'itemId', as: 'item' });
            this.belongsTo(models.Proposal, { foreignKey: 'proposalId', as: 'proposal' });
        }
    }

    Getting.init(
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
            proposalId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: 'proposals',
                    key: 'id'
                }
            },
        },
        {
            sequelize,
            modelName: 'Getting',
            tableName: 'getting',
            timestamps: true,
        }
    );

    return Getting;
};
