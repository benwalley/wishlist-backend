const { ListItem } = require('../models'); // Adjust the path as per your project structure

class ListItemService {
    // Create a new list item
    static async createItem(data) {
        try {
            const newItem = await ListItem.create(data);
            // update "List" with this ID, to include this item in "items" array

            return newItem;
        } catch (error) {
            console.error('Error creating ListItem:', error);
            throw error;
        }
    }

    // Get all list items (optionally filter by criteria)
    static async getAllItems(filter = {}) {
        try {
            const items = await ListItem.findAll({ where: filter });
            return items;
        } catch (error) {
            console.error('Error fetching ListItems:', error);
            throw error;
        }
    }

    // Get a single list item by ID
    static async getItemById(id) {
        try {
            const item = await ListItem.findByPk(id);
            if (!item) throw new Error('ListItem not found');
            return item;
        } catch (error) {
            console.error('Error fetching ListItem by ID:', error);
            throw error;
        }
    }

    // Update a list item by ID
    static async updateItem(id, updates) {
        try {
            const item = await ListItem.findByPk(id);
            if (!item) throw new Error('ListItem not found');
            await item.update(updates);
            return item;
        } catch (error) {
            console.error('Error updating ListItem:', error);
            throw error;
        }
    }

    // Delete a list item by ID (soft delete)
    static async deleteItem(id) {
        try {
            const item = await ListItem.findByPk(id);
            if (!item) throw new Error('ListItem not found');
            await item.update({ deleted: true });
            return item;
        } catch (error) {
            console.error('Error deleting ListItem:', error);
            throw error;
        }
    }

    // Permanently delete a list item
    static async forceDeleteItem(id) {
        try {
            const deletedItem = await ListItem.destroy({ where: { id } });
            if (!deletedItem) throw new Error('ListItem not found or already deleted');
            return deletedItem;
        } catch (error) {
            console.error('Error force deleting ListItem:', error);
            throw error;
        }
    }
}

module.exports = ListItemService;
