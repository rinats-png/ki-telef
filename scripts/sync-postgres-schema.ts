import { readFileSync, writeFileSync } from 'node:fs';
const schema = readFileSync('prisma/schema.prisma', 'utf8').replace('provider = "sqlite"', 'provider = "postgresql"');
writeFileSync('prisma/postgresql/schema.prisma', '// Generated from the canonical SQLite development schema. Run npm run db:postgres:sync after model changes.\n' + schema);
