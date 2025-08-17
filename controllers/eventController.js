const EventService = require('../services/eventService');

/**
 * Get all events for the current user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getUserEvents = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated.' 
            });
        }

        const userId = req.user.id;
        const result = await EventService.getUserEvents(userId);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in getUserEvents controller:', error);
        res.status(error.status || 500).json({ 
            success: false, 
            message: error.message || 'Failed to retrieve events'
        });
    }
};

/**
 * Get event by ID with recipients
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getEventById = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated.' 
            });
        }

        const userId = req.user.id;
        const { id: eventId } = req.params;

        if (!eventId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Event ID is required.' 
            });
        }

        const result = await EventService.getEventById(parseInt(eventId), userId);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in getEventById controller:', error);
        res.status(error.status || 500).json({ 
            success: false, 
            message: error.message || 'Failed to retrieve event'
        });
    }
};

/**
 * Create a new event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.createEvent = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated.' 
            });
        }

        const userId = req.user.id;
        const { eventData, userIds } = req.body;

        if (!eventData || !eventData.name) {
            return res.status(400).json({ 
                success: false, 
                message: 'Event name is required.' 
            });
        }

        const result = await EventService.createEvent(eventData, userIds, userId);
        
        res.status(201).json(result);
    } catch (error) {
        console.error('Error in createEvent controller:', error);
        res.status(error.status || 500).json({ 
            success: false, 
            message: error.message || 'Failed to create event'
        });
    }
};

/**
 * Update an event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateEvent = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated.' 
            });
        }

        const userId = req.user.id;
        const { id: eventId } = req.params;
        const { eventData, userIds } = req.body;

        if (!eventId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Event ID is required.' 
            });
        }

        if (!eventData) {
            return res.status(400).json({ 
                success: false, 
                message: 'Event data is required.' 
            });
        }

        const result = await EventService.updateEvent(parseInt(eventId), eventData, userIds, userId);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in updateEvent controller:', error);
        res.status(error.status || 500).json({ 
            success: false, 
            message: error.message || 'Failed to update event'
        });
    }
};

/**
 * Update event recipients
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateEventRecipients = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated.' 
            });
        }

        const userId = req.user.id;
        const recipientUpdates = req.body;

        if (!Array.isArray(recipientUpdates)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Request body must be an array of recipient update objects.' 
            });
        }

        const result = await EventService.updateEventRecipients(recipientUpdates, userId);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in updateEventRecipients controller:', error);
        res.status(error.status || 500).json({ 
            success: false, 
            message: error.message || 'Failed to update event recipients'
        });
    }
};

/**
 * Save note for an event recipient
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.saveRecipientNote = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated.' 
            });
        }

        const userId = req.user.id;
        const { eventId, recipientUserId } = req.params;
        const { note } = req.body;

        if (!eventId || !recipientUserId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Event ID and recipient user ID are required.' 
            });
        }

        if (note === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Note field is required.' 
            });
        }

        const result = await EventService.saveRecipientNote(parseInt(eventId), parseInt(recipientUserId), note, userId);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in saveRecipientNote controller:', error);
        res.status(error.status || 500).json({ 
            success: false, 
            message: error.message || 'Failed to save recipient note'
        });
    }
};