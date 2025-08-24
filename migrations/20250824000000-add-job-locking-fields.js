'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add new fields for database-only job processing
    // First add as nullable to avoid constraint violations on existing data
    await queryInterface.addColumn('jobs', 'queuedAt', {
      type: Sequelize.DATE,
      allowNull: true
    });

    await queryInterface.addColumn('jobs', 'lockedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Timestamp when job was locked for processing'
    });

    await queryInterface.addColumn('jobs', 'lockedBy', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Identifier of the process/instance processing this job'
    });

    await queryInterface.addColumn('jobs', 'maxRetries', {
      type: Sequelize.INTEGER,
      defaultValue: 3,
      allowNull: false,
      comment: 'Maximum number of retry attempts'
    });

    await queryInterface.addColumn('jobs', 'retryCount', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Current number of retry attempts'
    });

    // Add indexes for efficient job queries
    await queryInterface.addIndex('jobs', ['status', 'queuedAt'], {
      name: 'jobs_status_queued_at_idx'
    });

    await queryInterface.addIndex('jobs', ['lockedAt'], {
      name: 'jobs_locked_at_idx'
    });

    // Update existing jobs to have queuedAt = createdAt
    await queryInterface.sequelize.query(`
      UPDATE jobs SET queuedAt = createdAt WHERE queuedAt IS NULL;
    `);

    // Now make queuedAt NOT NULL since all existing records have been updated
    await queryInterface.changeColumn('jobs', 'queuedAt', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('jobs', 'jobs_status_queued_at_idx');
    await queryInterface.removeIndex('jobs', 'jobs_locked_at_idx');

    // Remove columns
    await queryInterface.removeColumn('jobs', 'queuedAt');
    await queryInterface.removeColumn('jobs', 'lockedAt');
    await queryInterface.removeColumn('jobs', 'lockedBy');
    await queryInterface.removeColumn('jobs', 'maxRetries');
    await queryInterface.removeColumn('jobs', 'retryCount');
  }
};