'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn('answers', 'answerText', {
            type: Sequelize.TEXT,
            allowNull: false
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn('answers', 'answerText', {
            type: Sequelize.STRING(255),
            allowNull: false
        });
    }
};