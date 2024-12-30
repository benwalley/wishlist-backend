'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    class Image extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // Define associations here if needed
            // Example: this.belongsTo(models.User, { foreignKey: 'uploadedById', as: 'uploader' });
        }
    }

    Image.init({
        recordId: {
            type: DataTypes.STRING, // Foreign key to associate this image with another table
            allowNull: true,
        },
        recordType: {
            type: DataTypes.STRING, // Optional: Type of record the image is associated with
            allowNull: true,
        },
        imageData: {
            type: DataTypes.BLOB('long'), // Binary data for the image
            allowNull: false,
        },
        contentType: {
            type: DataTypes.STRING, // MIME type, e.g., 'image/jpeg', 'image/png'
            allowNull: false,
        },
        metadata: {
            type: DataTypes.JSONB, // Optional: Additional metadata like size, dimensions, etc.
            allowNull: true,
        },
    }, {
        sequelize,
        modelName: 'Image',
        tableName: 'images',
        timestamps: true, // Adds createdAt and updatedAt fields
    });

    return Image;
};
