const PasswordResetService = require('../services/passwordResetService');

async function clearAllPasswordResets() {
    try {
        console.log('Clearing all password reset requests...');
        const deletedCount = await PasswordResetService.deleteAllRequests();
        console.log(`Successfully deleted ${deletedCount} password reset requests`);
        process.exit(0);
    } catch (error) {
        console.error('Error clearing password resets:', error);
        process.exit(1);
    }
}

clearAllPasswordResets();