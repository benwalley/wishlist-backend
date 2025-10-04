const express = require('express');
const router = express.Router();
const authenticateSuperAdmin = require('../middleware/auth/authenticateSuperAdmin');
const superAdminController = require('../controllers/superAdminController');

// All routes in this file require super admin authentication
router.use(authenticateSuperAdmin);

/**
 * @route   GET /api/superadmin/users
 * @desc    Get all users with their lists, groups, and invitations
 * @query   query - Search term to filter by name or email (optional)
 * @query   page - Page number (default: 1)
 * @query   limit - Results per page (default: 20, max: 100)
 * @access  Super Admin only
 */
router.get('/users', superAdminController.getAllUsers);

/**
 * @route   GET /api/superadmin/database/tables
 * @desc    Get list of all available database tables
 * @access  Super Admin only
 */
router.get('/database/tables', superAdminController.getDatabaseTables);

/**
 * @route   GET /api/superadmin/database/:tableName
 * @desc    Get paginated data from a specific database table
 * @param   tableName - Name of the database table (e.g., User, List, Group)
 * @query   page - Page number (default: 1)
 * @query   limit - Results per page (default: 20, max: 100)
 * @query   sortBy - Column to sort by (default: id)
 * @query   sortOrder - Sort order ASC or DESC (default: ASC)
 * @query   idMin - Minimum ID for range filtering (optional)
 * @query   idMax - Maximum ID for range filtering (optional)
 * @query   filter[columnName] - Filter by column value (supports multiple filters)
 * @access  Super Admin only
 * @example /api/superadmin/database/User?page=1&limit=50&idMin=10&idMax=100&filter[email]=gmail.com
 */
router.get('/database/:tableName', superAdminController.getDatabaseTable);

module.exports = router;