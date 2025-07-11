'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Remove the unique constraint on email field
    await queryInterface.removeConstraint('users', 'users_email_key212');
  },

  async down (queryInterface, Sequelize) {
    // Add the unique constraint back on email field
    await queryInterface.addConstraint('users', {
      fields: ['email'],
      type: 'unique',
      name: 'users_email_key212'
    });
  }
};
