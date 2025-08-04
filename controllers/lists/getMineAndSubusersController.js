const listService = require('../../services/listService');
const userService = require('../../services/userService');

class MineAndSubusersListController {
    /**
     * Get all lists owned by the current user and their subusers
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getListsByCurrentUserAndSubusers(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ 
                    success: false,
                    message: 'Unauthorized: User ID not found' 
                });
            }

            // Get the current user's lists
            const userLists = await listService.getAllListsByOwnerId(userId);

            // Get all subusers of the current user
            const subusers = await userService.getFamilyUserIds(userId);
            
            // Remove the current user ID from the set to avoid duplicates
            subusers.delete(userId);

            // Get lists from all subusers
            let subuserLists = [];
            if (subusers.size > 0) {
                for (const subuserId of subusers) {
                    try {
                        const lists = await listService.getAllListsByOwnerId(subuserId);
                        subuserLists = subuserLists.concat(lists);
                    } catch (error) {
                        console.error(`Error fetching lists for subuser ${subuserId}:`, error);
                        // Continue with other subusers even if one fails
                    }
                }
            }

            // Combine all lists
            const allLists = [...userLists, ...subuserLists];

            return res.status(200).json({
                success: true,
                data: allLists
            });
        } catch (error) {
            console.error('Error fetching lists for user and subusers:', error);
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = new MineAndSubusersListController();