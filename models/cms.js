'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Cms extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
    }

    Cms.init({
        createdById: {
            type: DataTypes.INTEGER,
            allowNull: false, // Required field
        },
        location: {
            type: DataTypes.STRING,
            allowNull: false, // Required field
        },
        contents: {
            type: DataTypes.TEXT, // Multi-line text (HTML-supported)
            allowNull: false, // Required field
        },
        startDate: {
            type: DataTypes.DATE, // Optional start date
            allowNull: true,
        },
        endDate: {
            type: DataTypes.DATE, // Optional end date
            allowNull: true,
        },
    }, {
        sequelize,
        modelName: 'Cms',
        tableName: 'cms', // Explicitly specify the lowercase table name
        timestamps: true, // Ensures createdAt and updatedAt columns are automatically managed
        validate: {
            // Custom validation: Ensure endDate is after startDate (if both are provided)
            endDateAfterStartDate() {
                if (this.startDate && this.endDate && this.endDate <= this.startDate) {
                    throw new Error('endDate must be after startDate.');
                }
            },
        },
    });

    return Cms;
};
