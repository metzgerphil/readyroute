import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const landingDir = path.join(root, 'landing-page');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function pngDimensions(relativePath) {
  const image = fs.readFileSync(path.join(root, relativePath));
  assert.equal(image.toString('ascii', 1, 4), 'PNG', `${relativePath} must be a PNG`);
  return [image.readUInt32BE(16), image.readUInt32BE(20)];
}

for (const file of fs.readdirSync(landingDir).filter((name) => name.endsWith('.html'))) {
  const html = read(`landing-page/${file}`);
  assert.match(html, /rel="icon"[^>]+href="\/favicon\.png"/, `${file} must link to the ReadyRoute favicon`);
}

const home = read('landing-page/index.html');
assert.match(home, /href="\/favicon\.ico"/);
assert.match(home, /rel="apple-touch-icon"[^>]+href="\/apple-touch-icon\.png"/);
assert.match(home, /rel="manifest" href="\/site\.webmanifest"/);
assert.match(home, /"@type":"WebSite"/);
assert.match(home, /"name":"ReadyRoute"/);

assert.deepEqual(pngDimensions('landing-page/favicon.png'), [192, 192]);
assert.deepEqual(pngDimensions('landing-page/apple-touch-icon.png'), [180, 180]);
assert.deepEqual(pngDimensions('landing-page/site-icon-512.png'), [512, 512]);
assert.deepEqual(pngDimensions('manager-portal/public/favicon.png'), [192, 192]);

const manifest = JSON.parse(read('landing-page/site.webmanifest'));
assert.equal(manifest.name, 'ReadyRoute');
assert.deepEqual(manifest.icons.map(({ src, sizes }) => [src, sizes]), [
  ['/favicon.png', '192x192'],
  ['/site-icon-512.png', '512x512'],
]);

assert.match(read('manager-portal/index.html'), /href="\/favicon\.png"/);

console.log('ReadyRoute site branding verified.');
