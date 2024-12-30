const express = require('express');
const passport = require('./middleware/auth/config'); // Adjust the path as needed
const dotenv = require('dotenv');
const cors = require('cors');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const config = require('./config');
dotenv.config();

const app = express();
app.use(cors(config.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', routes);
app.use(errorHandler);
app.use(passport.initialize());


module.exports = app;
