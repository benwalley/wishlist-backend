const superAdminService = require('../services/superAdminService');

/**
 * Get all users with their complete data
 * Query params: ?query=searchTerm&page=1&limit=20
 */
exports.getAllUsers = async (req, res) => {
    try {
        // Extract and validate query parameters
        const { query, page, limit } = req.query;

        // Parse and validate pagination parameters
        const pageNum = parseInt(page) || 1;
        const limitNum = Math.min(parseInt(limit) || 20, 100); // Max 100 per page
        const offset = (pageNum - 1) * limitNum;

        // Call service with pagination and filtering
        const result = await superAdminService.getAllUsers({
            query: query || null,
            limit: limitNum,
            offset
        });

        res.status(200).json({
            success: true,
            data: result.users,
            pagination: {
                total: result.total,
                totalPages: result.totalPages,
                currentPage: result.currentPage,
                pageSize: result.pageSize
            }
        });
    } catch (error) {
        console.error('Error in superAdminController.getAllUsers:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching users.'
        });
    }
};

/**
 * Get list of all available database tables
 */
exports.getDatabaseTables = (req, res) => {
    try {
        const tables = superAdminService.getDatabaseTables();

        res.status(200).json({
            success: true,
            data: tables
        });
    } catch (error) {
        console.error('Error in superAdminController.getDatabaseTables:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching database tables.'
        });
    }
};

/**
 * Get paginated data from a specific database table
 * Query params: ?page=1&limit=20&sortBy=id&sortOrder=ASC&idMin=10&idMax=100&filter[column]=value
 */
exports.getDatabaseTable = async (req, res) => {
    try {
        const { tableName } = req.params;
        const { page, limit, sortBy, sortOrder, idMin, idMax, ...queryParams } = req.query;

        // Extract filters from query params (filter[columnName]=value)
        const filters = {};
        Object.keys(queryParams).forEach(key => {
            const match = key.match(/^filter\[(.+)\]$/);
            if (match) {
                filters[match[1]] = queryParams[key];
            }
        });

        // Parse pagination parameters
        const pageNum = parseInt(page) || 1;
        const limitNum = Math.min(parseInt(limit) || 20, 100);

        // Call service
        const result = await superAdminService.getDatabaseTable({
            tableName,
            page: pageNum,
            limit: limitNum,
            sortBy: sortBy || 'id',
            sortOrder: sortOrder || 'ASC',
            filters,
            idMin: idMin ? parseInt(idMin) : null,
            idMax: idMax ? parseInt(idMax) : null
        });

        res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error in superAdminController.getDatabaseTable:', error);

        // Check if it's a validation error
        if (error.message && error.message.includes('Invalid table name')) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching table data.'
        });
    }
};