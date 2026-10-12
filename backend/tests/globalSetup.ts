import { execSync } from 'node:child_process';
import { TEST_DB_URL } from './env';

export default function setup() {
  // Create / reset the schema in the isolated test database (never the dev database).
  execSync('npx prisma db push --skip-generate --force-reset --accept-data-loss', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  });
}
