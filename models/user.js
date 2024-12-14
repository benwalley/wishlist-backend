'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  User.init({
    name: DataTypes.STRING,
    email: { type: DataTypes.STRING, unique: true },
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users', // Explicitly specify the lowercase table name
    timestamps: true, // Ensures createdAt and updatedAt columns are automatically managed
  });
  return User;
};
