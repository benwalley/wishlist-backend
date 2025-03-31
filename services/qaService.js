const { Question, Answer } = require('../models');
const { Op } = require('sequelize');

class QAService {
    // Create a new QA entry
    static async createQA(data) {
        try {
            const newQA = await Question.create(data);
            const answers = [];
            if(data.answerText) {
                const answer = await Answer.create({
                    questionId: newQA.id,
                    answererId: data.answererId || data.askedById,
                    answerText: data.answerText,
                    visibleToGroups: data.visibleToGroups || [],
                    visibleToUsers: data.visibleToUsers || []
                });
                answers.push(answer);
            }

            // Fetch the created question with its answers
            const qaWithAnswers = await Question.findByPk(newQA.id, {
                include: [{
                    model: Answer,
                    as: 'answers'
                }]
            });

            return qaWithAnswers;
        } catch (error) {
            console.error('Error creating QA:', error);
            throw error;
        }
    }

    // Get all QA entries (optionally filter by criteria)
    static async getAllQAs(filter = {}) {
        try {
            const qas = await Question.findAll({
                where: filter,
                include: [{
                    model: Answer,
                    as: 'answers'
                }],
                order: [['createdAt', 'DESC']]
            });
            return qas;
        } catch (error) {
            console.error('Error fetching QAs:', error);
            throw error;
        }
    }

    // Get a single QA by ID
    static async getQAById(id) {
        try {
            const qa = await Question.findByPk(id, {
                include: [{
                    model: Answer,
                    as: 'answers'
                }]
            });
            if (!qa) throw new Error('QA not found');
            return qa;
        } catch (error) {
            console.error('Error fetching QA by ID:', error);
            throw error;
        }
    }

    // Get QAs by question ID
    static async getQAsByQuestionId(questionId) {
        try {
            const qas = await Question.findAll({
                where: { questionId },
                include: [{
                    model: Answer,
                    as: 'answers'
                }],
                order: [['createdAt', 'DESC']]
            });
            return qas;
        } catch (error) {
            console.error('Error fetching QAs by question ID:', error);
            throw error;
        }
    }

    // Get QAs by user ID (questions asked to the user or to groups they're in)
    static async getQAsByUserId(userId, userGroups = []) {
        try {
            const qasWithAnswers = await Question.findAll({
                where: {
                    [Op.or]: [
                        { userId: userId },
                        { groupId: { [Op.in]: userGroups } }
                    ]
                },
                include: [{
                    model: Answer,
                    as: 'answers', // Use the alias defined in your association
                }],
                order: [['createdAt', 'ASC']]
            });

            return qasWithAnswers;
        } catch (error) {
            console.error('Error fetching QAs by user ID:', error);
            throw error;
        }
    }

    // Update a QA by ID
    static async updateQuestion(id, updates) {
        try {
            const question = await Question.findByPk(id);
            if (!question) throw new Error('QA not found');
            await question.update(updates);
            return question;
        } catch (error) {
            console.error('Error updating QA:', error);
            throw error;
        }
    }

    static async updateAnswer(id, updates) {
        try {
            const answer = await Answer.findByPk(id);
            if (!answer) throw new Error('Answer not found');
            await answer.update(updates);
            return answer;
        } catch (error) {
            console.error('Error updating Answer:', error);
            throw error;
        }
    }

    // Soft delete a QA by ID
    static async deleteQuestion(id) {
        try {
            return await Question.destroy({where: {id}});
        } catch (error) {
            console.error('Error deleting question:', error);
            throw error;
        }
    }

    static async deleteAnswer(id) {
        try {
            return await Answer.destroy({where: {id}});

        } catch (error) {
            console.error('Error deleting answer:', error);
            throw error;
        }
    }

    // Permanently delete a QA
    static async forceDeleteQA(id) {
        try {
            const deletedQA = await Question.destroy({ where: { id } });
            if (!deletedQA) throw new Error('QA not found or already deleted');
            return deletedQA;
        } catch (error) {
            console.error('Error force deleting QA:', error);
            throw error;
        }
    }
}

module.exports = QAService;
