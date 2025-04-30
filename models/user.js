'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // Define associations here
    }
  }

  User.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false, // Ensures this field cannot be null
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
      // Exclude password from being returned by default
      get() {
        return undefined;
      },
    },
    subuserModeOn: {
      type: DataTypes.BOOLEAN,
      defaultValue: false, // Default value
    },
    parentId: {
      type: DataTypes.INTEGER,
    },
    notes: {
      type: DataTypes.TEXT, // Supports multi-line strings
    },
    isUser: {
      type: DataTypes.BOOLEAN,
      defaultValue: true, // Default value
    },
    image: {
      type: DataTypes.INTEGER, // Stores binary data like images
    },
    isSuperAdmin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    notificationPreferences: {
      type: DataTypes.STRING,
    },
    publicDescription: {
      type: DataTypes.TEXT,
    },
    isActive: {
      type: DataTypes.BOOLEAN
    },
    isPublic: {
      type: DataTypes.BOOLEAN
    },
    accountConfig: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users', // Explicitly specify the lowercase table name
    timestamps: true, // Ensures createdAt and updatedAt columns are automatically managed
  });

  return User;
};
