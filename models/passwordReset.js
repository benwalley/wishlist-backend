'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PasswordReset extends Model {
    static associate(models) {
      PasswordReset.belongsTo(models.User, { foreignKey: 'userId' });
    }
  }

  PasswordReset.init({
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    used: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    sequelize,
    modelName: 'PasswordReset',
    tableName: 'password_resets',
    timestamps: true
  });

  return PasswordReset;
};