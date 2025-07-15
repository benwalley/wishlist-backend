'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class ItemView extends Model {
        static associate(models) {
            // No associations - standalone table
        }
    }

    ItemView.init({
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true
        },
        item_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true
        },
        viewed_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            field: 'viewed_at'
        }
    }, {
        sequelize,
        modelName: 'ItemView',
        tableName: 'item_views',
        timestamps: false,
        underscored: true
    });

    return ItemView;
};