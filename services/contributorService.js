const { Contributor, User } = require('../models'); // Ensure User is imported as well

class ContributorService {
    // Create a new contributor record
    static async createContributor(data) {
        try {
            const newContributor = await Contributor.create(data);
            // Optionally, fetch the newly created contributor with associated User
            const createdContributor = await Contributor.findByPk(newContributor.id, {
                include: [{ model: User, as: 'user' }]
            });
            return createdContributor;
        } catch (error) {
            console.error('Error creating Contributor:', error);
            throw error;
        }
    }

    // Get all contributor records (optionally filter by criteria)
    static async getAllContributors(filter = {}) {
        try {
            const contributors = await Contributor.findAll({
                where: filter,
                include: [{ model: User, as: 'user' }] // Using alias as defined in the association
            });
            return contributors;
        } catch (error) {
            console.error('Error fetching Contributors:', error);
            throw error;
        }
    }

    // Get a single contributor by its primary key (id)
    static async getContributorById(id) {
        try {
            const contributor = await Contributor.findByPk(id, {
                include: [{ model: User, as: 'user' }] // Using alias
            });
            if (!contributor) throw new Error('Contributor not found');
            return contributor;
        } catch (error) {
            console.error('Error fetching Contributor by ID:', error);
            throw error;
        }
    }

    // Update a contributor by ID
    static async updateContributor(id, updates) {
        try {
            const contributor = await Contributor.findByPk(id);
            if (!contributor) throw new Error('Contributor not found');
            await contributor.update(updates);
            // Fetch the updated contributor along with the associated User
            const updatedContributor = await Contributor.findByPk(id, {
                include: [{ model: User, as: 'user' }]
            });
            return updatedContributor;
        } catch (error) {
            console.error('Error updating Contributor:', error);
            throw error;
        }
    }

    // Delete a contributor by ID
    static async deleteContributor(id) {
        try {
            const contributor = await Contributor.findByPk(id);
            if (!contributor) throw new Error('Contributor not found');
            await contributor.destroy();
            return contributor;
        } catch (error) {
            console.error('Error deleting Contributor:', error);
            throw error;
        }
    }

    // Force delete a contributor permanently
    static async forceDeleteContributor(id) {
        try {
            const deletedCount = await Contributor.destroy({ where: { id } });
            if (!deletedCount) throw new Error('Contributor not found or already deleted');
            return deletedCount;
        } catch (error) {
            console.error('Error force deleting Contributor:', error);
            throw error;
        }
    }
}

module.exports = ContributorService;
