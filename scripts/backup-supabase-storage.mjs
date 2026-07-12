#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_KEY || '';
const outputDirectory = path.resolve(process.argv[2] || 'backup/storage');
const bucketNames = String(
  process.env.BACKUP_STORAGE_BUCKETS || 'driver-documents,pod-photos,support-attachments,vehicle-inspection-photos'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!supabaseUrl || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`
};

function encodeStoragePath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Storage request failed (${response.status}): ${body.slice(0, 400)}`);
  }

  return response.json();
}

async function listPrefix(bucket, prefix = '') {
  const objects = [];
  let offset = 0;

  while (true) {
    const page = await requestJson(
      `${supabaseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          prefix,
          limit: 1000,
          offset,
          sortBy: { column: 'name', order: 'asc' }
        })
      }
    );

    for (const entry of page) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        objects.push({ path: objectPath, metadata: entry.metadata || {} });
      } else {
        objects.push(...await listPrefix(bucket, objectPath));
      }
    }

    if (page.length < 1000) {
      break;
    }
    offset += page.length;
  }

  return objects;
}

async function downloadObject(bucket, object) {
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodeStoragePath(object.path)}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Unable to download ${bucket}/${object.path} (${response.status})`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const destination = path.join(outputDirectory, bucket, ...object.path.split('/'));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);

  return {
    bucket,
    path: object.path,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    content_type: object.metadata?.mimetype || object.metadata?.contentType || null
  };
}

await mkdir(outputDirectory, { recursive: true });
const manifest = {
  version: 1,
  created_at: new Date().toISOString(),
  buckets: bucketNames,
  objects: []
};

for (const bucket of bucketNames) {
  const objects = await listPrefix(bucket);
  for (const object of objects) {
    manifest.objects.push(await downloadObject(bucket, object));
  }
}

manifest.object_count = manifest.objects.length;
manifest.total_bytes = manifest.objects.reduce((total, object) => total + object.size, 0);
await writeFile(
  path.join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(`Backed up ${manifest.object_count} private Storage objects (${manifest.total_bytes} bytes).`);
