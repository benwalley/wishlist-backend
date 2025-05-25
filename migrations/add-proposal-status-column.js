'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('proposals', 'proposalStatus', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'pending'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('proposals', 'proposalStatus');
  }
};