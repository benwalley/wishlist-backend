# CLAUDE.md - Development Guidelines

## Commands
- Start development: `docker-compose up --build`
- Start with hot reload: `npm run dev`
- Start production: `npm start`
- Database migrations: Use Sequelize CLI (e.g., `npx sequelize-cli migrate`, `npx sequelize-cli seed:all`)

## Environment Variables & Deployment
- **Local Development**: Use `.env` file (never commit this file)
- **Production (Heroku)**: Set environment variables in Heroku dashboard or CLI
- **Reference**: Use `.env.example` for required variables
- **Setup**: Copy `.env.example` to `.env` and fill in your values

## Code Style & Conventions
- **Architecture**: Controller → Service → Model pattern
- **Error Handling**: Try/catch blocks with console.error and consistent error responses
- **Naming**: 
  - Files: camelCase.js (controllers/services), PascalCase.js (models)
  - Variables/functions: camelCase
  - Classes: PascalCase
- **Imports**: CommonJS (require/module.exports)
- **Async**: Use async/await with proper error handling
- **API Responses**: Consistent JSON responses with appropriate status codes
- **Models**: Use Sequelize with proper validation and relationships
- **Authentication**: JWT-based with refresh tokens

## Security
- Store environment variables in .env (never commit secrets)
- Validate user input
- Use middleware for authentication (authenticateRoute.js)

## Responses
 - When sending a response, always include a success property (true or false)
 - if there is an error, always include a message property allong with the success: false..
