const ContributorService = require('../services/contributorService');
const { Contributor, User } = require("../models");

module.exports = {
    // Create a new contributor record
    create: async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'User not authenticated.' 
                });
            }
            const userId = req.user.id;
            const data = { ...req.body, userId };
            const newContributor = await ContributorService.createContributor(data);
            return res.status(201).json({
                success: true,
                data: newContributor
            });
        } catch (error) {
            console.error('Error creating Contributor:', error);
            return res.status(400).json({ 
                success: false, 
                message: error.message 
            });
        }
    },

    getByItemId: async (req, res) => {
        try {
            const { itemId } = req.params;
            if (!itemId) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'itemId is required.' 
                });
            }
            const contributors = await ContributorService.getAllContributors({ itemId });
            return res.status(200).json({
                success: true,
                data: contributors
            });
        } catch (error) {
            console.error('Error fetching Contributors by itemId:', error);
            return res.status(400).json({ 
                success: false, 
                message: error.message 
            });
        }
    },

    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const contributor = await ContributorService.getContributorById(id);
            if (!contributor) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Contributor not found.' 
                });
            }
            return res.status(200).json({
                success: true,
                data: contributor
            });
        } catch (error) {
            console.error('Error fetching Contributor by ID:', error);
            return res.status(400).json({ 
                success: false, 
                message: error.message 
            });
        }
    },

    update: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;
            const updatedContributor = await ContributorService.updateContributor(id, updates);
            return res.status(200).json({
                success: true,
                data: updatedContributor
            });
        } catch (error) {
            console.error('Error updating Contributor:', error);
            return res.status(400).json({ 
                success: false, 
                message: error.message 
            });
        }
    },

    // Updated batch method using a single record per user/item pair
    updateBatch: async (req, res) => {
        try {
            const batchData = req.body;
            const results = [];

            for (const item of batchData) {
                const { userId, itemId } = item;
                // Look up an existing record for this user and item.
                let contributor = await Contributor.findOne({ where: { userId, itemId } });

                // Prepare updates for "getting" and "contributing"
                // Only update if the flag is provided in the payload.
                let newGetting = null;
                let newContributing = null;
                if (item.hasOwnProperty('getting')) {
                    // If qty is provided, use it; otherwise default to zero.
                    const qty = item.qty || 0;
                    newGetting = qty;
                }
                if (item.hasOwnProperty('contributing')) {
                    const contributeAmount = item.contributeAmount || 0;
                    newContributing = contributeAmount;
                }

                // If record exists, update its fields accordingly
                if (contributor) {
                    // Merge the "getting" field if provided.
                    if (newGetting !== null) {
                        contributor.numberGetting = newGetting;
                        contributor.getting = newGetting > 0;
                    }
                    // Merge the "contributing" field if provided.
                    if (newContributing !== null) {
                        contributor.contributeAmount = newContributing;
                        contributor.contributing = newContributing > 0;
                    }
                    // If both getting and contributing are falsy, delete the record.
                    if (!contributor.getting && !contributor.contributing) {
                        await ContributorService.deleteContributor(contributor.id);
                        results.push({ action: 'deleted', userId, itemId });
                    } else {
                        // Otherwise, update the record.
                        await ContributorService.updateContributor(contributor.id, {
                            numberGetting: contributor.numberGetting,
                            getting: contributor.getting,
                            contributeAmount: contributor.contributeAmount,
                            contributing: contributor.contributing,
                        });
                        results.push({ action: 'updated', userId, itemId, numberGetting: contributor.numberGetting, contributeAmount: contributor.contributeAmount });
                    }
                } else {
                    // No record exists. Create one only if at least one value is positive.
                    const createData = { userId, itemId };
                    let shouldCreate = false;
                    if (newGetting !== null && newGetting > 0) {
                        createData.numberGetting = newGetting;
                        createData.getting = true;
                        shouldCreate = true;
                    }
                    if (newContributing !== null && newContributing > 0) {
                        createData.contributeAmount = newContributing;
                        createData.contributing = true;
                        shouldCreate = true;
                    }
                    if (shouldCreate) {
                        await ContributorService.createContributor(createData);
                        results.push({ action: 'created', userId, itemId, ...createData });
                    } else {
                        results.push({ action: 'skipped', userId, itemId, reason: 'No positive values for getting or contributing' });
                    }
                }
            }

            return res.status(200).json({
                success: true,
                data: { results }
            });
        } catch (error) {
            console.error('Error in updateBatch:', error);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    },



    delete: async (req, res) => {
        try {
            const { id } = req.params;
            const deletedContributor = await ContributorService.deleteContributor(id);
            return res.status(200).json({
                success: true,
                data: deletedContributor
            });
        } catch (error) {
            console.error('Error deleting Contributor:', error);
            return res.status(400).json({ 
                success: false, 
                message: error.message 
            });
        }
    },
};
