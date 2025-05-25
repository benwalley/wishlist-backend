'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class ProposalParticipant extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         */
        static associate(models) {
            // Define relationships
            this.belongsTo(models.Proposal, { foreignKey: 'proposalId', as: 'proposal' });
            this.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
        }
    }

    ProposalParticipant.init({
        proposalId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'proposals',
                key: 'id'
            }
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        amountRequested: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        accepted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        rejected: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        isBuying: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        }
    }, {
        sequelize,
        modelName: 'ProposalParticipant',
        tableName: 'proposal_participants',
        timestamps: true, // Adds createdAt and updatedAt
    });

    return ProposalParticipant;
};
