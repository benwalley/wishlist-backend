'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('item_links', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      itemId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: 'itemId',
        references: {
          model: 'list_items',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      label: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      url: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        field: 'createdAt'
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        field: 'updatedAt'
      }
    });

    // Add basic index
    await queryInterface.addIndex('item_links', ['itemId'], {
      name: 'idx_item_links_item_id'
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove index first
    await queryInterface.removeIndex('item_links', 'idx_item_links_item_id');

    // Drop the table
    await queryInterface.dropTable('item_links');
  }
};
