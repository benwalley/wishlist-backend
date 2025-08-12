'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Notification extends Model {
        /**
         * Helper method for defining associations.
         */
        static associate(models) {
            // No associations - notifications are now global
        }
    }

    Notification.init({
        message: {
            type: DataTypes.TEXT,
            allowNull: false,
            validate: {
                notEmpty: true,
                len: [1, 1000] // Message should be between 1 and 1000 characters
            }
        },
        notificationType: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'general',
            validate: {
                isIn: [['general', 'removed_from_group', 'question_asked', 'group_invite', 'someone_go_in_on', 'gotten_item_deleted', 'item_getting', 'item_comment', 'group_activity', 'list_shared', 'proposal', 'system', 'info', 'question_asked']]
            }
        },
        read: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        metadata: {
            type: DataTypes.JSONB,
            allowNull: true,
            comment: 'Additional data related to the notification (e.g., item IDs, group IDs, etc.)'
        }
    }, {
        sequelize,
        modelName: 'Notification',
        tableName: 'notifications',
        timestamps: true,
        indexes: [
            {
                fields: ['createdAt']
            },
            {
                fields: ['notificationType']
            },
            {
                fields: ['read']
            }
        ]
    });

    return Notification;
};
