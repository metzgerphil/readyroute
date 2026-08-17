import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.firebase-hosting-dist');
const landing = path.join(root, 'landing-page');
const portal = path.join(root, 'manager-portal', 'dist');

await rm(output, { recursive: true, force: true });
await cp(landing, output, { recursive: true });
await mkdir(path.join(output, 'staff'), { recursive: true });
await cp(portal, path.join(output, 'staff'), { recursive: true });
await cp(path.join(portal, 'assets'), path.join(output, 'assets'), {
  recursive: true,
  force: true
});

console.log('Unified ReadyRoute hosting bundle created.');
