// Variáveis de ambiente mínimas para os testes unitários e de integração
process.env['NODE_ENV'] = 'test';
process.env['APP_NAME'] = 'EnterpriseApp';
process.env['PORT'] = '3001';
process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-that-is-at-least-64-characters-long-for-jest-tests-ok';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-that-is-at-least-64-characters-long-for-jest-tests';
process.env['ENCRYPTION_KEY'] = 'test-encryption-key-exactly-32ch';
process.env['DB_HOST'] = 'localhost';
process.env['DB_NAME'] = 'enterprise_test';
process.env['DB_USER'] = 'postgres';
process.env['DB_PASSWORD'] = 'postgres';
process.env['REDIS_HOST'] = 'localhost';
process.env['SMTP_HOST'] = 'localhost';
process.env['SMTP_USER'] = 'test@example.com';
process.env['SMTP_PASSWORD'] = 'test-password';
process.env['EMAIL_FROM'] = 'noreply@example.com';
process.env['ALLOWED_ORIGINS'] = 'http://localhost:3000';
