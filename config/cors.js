require('dotenv').config();

const developmentOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
];

const productionOrigins = process.env.FRONTEND_URLS
    ? process.env.FRONTEND_URLS.split(',').map(url => url.trim())
    : ['https://staging.wishlistwebsite.com', 'https://wishlistwebsite.com'];

const allowedOrigins = process.env.NODE_ENV === 'production'
    ? productionOrigins
    : [...developmentOrigins, ...productionOrigins];

module.exports = {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
