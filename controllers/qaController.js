const QAService = require('../services/qaService');
const { Question, Answer } = require('../models');

module.exports = {
    // Create a new QA record
    create: async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'User not authenticated.' });
            }
            const askedById = req.user.id;
            const data = { ...req.body, askedById };

            const newQA = await QAService.createQA(data);
            return res.status(201).json(newQA);
        } catch (error) {
            console.error('Error creating QA:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    // Get all QAs
    getAll: async (req, res) => {
        try {
            const filter = req.query; // Use query params for filtering
            const qas = await QAService.getAllQAs(filter);
            return res.status(200).json(qas);
        } catch (error) {
            console.error('Error fetching QAs:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    // Get QAs by question ID
    getByQuestionId: async (req, res) => {
        try {
            const { questionId } = req.params;
            if (!questionId) {
                return res.status(400).json({ error: 'questionId is required.' });
            }
            const qas = await QAService.getQAsByQuestionId(questionId);
            return res.status(200).json(qas);
        } catch (error) {
            console.error('Error fetching QAs by questionId:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    // Get a specific QA by ID
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const qa = await QAService.getQAById(id);
            if (!qa) {
                return res.status(404).json({ error: 'QA not found.' });
            }
            return res.status(200).json(qa);
        } catch (error) {
            console.error('Error fetching QA by ID:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    getByUserId: async (req, res) => {
        try {
            const { userId } = req.params;
            if (!userId) {
                return res.status(400).json({ error: 'userId is required.' });
            }

            // Get user's groups from request if available
            // TODO: get groups from DB
            const userGroups = req.user && req.user.groups ? req.user.groups : [];

            const qas = await QAService.getQAsByUserId(userId, userGroups);
            return res.status(200).json(qas);
        } catch (error) {
            console.error('Error fetching QAs by userId:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    // Update a QA
    updateQuestion: async (req, res) => {
        try {
            const data = req.body;
            const id = data.id;
            // Check if the user owns this Question
            if (!req.user) return;

            const question = await Question.findByPk(id);
            if (question && question.askedById === req.user.id) {
                return res.status(403).json({ error: 'Not authorized to update this question.' });

            }
            const updatedQuestion = await QAService.updateQuestion(id, data);
            return res.status(200).json(updatedQuestion);
        } catch (error) {
            console.error('Error updating QA:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    updateAnswer: async (req, res) => {
        try {
            const data = req.body;
            const id = data.id;
            if (!req.user) return;

            const answer = await Answer.findByPk(id);
            if (answer && answer.answererId != req.user.id) {
                return res.status(403).json({ error: 'Not authorized to update this answer.' });
            }
            const updatedAnswer = await QAService.updateAnswer(id, data);
            return res.status(200).json(updatedAnswer);
        } catch (error) {
            console.error('Error updating QA:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    // Delete a QA (soft delete)
    deleteQuestion: async (req, res) => {
        try {
            const { id } = req.params;
            // Check if the user owns this QA
            if (req.user) {
                const qa = await Question.findByPk(id);
                if (qa && (parseInt(qa.askedById) !== parseInt(req.user.id))) {
                    return res.status(403).json({ error: 'Not authorized to delete this QA.' });
                }
            }

            const deletedQA = await QAService.deleteQuestion(id);
            return res.status(200).json(deletedQA);
        } catch (error) {
            console.error('Error deleting QA:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    deleteAnswer: async (req, res) => {
        try {
            const { id } = req.params;
            // Check if the user owns this QA
            if (req.user) {
                const qa = await Answer.findByPk(id);
                if (qa && qa.askedById !== req.user.id) {
                    return res.status(403).json({ error: 'Not authorized to delete this QA.' });
                }
            }

            const deletedQA = await QAService.deleteAnswer(id);
            return res.status(200).json(deletedQA);
        } catch (error) {
            console.error('Error deleting QA:', error);
            return res.status(400).json({ error: error.message });
        }
    },
};
