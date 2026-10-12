import { TEST_DB_URL } from './env';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DB_URL;
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.MAX_UPLOAD_MB = '1';
