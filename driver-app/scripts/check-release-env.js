#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line) || !line.includes('=')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

function isLocalUrl(value) {
  if (!value) {
    return false;
  }

  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const isProductionCheck = process.argv.includes('--production');
  if (isProductionCheck) {
    loadDotEnv(path.join(rootDir, '.env.production'));
  }
  loadDotEnv(path.join(rootDir, '.env'));

  const errors = [];
  const warnings = [];

  const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const appConfigPath = path.join(rootDir, 'app.config.js');
  const easJsonPath = path.join(rootDir, 'eas.json');

  if (!apiUrl) {
    errors.push('Missing EXPO_PUBLIC_API_URL.');
  } else if (isProductionCheck && isLocalUrl(apiUrl)) {
    errors.push('EXPO_PUBLIC_API_URL still points at a local server. Set the production API URL before publishing.');
  }

  if (!googleMapsKey) {
    errors.push('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.');
  } else if (googleMapsKey === 'your_key_here') {
    errors.push('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is still a placeholder value.');
  }

  if (!fs.existsSync(appConfigPath)) {
    errors.push('app.config.js is missing.');
  }

  if (!fs.existsSync(easJsonPath)) {
    errors.push('eas.json is missing.');
  }

  if (!errors.length && isLocalUrl(apiUrl)) {
    warnings.push('API URL is local, which is fine for development but not for App Store / TestFlight release builds.');
  }

  if (errors.length) {
    console.error('\nReadyRoute driver app release check failed:\n');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('\nReadyRoute driver app release check passed.');
  console.log(`- API URL: ${apiUrl}`);
  console.log(`- Google Maps key: ${googleMapsKey.slice(0, 8)}...`);
  console.log(`- Expo config: ${path.basename(appConfigPath)}`);
  console.log(`- EAS config: ${path.basename(easJsonPath)}`);

  if (warnings.length) {
    console.log('\nWarnings:');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
}

main();
