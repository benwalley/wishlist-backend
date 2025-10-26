'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add customItemCreator column to list_items table
    await queryInterface.addColumn('list_items', 'customItemCreator', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'ID of the user who created this custom item'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove customItemCreator column
    await queryInterface.removeColumn('list_items', 'customItemCreator');
  }
};
