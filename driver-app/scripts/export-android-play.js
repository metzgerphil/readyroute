#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const easConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'eas.json'), 'utf8'));
const profile = easConfig?.build?.['android-play-internal'];

if (!profile?.env) {
  console.error('The EAS android-play-internal profile or its environment is missing.');
  process.exit(1);
}

const expoBinary = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo');
const environment = {
  ...process.env,
  ...Object.fromEntries(Object.entries(profile.env).map(([key, value]) => [key, String(value)])),
  HOME: '/tmp/readyroute-expo-home',
  NODE_ENV: 'production'
};
const outputDirectory = path.join(rootDir, 'dist-android-play');

console.log(`Exporting the Play internal profile against ${environment.EXPO_PUBLIC_API_URL}.`);

const result = spawnSync(
  expoBinary,
  ['export', '--clear', '--platform', 'android', '--output-dir', outputDirectory],
  {
    cwd: rootDir,
    env: environment,
    stdio: 'inherit'
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

function findFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? findFiles(entryPath) : [entryPath];
  });
}

const expectedApiUrl = Buffer.from(environment.EXPO_PUBLIC_API_URL);
const bundleFiles = findFiles(outputDirectory).filter((filePath) => /\.(?:hbc|jsbundle|js)$/.test(filePath));
const containsProductionApi = bundleFiles.some((filePath) => fs.readFileSync(filePath).includes(expectedApiUrl));

if (!containsProductionApi) {
  console.error('The exported Android bundle does not contain the Play profile API URL.');
  process.exit(1);
}

console.log('Verified the production API target in the exported Android bundle.');
