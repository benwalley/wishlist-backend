'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Comment extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // Define relationships
            this.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
            this.belongsTo(models.ListItem, { foreignKey: 'itemId', as: 'item' });
            this.belongsTo(models.Comment, { foreignKey: 'parentId', as: 'parent' });
            this.hasMany(models.Comment, { foreignKey: 'parentId', as: 'replies' });
        }
    }

    Comment.init({
        contents: {
            type: DataTypes.TEXT, // Multi-line text
            allowNull: false, // Required field
        },
        createdById: {
            type: DataTypes.INTEGER,
            allowNull: false, // Required field
        },
        isAnonymous: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false, // Default to false
        },
        groupId: {
            type: DataTypes.INTEGER,
            allowNull: true, // Optional, linked to a group
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true, // Optional, linked to a user
        },
        itemId: {
            type: DataTypes.INTEGER,
            allowNull: true, // Optional, linked to an item
        },
        visibleToGroups: {
            type: DataTypes.ARRAY(DataTypes.INTEGER), // Array of group IDs
            allowNull: true,
            defaultValue: [], // Default to an empty array
        },
        visibleToUsers: {
            type: DataTypes.ARRAY(DataTypes.INTEGER), // Array of user IDs
            allowNull: true,
            defaultValue: [], // Default to an empty array
        },
        parentId: {
            type: DataTypes.INTEGER,
            allowNull: true, // Optional, for hierarchical comments
        },
        itemType: {
            type: DataTypes.STRING,
            allowNull: true, // Optional, defines the context/type of the item
        },
    }, {
        sequelize,
        modelName: 'Comment',
        tableName: 'comments', // Explicitly specify the lowercase table name
        timestamps: true, // Ensures createdAt and updatedAt columns are automatically managed
        validate: {
            // Example validation: Ensure either groupId, userId, or itemId is set
            visibilityOrAssociation() {
                if (!this.groupId && !this.userId && !this.itemId) {
                    throw new Error('At least one of groupId, userId, or itemId must be provided.');
                }
            },
        },
    });

    return Comment;
};
