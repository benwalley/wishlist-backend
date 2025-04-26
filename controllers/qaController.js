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

    getByAskerId: async (req, res) => {
        try {
            const { userId } = req.params;
            if (!userId) {
                return res.status(400).json({ error: 'userId is required.' });
            }

            const qas = await QAService.getQAsByAskerId(userId);
            return res.status(200).json(qas);
        } catch (error) {
            console.error('Error fetching QAs by userId:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    // Update a QA
    updateQuestion: async (req, res) => {
        try {
            const { questionId } = req.params;
            const data = req.body;

            // Check if the user is authenticated
            if (!req.user) {
                return res.status(401).json({ error: 'User not authenticated.' });
            }

            const question = await Question.findByPk(questionId);
            if (!question) {
                return res.status(404).json({ error: 'Question not found.' });
            }

            // Check if the user owns this Question (authorization)
            if (question.askedById !== req.user.id) {
                return res.status(403).json({ error: 'Not authorized to update this question.' });
            }

            const updatedQuestion = await QAService.updateQuestion(questionId, data);
            return res.status(200).json(updatedQuestion);
        } catch (error) {
            console.error('Error updating question:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    updateAnswer: async (req, res) => {
        try {
            const {questionId, answerText} = req.body;

            if (!req.user) {
                return res.status(401).json({ error: 'User not authenticated.' });
            }

            // Check if question ID is provided
            if (!questionId) {
                return res.status(400).json({ error: 'Question ID is required.' });
            }

            // Check if answer text is provided
            if (!answerText) {
                return res.status(400).json({ error: 'Answer text is required.' });
            }


            const result = await QAService.createOrUpdateAnswer(answerText, req.user.id, questionId);
            return res.status(200).json(result);
        } catch (error) {
            console.error('Error updating answer:', error);
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
                    return res.status(403).json({success: false, error: 'Not authorized to delete this Question.' });
                }
            }

            const deletedQA = await QAService.deleteQuestion(id);
            return res.status(200).json({success: true, deletedQA});
        } catch (error) {
            console.error('Error deleting Question:', error);
            return res.status(400).json({success: false, error: error.message });
        }
    },

    forceDeleteQuestion: async (req, res) => {
        try {
            const { id } = req.params;
            // Check if the user owns this QA
            if (req.user) {
                const qa = await Question.findByPk(id);
                if (qa && (parseInt(qa.askedById) !== parseInt(req.user.id))) {
                    return res.status(403).json({success: false, error: 'Not authorized to delete this Question.' });
                }
            }

            const deletedQA = await QAService.forceDeleteQA(id);
            return res.status(200).json({success: true, deletedQA});
        } catch (error) {
            console.error('Error deleting Question:', error);
            return res.status(400).json({success: false, error: error.message });
        }
    },

    deleteAnswer: async (req, res) => {
        try {
            const { id } = req.params;
            // Check if the user owns this QA
            if (req.user) {
                const qa = await Answer.findByPk(id);
                if (qa && qa.answererId !== req.user.id) {
                    return res.status(403).json({ error: 'Not authorized to delete this Answer.' });
                }
            }

            const deletedQA = await QAService.deleteAnswer(id);
            return res.status(200).json(deletedQA);
        } catch (error) {
            console.error('Error deleting Answer:', error);
            return res.status(400).json({ error: error.message });
        }
    },
};
