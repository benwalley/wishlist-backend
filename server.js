// Import required modules
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const models = require('./models'); // Sequelize models should be initialized here
const app = express();
const port = 3000;
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Middleware
app.use(express.json());

// Test API endpoint
app.get('/api', async (req, res) => {
    try {
        const time = await models.sequelize.query('SELECT NOW()', { type: Sequelize.QueryTypes.SELECT });
        res.json({ message: 'API is working!', time: time[0].now });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        const users = await models.User.findAll(); // Use Sequelize model
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Create a new user
app.post('/api/users', async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }

    try {
        const newUser = await models.User.create({ name, email }); // Use Sequelize model
        res.status(201).json(newUser);
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Synchronize Sequelize models with the database
(async () => {
    try {
        await models.sequelize.sync({ alter: true }); // Automatically create/update tables based on models
        console.log('Database synchronized.');

        // Start the server
        if (process.env.NODE_ENV !== 'test') {
            app.listen(port, () => {
                console.log(`Server running at http://localhost:${port}`);
            });
        }
    } catch (error) {
        console.error('Failed to synchronize database:', error);
    }
})();

module.exports = app;
