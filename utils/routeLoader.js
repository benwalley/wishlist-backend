const fs = require('fs');
const path = require('path');
const express = require('express');

const loadRoutes = (router, routesPath) => {
    fs.readdirSync(routesPath, { withFileTypes: true }).forEach((file) => {
        const filePath = path.join(routesPath, file.name);

        if (file.isFile() && file.name !== 'index.js') {
            const route = require(filePath);

            // Ensure the file exports a valid router
            if (route && typeof route === 'function') {
                const routeName = `/${file.name.replace('.js', '')}`;
                router.use(routeName, route);
            } else {
                console.warn(`Skipping invalid route file: ${file.name}`);
            }
        } else if (file.isDirectory()) {
            const nestedRouter = express.Router();
            loadRoutes(nestedRouter, filePath);
            router.use(`/${file.name}`, nestedRouter);
        }
    });

    return router;
};

module.exports = loadRoutes;
