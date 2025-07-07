'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class ItemLink extends Model {
        static associate(models) {
            // Many-to-one relationship with ListItem
            this.belongsTo(models.ListItem, {
                foreignKey: 'itemId',
                as: 'item',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
        }
    }

    ItemLink.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        itemId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'list_items',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
        },
        label: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        url: {
            type: DataTypes.TEXT,
            allowNull: false
        }
    }, {
        sequelize,
        modelName: 'ItemLink',
        tableName: 'item_links',
        timestamps: true
    });

    return ItemLink;
};
