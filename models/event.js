'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Event extends Model {
        static associate(models) {
            this.hasMany(models.EventRecipient, { foreignKey: 'eventId', as: 'recipients' });
        }
    }

    Event.init(
        {
            name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            dueDate: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            ownerId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                }
            },
            viewerIds: {
                type: DataTypes.ARRAY(DataTypes.INTEGER),
                allowNull: true,
                defaultValue: [],
            },
            archived: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
        },
        {
            sequelize,
            modelName: 'Event',
            tableName: 'events',
            timestamps: true,
        }
    );

    return Event;
};