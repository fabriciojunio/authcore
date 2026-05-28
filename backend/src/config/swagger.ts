import swaggerJSDoc from 'swagger-jsdoc';
import { config } from './app.config';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: `${config.app.name} API`,
    version: config.app.version,
    description: 'Enterprise-grade REST API with clean architecture',
    contact: {
      name: 'API Support',
      email: 'support@enterprise.com',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: `http://localhost:${config.node.port}${config.app.apiPrefix}`,
      description: 'Development server',
    },
    {
      url: `https://api.yourdomain.com${config.app.apiPrefix}`,
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT access token',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              requestId: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['admin', 'manager', 'user'] },
          status: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  tags: [
    { name: 'Authentication', description: 'Auth endpoints' },
    { name: 'Users', description: 'User management endpoints' },
    { name: 'Health', description: 'Health check endpoints' },
  ],
};

export const swaggerSpec = swaggerJSDoc({
  swaggerDefinition,
  apis: ['./src/routes/*.ts'],
});
