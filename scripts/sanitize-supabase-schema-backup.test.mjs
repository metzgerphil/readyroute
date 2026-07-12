import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('schema sanitizer removes embedded bearer JWTs without removing the trigger', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'readyroute-schema-'));
  const schemaPath = path.join(directory, 'schema.sql');
  await writeFile(
    schemaPath,
    `CREATE TRIGGER example EXECUTE FUNCTION supabase_functions.http_request('Authorization: Bearer eyJheader.payload.signature');\n`
  );
  const result = spawnSync(process.execPath, [
    path.resolve('scripts/sanitize-supabase-schema-backup.mjs'),
    schemaPath
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const sanitized = await readFile(schemaPath, 'utf8');
  assert.match(sanitized, /CREATE TRIGGER example/);
  assert.match(sanitized, /Bearer REDACTED_RESTORE_REQUIRED/);
  assert.doesNotMatch(sanitized, /eyJheader/);
});
