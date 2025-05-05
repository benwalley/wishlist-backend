const { ListItem, Contributor, GiftStatus, sequelize } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

class GiftTrackingService {
    // Get all items that the user is getting (purchased) or contributing to
    static async getTrackedGifts(userId) {
        try {
            // 1. Find all items where the user is a contributor (getting or contributing)
            const contributedItems = await ListItem.findAll({
                include: [
                    {
                        model: Contributor,
                        as: 'contributors',
                        where: {
                            userId,
                            [Op.or]: [
                                { getting: true },
                                { contributing: true }
                            ]
                        },
                        required: true
                    }
                ],
                where: {
                    deleted: false
                }
            });

            // 2. Find all items where the user has marked a gift status
            const purchasedItems = await ListItem.findAll({
                include: [
                    {
                        model: GiftStatus,
                        as: 'giftStatuses',
                        where: {
                            purchaserId: userId
                        },
                        required: true
                    }
                ],
                where: {
                    deleted: false
                }
            });

            // Combine results, avoiding duplicates
            const allItemIds = new Set();
            const combinedItems = [];

            for (const item of contributedItems) {
                if (!allItemIds.has(item.id)) {
                    allItemIds.add(item.id);
                    combinedItems.push({
                        ...item.toJSON(),
                        trackingType: 'contributing'
                    });
                }
            }

            for (const item of purchasedItems) {
                if (!allItemIds.has(item.id)) {
                    allItemIds.add(item.id);
                    combinedItems.push({
                        ...item.toJSON(),
                        trackingType: 'purchased'
                    });
                } else {
                    // Item is both contributed to and purchased, update the existing item
                    const existingItem = combinedItems.find(i => i.id === item.id);
                    if (existingItem) {
                        existingItem.trackingType = 'both';
                    }
                }
            }

            return {
                success: true,
                data: combinedItems
            };
        } catch (error) {
            console.error('Error fetching tracked gifts:', error);
            if (error instanceof ApiError) throw error;

            throw new ApiError('Failed to fetch tracked gifts', {
                status: 500,
                errorType: 'DATABASE_ERROR',
                publicMessage: 'Unable to retrieve your tracked gifts. Please try again.'
            });
        }
    }
}

module.exports = GiftTrackingService;
