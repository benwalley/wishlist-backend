const dotenv = require('dotenv');

dotenv.config();

module.exports = {
    cors: require('./cors'),
    port: process.env.PORT || 3000,
};
