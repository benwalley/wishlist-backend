// config/passport.js
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const passport = require('passport');
const models = require("../../models"); // Your Sequelize User model
const secretOrKey = process.env.JWT_SECRET || 'your_jwt_secret';

const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey
};

// Only log that config is loaded, not the actual secrets
console.log('JWT authentication configuration loaded')

passport.use(
    new JwtStrategy(opts, async (jwt_payload, done) => {
        try {
            console.log('trying')

            // With Sequelize, if userId is your key:
            const user = await models.User.findByPk(jwt_payload.userId);
            if (user) {
                return done(null, user);
            }
            return done(null, false);
        } catch (error) {
            return done(error, false);
        }
    })
);

module.exports = passport;
