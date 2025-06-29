'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class EventRecipient extends Model {
        static associate(models) {
            this.belongsTo(models.Event, { foreignKey: 'eventId', as: 'event' });
        }
    }

    EventRecipient.init(
        {
            eventId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'events',
                    key: 'id'
                }
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                }
            },
            note: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            status: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: 'pending'
            },
            budget: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
            },
            sortOrder: {
                type: DataTypes.INTEGER,
                allowNull: true,
                defaultValue: 0,
            },
        },
        {
            sequelize,
            modelName: 'EventRecipient',
            tableName: 'event_recipients',
            timestamps: true,
        }
    );

    return EventRecipient;
};