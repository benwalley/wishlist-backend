const ContributorService = require('../services/contributorService');

module.exports = {
    // Create a new contributor record
    create: async (req, res) => {
        try {
            // Ensure the user is authenticated
            if (!req.user) {
                return res.status(401).json({ error: 'User not authenticated.' });
            }

            // Get the authenticated user's ID from PassportJS and merge with request body data
            const userId = req.user.id;
            const data = {
                ...req.body,
                userId,
            };

            // Create the Contributor record
            const newContributor = await ContributorService.createContributor(data);
            return res.status(201).json(newContributor);
        } catch (error) {
            console.error('Error creating Contributor:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    getByItemId: async (req, res) => {
        try {
            const { itemId } = req.params;
            if (!itemId) {
                return res.status(400).json({ error: 'itemId is required.' });
            }

            const contributors = await ContributorService.getAllContributors({ itemId });
            return res.status(200).json(contributors);
        } catch (error) {
            console.error('Error fetching Contributors by itemId:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    // Get a single contributor by its primary key (id)
    getById: async (req, res) => {
        try {
            const { id } = req.params;
            const contributor = await ContributorService.getContributorById(id);
            if (!contributor) {
                return res.status(404).json({ error: 'Contributor not found.' });
            }
            return res.status(200).json(contributor);
        } catch (error) {
            console.error('Error fetching Contributor by ID:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    // Update a contributor record by ID
    update: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;
            const updatedContributor = await ContributorService.updateContributor(id, updates);
            return res.status(200).json(updatedContributor);
        } catch (error) {
            console.error('Error updating Contributor:', error);
            return res.status(400).json({ error: error.message });
        }
    },

    // Delete a contributor record by ID (hard delete)
    delete: async (req, res) => {
        try {
            const { id } = req.params;
            const deletedContributor = await ContributorService.deleteContributor(id);
            return res.status(200).json(deletedContributor);
        } catch (error) {
            console.error('Error deleting Contributor:', error);
            return res.status(400).json({ error: error.message });
        }
    },
};
