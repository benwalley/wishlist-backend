'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Proposal extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         */
        static associate(models) {
            // Define relationships
            this.belongsTo(models.ListItem, { foreignKey: 'itemId', as: 'itemData' });
            this.belongsTo(models.User, { foreignKey: 'proposalCreatorId', as: 'creator' });
            this.hasMany(models.ProposalParticipant, { foreignKey: 'proposalId', as: 'proposalParticipants' });
        }
    }

    Proposal.init({
        itemId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'list_items',
                key: 'id'
            }
        },
        proposalCreatorId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        deleted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false, // Defaults to false
        },
        status: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        proposalStatus: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'none',
        },
    }, {
        sequelize,
        modelName: 'Proposal',
        tableName: 'proposals',
        timestamps: true, // Adds createdAt and updatedAt
    });

    return Proposal;
};
