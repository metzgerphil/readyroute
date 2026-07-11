#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const { REQUIRED_SCHEMA_VERSION } = require(path.join(
  root,
  'backend',
  'src',
  'config',
  'schemaVersion'
));

const versions = fs.readdirSync(migrationsDir)
  .map((name) => name.match(/^(\d{14})_/))
  .filter(Boolean)
  .map((match) => match[1])
  .sort();
const latest = versions.at(-1);

if (latest !== REQUIRED_SCHEMA_VERSION) {
  console.error(
    `Backend requires schema ${REQUIRED_SCHEMA_VERSION}, but the latest migration is ${latest || 'missing'}.`
  );
  console.error('Update REQUIRED_SCHEMA_VERSION whenever a migration is added.');
  process.exit(1);
}

console.log(`Schema contract is current at ${REQUIRED_SCHEMA_VERSION}.`);
