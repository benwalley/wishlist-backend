const QAService = require('../services/qaService');
const { Question, Answer } = require('../models');

module.exports = {
    // Create a new QA record
    create: async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated.'
                });
            }
            const askedById = req.user.id;
            const data = { ...req.body, askedById };

            const newQA = await QAService.createQA(data);
            return res.status(201).json({
                success: true,
                data: newQA
            });
        } catch (error) {
            console.error('Error creating QA:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    },

    // Get all QAs
    getAll: async (req, res) => {
        try {
            const filter = req.query; // Use query params for filtering
            const qas = await QAService.getAllQAs(filter);
            return res.status(200).json({
                success: true,
                data: qas
            });
        } catch (error) {
            console.error('Error fetching QAs:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    },

    // Get QAs by question ID
    getByQuestionId: async (req, res) => {
        try {
            const { questionId } = req.params;
            if (!questionId) {
                return res.status(400).json({
                    success: false,
                    message: 'questionId is required.'
                });
            }
            const qas = await QAService.getQAsByQuestionId(questionId);
            return res.status(200).json({
                success: true,
                data: qas
            });
        } catch (error) {
            console.error('Error fetching QAs by questionId:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    },

    // Get a specific QA by ID
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const qa = await QAService.getQAById(id);
            if (!qa) {
                return res.status(404).json({
                    success: false,
                    message: 'QA not found.'
                });
            }
            return res.status(200).json({
                success: true,
                data: qa
            });
        } catch (error) {
            console.error('Error fetching QA by ID:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    },

    getByUserId: async (req, res) => {
        try {
            const { userId } = req.params;
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'userId is required.'
                });
            }

            // Get user's groups from the database
            const { Group } = require('../models');
            const { Op } = require('sequelize');

            const userGroups = await Group.findAll({
                where: {
                    [Op.or]: [
                        { members: { [Op.contains]: [String(userId)] } },
                        { adminIds: { [Op.contains]: [String(userId)] } },
                        { ownerId: String(userId) }
                    ]
                },
                attributes: ['id']
            });

            const groupIds = userGroups.map(group => group.id);

            const qas = await QAService.getAccessibleQAsByUserId(userId, groupIds);
            return res.status(200).json({
                success: true,
                data: qas
            });
        } catch (error) {
            console.error('Error fetching QAs by userId:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    },

    getAccessible: async (req, res) => {
        try {
            const { userId } = req.params;
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'userId is required.'
                });
            }
``
            // Get user's groups from the database
            const { Group } = require('../models');
            const { Op } = require('sequelize');

            const userGroups = await Group.findAll({
                where: {
                    [Op.or]: [
                        { members: { [Op.contains]: [String(userId)] } },
                        { adminIds: { [Op.contains]: [String(userId)] } },
                        { ownerId: String(userId) }
                    ]
                },
                attributes: ['id']
            });

            const groupIds = userGroups.map(group => group.id);

            const qas = await QAService.getAllAccessibleQAsByUserId(userId, groupIds);
            return res.status(200).json({
                success: true,
                data: qas
            });
        } catch (error) {
            console.error('Error fetching accessible QAs:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    },

    getByAskerId: async (req, res) => {
        try {
            const { userId } = req.params;
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'userId is required.'
                });
            }

            const qas = await QAService.getQAsByAskerId(userId);
            return res.status(200).json({
                success: true,
                data: qas
            });
        } catch (error) {
            console.error('Error fetching QAs by userId:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    },

    // Update a QA
    updateQuestion: async (req, res) => {
        try {
            const { questionId } = req.params;
            const { answerText, ...questionData } = req.body;

            // Check if the user is authenticated
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated.'
                });
            }

            const question = await Question.findByPk(questionId);
            if (!question) {
                return res.status(404).json({
                    success: false,
                    message: 'Question not found.'
                });
            }

            // Handle answer operations based on answerText value
            if (answerText !== undefined) {
                if (answerText.trim() === '') {
                    // Delete the user's answer if answerText is empty string
                    await QAService.deleteUserAnswer(req.user.id, questionId);
                } else {
                    // Create or update the user's answer
                    await QAService.createOrUpdateAnswer(answerText, req.user.id, questionId);
                }
            }
            // Check if there are question updates (anything other than answerText)
            const hasQuestionUpdates = Object.keys(questionData).length > 0;

            // If there are question updates, check if user owns the question
            if (hasQuestionUpdates && question.askedById !== req.user.id) {
                return res.status(403).json({
                    success: true,
                    answerUpdated: true,
                    questionUpdated: false,
                    message: 'Not authorized to update this question.'
                });
            }

            // Update question only if there are question updates and user is authorized
            let updatedQuestion = question;
            if (hasQuestionUpdates) {
                updatedQuestion = await QAService.updateQuestion(questionId, questionData);
            }


            // Fetch the updated question with all answers
            const questionWithAnswers = await QAService.getQAById(questionId);

            return res.status(200).json({
                success: true,
                answerUpdated: true,
                questionUpdated: true,
                data: questionWithAnswers
            });
        } catch (error) {
            console.error('Error updating question:', error);
            return res.status(400).json({
                success: false,
                answerUpdated: false,
                questionUpdated: false,
                message: error.message
            });
        }
    },

    updateAnswer: async (req, res) => {
        try {
            const {questionId, answerText} = req.body;

            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated.'
                });
            }

            // Check if question ID is provided
            if (!questionId) {
                return res.status(400).json({
                    success: false,
                    message: 'Question ID is required.'
                });
            }

            // Check if answer text is provided
            if (!answerText) {
                return res.status(400).json({
                    success: false,
                    message: 'Answer text is required.'
                });
            }


            const result = await QAService.createOrUpdateAnswer(answerText, req.user.id, questionId);
            return res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error updating answer:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
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
                    return res.status(403).json({
                        success: false,
                        message: 'Not authorized to delete this Question.'
                    });
                }
            }

            const deletedQA = await QAService.deleteQuestion(id);
            return res.status(200).json({
                success: true,
                data: deletedQA
            });
        } catch (error) {
            console.error('Error deleting Question:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    },

    forceDeleteQuestion: async (req, res) => {
        try {
            const { id } = req.params;
            // Check if the user owns this QA
            if (req.user) {
                const qa = await Question.findByPk(id);
                if (qa && (parseInt(qa.askedById) !== parseInt(req.user.id))) {
                    return res.status(403).json({
                        success: false,
                        message: 'Not authorized to delete this Question.'
                    });
                }
            }

            const deletedQA = await QAService.forceDeleteQA(id);
            return res.status(200).json({
                success: true,
                data: deletedQA
            });
        } catch (error) {
            console.error('Error deleting Question:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    },

    deleteAnswer: async (req, res) => {
        try {
            const { id } = req.params;
            // Check if the user owns this QA
            if (req.user) {
                const qa = await Answer.findByPk(id);
                if (qa && qa.answererId !== req.user.id) {
                    return res.status(403).json({
                        success: false,
                        message: 'Not authorized to delete this Answer.'
                    });
                }
            }

            const deletedQA = await QAService.deleteAnswer(id);
            return res.status(200).json({
                success: true,
                data: deletedQA
            });
        } catch (error) {
            console.error('Error deleting Answer:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    },
};
