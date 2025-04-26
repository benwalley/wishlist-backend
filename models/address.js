'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Address extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // Define relationships
            this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
        }
    }

    Address.init({
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false, // Required field
        },
        address: {
            type: DataTypes.TEXT, // Multi-line string
            allowNull: false, // Required field
        },
        visibleToGroups: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            defaultValue: [],
        },
        visibleToUsers: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            defaultValue: [],
        },
    }, {
        sequelize,
        modelName: 'Address',
        tableName: 'addresses', // Explicitly specify the lowercase table name
        timestamps: true, // Ensures createdAt and updatedAt columns are automatically managed
    });

    return Address;
};
