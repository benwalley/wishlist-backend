const express = require('express');
const passport = require('./middleware/auth/config'); // Adjust the path as needed
const dotenv = require('dotenv');
const cors = require('cors');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { forceHttps } = require('./middleware/forceHttps');
const config = require('./config');
dotenv.config();

const app = express();
app.set('trust proxy', 1); // Heroku router sits in front of the app
app.use(forceHttps);
app.use(cors(config.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', routes);
app.use(errorHandler);
app.use(passport.initialize());


module.exports = app;
