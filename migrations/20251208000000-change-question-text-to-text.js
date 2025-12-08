'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn('questions', 'questionText', {
            type: Sequelize.TEXT,
            allowNull: false
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn('questions', 'questionText', {
            type: Sequelize.STRING(255),
            allowNull: false
        });
    }
};
