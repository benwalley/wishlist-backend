'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Notification extends Model {
        /**
         * Helper method for defining associations.
         */
        static associate(models) {
            // Associate with User - notifications are user-specific
            this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
        }
    }

    Notification.init({
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true, // Allow null for global/system notifications
            references: {
                model: 'users',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
        },
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
                isIn: [['general', 'removed_from_group', 'question_asked', 'group_invite', 'someone_go_in_on', 'gotten_item_deleted', 'item_getting', 'item_comment', 'group_activity', 'list_shared', 'proposal', 'proposal_created', 'proposal_accepted', 'proposal_deleted', 'system', 'info', 'question_asked']]
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
