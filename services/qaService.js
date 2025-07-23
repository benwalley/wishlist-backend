const { Question, Answer, User, Group } = require('../models');
const { Op, Sequelize } = require('sequelize');

class QAService {
    /**
     * Share multiple questions with a group
     * @param {Array<number>} questionIds - Array of question IDs to share
     * @param {number} groupId - Group ID to share with
     * @param {number} userId - ID of user performing the share operation
     * @returns {Promise<Object>}
     */
    static async bulkShareQuestionsWithGroup(questionIds, groupId, userId) {
        try {
            // Verify group exists and user has access to it
            const group = await Group.findByPk(groupId);
            if (!group) {
                return {
                    success: false,
                    message: 'Group not found'
                };
            }

            // Check if user is a member, admin, or owner of the group
            const isMember = group.members && group.members.includes(userId);
            const isAdmin = group.adminIds && group.adminIds.includes(userId);
            const isOwner = group.ownerId === userId;
            if (!isMember && !isAdmin && !isOwner) {
                return {
                    success: false,
                    message: 'You do not have access to this group'
                };
            }

            if (!Array.isArray(questionIds) || questionIds.length === 0) {
                return {
                    success: false,
                    message: 'No questions provided for sharing'
                };
            }

            // Get all questions and check user ownership
            const questions = await Question.findAll({
                where: {
                    id: {
                        [Op.in]: questionIds
                    }
                }
            });

            if (questions.length === 0) {
                return {
                    success: false,
                    message: 'No valid questions found'
                };
            }

            // Track results
            const results = {
                success: true,
                sharedQuestions: [],
                failedQuestions: []
            };

            // Update each question
            for (const question of questions) {
                // Only allow sharing if user is the asker
                if (String(question.askedById) !== String(userId)) {
                    results.failedQuestions.push({
                        id: question.id,
                        reason: 'You can only share questions you asked'
                    });
                    continue;
                }

                // Add group to sharedWithGroupIds if not already there
                const sharedWithGroupIds = Array.isArray(question.sharedWithGroupIds) ? [...question.sharedWithGroupIds] : [];
                
                if (!sharedWithGroupIds.includes(groupId)) {
                    sharedWithGroupIds.push(groupId);
                    await question.update({ sharedWithGroupIds });
                    results.sharedQuestions.push(question.id);
                } else {
                    // Already shared with this group
                    results.sharedQuestions.push(question.id);
                }
            }

            return results;
        } catch (error) {
            console.error('Error in bulkShareQuestionsWithGroup:', error);
            return {
                success: false,
                message: 'An error occurred while sharing questions with the group',
                error: error.message
            };
        }
    }
    
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

    // Get QAs by user ID (questions shared with the user or with groups they're in)
    static async getQAsByUserId(userId, userGroups = []) {
        try {
            // Convert userId to a number if it's a string
            const userIdNum = parseInt(userId, 10);

            // Create an array of group IDs (ensure they're numbers)
            const groupIds = userGroups.map(g =>
                typeof g === 'object' ? parseInt(g.id, 10) : parseInt(g, 10)
            ).filter(id => !isNaN(id));

            const qasWithAnswers = await Question.findAll({
                where: {
                    [Op.or]: [
                        // Questions where user is directly shared
                        Sequelize.literal(`${userIdNum} = ANY("Question"."sharedWithUserIds")`),

                        // Questions where any of user's groups are shared
                        ...(groupIds.length > 0 ? [
                            Sequelize.literal(`"Question"."sharedWithGroupIds" && ARRAY[${groupIds.join(',')}]::integer[]`)
                        ] : [])
                    ]
                },
                include: [{
                    model: Answer,
                    as: 'answers'
                }],
                order: [['createdAt', 'DESC']]
            });

            return qasWithAnswers;
        } catch (error) {
            console.error('Error fetching QAs by user ID:', error);
            throw error;
        }
    }

    static async getQAsByAskerId(userId) {
        try {
            // First get all questions asked by the user
            const qasWithAnswers = await Question.findAll({
                where: {
                    askedById: userId
                },
                include: [
                    {
                        model: Answer,
                        as: 'answers',
                    }
                ],
                order: [['createdAt', 'ASC']]
            });

            // Extract all group and user IDs to fetch them in bulk
            const allGroupIds = new Set();
            const allUserIds = new Set();

            qasWithAnswers.forEach(question => {
                const groupIds = question.sharedWithGroupIds || [];
                const userIds = question.sharedWithUserIds || [];

                groupIds.forEach(id => allGroupIds.add(id));
                userIds.forEach(id => allUserIds.add(id));
            });

            // Fetch all groups and users in two bulk queries
            const [groups, users] = await Promise.all([
                allGroupIds.size > 0 ? Group.findAll({
                    where: { id: { [Op.in]: Array.from(allGroupIds) } }
                }) : [],
                allUserIds.size > 0 ? User.findAll({
                    where: { id: { [Op.in]: Array.from(allUserIds) } }
                }) : []
            ]);

            // Create lookup maps for quick access
            const groupMap = new Map(groups.map(group => [group.id, group]));
            const userMap = new Map(users.map(user => [user.id, user]));

            // Map groups and users to each question
            const questionsWithRelations = qasWithAnswers.map(question => {
                const plainQuestion = question.get({ plain: true });

                plainQuestion.sharedWithGroups = (plainQuestion.sharedWithGroupIds || [])
                    .map(id => groupMap.get(id))
                    .filter(Boolean); // Filter out any undefined values

                plainQuestion.sharedWithUsers = (plainQuestion.sharedWithUserIds || [])
                    .map(id => userMap.get(id))
                    .filter(Boolean); // Filter out any undefined values

                return plainQuestion;
            });

            return questionsWithRelations;
        } catch (error) {
            console.error('Error fetching QAs by user ID:', error);
            throw error;
        }
    }

    // Get all questions accessible to a user (asked by them + shared with them + shared with their groups)
    static async getAccessibleQAsByUserId(userId, userGroupIds = []) {
        try {
            // Convert userId to a number if it's a string
            const userIdNum = parseInt(userId, 10);

            const qasWithAnswers = await Question.findAll({
                where: {
                    [Op.or]: [
                        // Questions asked by the user
                        { askedById: userIdNum },
                        
                        // Questions where user is directly shared
                        Sequelize.literal(`${userIdNum} = ANY("Question"."sharedWithUserIds")`),

                        // Questions where any of user's groups are shared
                        ...(userGroupIds.length > 0 ? [
                            Sequelize.literal(`"Question"."sharedWithGroupIds" && ARRAY[${userGroupIds.join(',')}]::integer[]`)
                        ] : [])
                    ]
                },
                include: [{
                    model: Answer,
                    as: 'answers'
                }],
                order: [['createdAt', 'DESC']]
            });

            return qasWithAnswers;
        } catch (error) {
            console.error('Error fetching accessible QAs by user ID:', error);
            throw error;
        }
    }


    // Update a QA by ID
    static async updateQuestion(id, updates) {
        try {
            const question = await Question.findByPk(id);
            if (!question) throw new Error('Question not found');

            // Extract relevant fields from updates
            const updateData = {
                questionText: updates.questionText,
                isAnonymous: updates.isAnonymous !== undefined ? updates.isAnonymous : question.isAnonymous,
                sharedWithGroupIds: updates.shareWithGroups || updates.sharedWithGroupIds || question.sharedWithGroupIds,
                sharedWithUserIds: updates.shareWithUsers || updates.sharedWithUserIds || question.sharedWithUserIds,
                deleted: updates.deleted || false
            };

            // Only add dueDate if it's a valid date
            if (updates.dueDate && updates.dueDate !== 'Invalid date') {
                updateData.dueDate = updates.dueDate;
            }

            // Update the question
            await question.update(updateData);

            // Fetch the updated question with its answers
            const updatedQuestion = await Question.findByPk(id, {
                include: [{
                    model: Answer,
                    as: 'answers'
                }]
            });

            return updatedQuestion;
        } catch (error) {
            console.error('Error updating question:', error);
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

    static async createAnswer(questionId, data) {
        try {
            const question = await Question.findByPk(questionId);
            if (!question) throw new Error('Question not found');

            const newAnswer = await Answer.create({
                questionId,
                answererId: data.answererId,
                answerText: data.answerText,
                visibleToGroups: data.visibleToGroups || [],
                visibleToUsers: data.visibleToUsers || []
            });

            return newAnswer;
        } catch (error) {
            console.error('Error creating Answer:', error);
            throw error;
        }
    }

    static async createOrUpdateAnswer(answerText, answererId, questionId) {
        try {
            let result;
            const existingAnswer = await Answer.findOne({
                where: {
                    questionId: questionId,
                    answererId: answererId
                }
            });

            if (existingAnswer) {
                await existingAnswer.update({
                    answerText: answerText,
                });
                result = existingAnswer;
            } else {
                // Create new answer
                result = await Answer.create({
                    questionId,
                    answererId,
                    answerText: answerText,
                    visibleToGroups: [],
                    visibleToUsers: []
                });
            }

            return result;
        } catch (error) {
            console.error('Error creating or updating answer:', error);
            throw error;
        }
    }

    static async deleteUserAnswer(answererId, questionId) {
        try {
            const deletedCount = await Answer.destroy({
                where: {
                    questionId: questionId,
                    answererId: answererId
                }
            });
            return deletedCount > 0;
        } catch (error) {
            console.error('Error deleting user answer:', error);
            throw error;
        }
    }

    // Delete a question by ID and all its answers
    static async deleteQuestion(id) {
        try {
            return await Question.update({ deleted: true }, { where: { id } });
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

    // Permanently delete a QA and all its answers
    static async forceDeleteQA(id) {
        try {
            await Answer.destroy({ where: { questionId: id } });
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
