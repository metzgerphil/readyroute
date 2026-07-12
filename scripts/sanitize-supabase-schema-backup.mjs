#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const schemaPath = path.resolve(process.argv[2] || 'backup/database/schema.sql');
const schema = await readFile(schemaPath, 'utf8');
const sanitized = schema.replace(/Bearer\s+eyJ[A-Za-z0-9._-]+/g, 'Bearer REDACTED_RESTORE_REQUIRED');

if (/Bearer\s+eyJ[A-Za-z0-9._-]+/.test(sanitized)) {
  throw new Error('A bearer JWT remains in the schema backup');
}

await writeFile(schemaPath, sanitized);
console.log('Sanitized embedded bearer credentials from the schema backup.');
