#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const easConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'eas.json'), 'utf8'));
const profile = easConfig?.build?.testflight;

if (!profile?.env) {
  console.error('The EAS testflight profile or its environment is missing.');
  process.exit(1);
}

const expoBinary = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo');
const environment = {
  ...process.env,
  ...Object.fromEntries(Object.entries(profile.env).map(([key, value]) => [key, String(value)])),
  HOME: '/tmp/readyroute-expo-home',
  NODE_ENV: 'production'
};

console.log(`Exporting the TestFlight profile against ${environment.EXPO_PUBLIC_API_URL}.`);

const result = spawnSync(
  expoBinary,
  ['export', '--clear', '--platform', 'ios', '--output-dir', 'dist-testflight'],
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

const bundleDirectory = path.join(rootDir, 'dist-testflight', '_expo', 'static', 'js', 'ios');
const bundleName = fs.readdirSync(bundleDirectory).find((name) => name.endsWith('.hbc'));
const bundle = bundleName ? fs.readFileSync(path.join(bundleDirectory, bundleName)) : null;
const expectedApiUrl = Buffer.from(environment.EXPO_PUBLIC_API_URL);

if (!bundle || !bundle.includes(expectedApiUrl)) {
  console.error('The exported iOS bundle does not contain the TestFlight profile API URL.');
  process.exit(1);
}

console.log('Verified the TestFlight API target in the exported iOS bundle.');
