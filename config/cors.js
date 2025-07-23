module.exports = {
    origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://benwalley.github.io',
        'https://yourdomain.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
