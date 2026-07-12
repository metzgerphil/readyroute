#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const backupDirectory = path.resolve(process.argv[2] || 'backup/storage');
const manifest = JSON.parse(await readFile(path.join(backupDirectory, 'manifest.json'), 'utf8'));

for (const object of manifest.objects || []) {
  const filePath = path.join(backupDirectory, object.bucket, ...object.path.split('/'));
  const fileStat = await stat(filePath);
  if (fileStat.size !== object.size) {
    throw new Error(`Size mismatch for ${object.bucket}/${object.path}`);
  }

  const bytes = await readFile(filePath);
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (checksum !== object.sha256) {
    throw new Error(`Checksum mismatch for ${object.bucket}/${object.path}`);
  }
}

console.log(`Verified ${(manifest.objects || []).length} private Storage objects.`);
