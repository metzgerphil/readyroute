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
  const profileIndex = process.argv.indexOf('--profile');
  const profileName = profileIndex >= 0 ? process.argv[profileIndex + 1] : null;
  const easJsonPath = path.join(rootDir, 'eas.json');

  if (profileName && fs.existsSync(easJsonPath)) {
    const easConfig = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
    const profile = easConfig?.build?.[profileName];
    if (!profile) {
      console.error(`Unknown EAS build profile: ${profileName}`);
      process.exit(1);
    }
    for (const [key, value] of Object.entries(profile.env || {})) {
      if (process.env[key] == null) {
        process.env[key] = String(value);
      }
    }
  }
  if (isProductionCheck) {
    loadDotEnv(path.join(rootDir, '.env.production'));
  }
  loadDotEnv(path.join(rootDir, '.env'));

  const errors = [];
  const warnings = [];

  const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const googleMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const driverHelpOnly = String(process.env.EXPO_PUBLIC_DRIVER_HELP_ONLY || '').trim().toLowerCase() === 'true';
  const appConfigPath = path.join(rootDir, 'app.config.js');
  const packageJsonPath = path.join(rootDir, 'package.json');

  if (!apiUrl) {
    errors.push('Missing EXPO_PUBLIC_API_URL.');
  } else if (isProductionCheck && isLocalUrl(apiUrl)) {
    errors.push('EXPO_PUBLIC_API_URL still points at a local server. Set the production API URL before publishing.');
  }

  if (!driverHelpOnly && !googleMapsKey) {
    errors.push('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.');
  } else if (!driverHelpOnly && googleMapsKey === 'your_key_here') {
    errors.push('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is still a placeholder value.');
  }

  if (!fs.existsSync(appConfigPath)) {
    errors.push('app.config.js is missing.');
  }

  if (!fs.existsSync(easJsonPath)) {
    errors.push('eas.json is missing.');
  }

  if (fs.existsSync(appConfigPath) && fs.existsSync(packageJsonPath)) {
    const appConfig = require(appConfigPath).expo;
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const infoPlist = appConfig?.ios?.infoPlist || {};
    const backgroundModes = infoPlist.UIBackgroundModes || [];
    const locationPlugin = (appConfig?.plugins || []).find((plugin) => (
      Array.isArray(plugin) ? plugin[0] === 'expo-location' : plugin === 'expo-location'
    ));

    if (driverHelpOnly) {
      if (backgroundModes.includes('location') || infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription || locationPlugin) {
        errors.push('Help-only TestFlight configuration must not request route-location access.');
      }
      if (infoPlist.NSPhotoLibraryUsageDescription) {
        errors.push('Help-only TestFlight configuration must not request photo-library access.');
      }
    } else {
      if (!backgroundModes.includes('location')) {
        errors.push('iOS background location mode is not enabled.');
      }
      if (!infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription) {
        errors.push('iOS Always location permission copy is missing.');
      }
      if (!locationPlugin || !Array.isArray(locationPlugin) || locationPlugin[1]?.isIosBackgroundLocationEnabled !== true) {
        errors.push('Expo location background configuration is incomplete.');
      }
      if (!packageJson.dependencies?.['expo-task-manager']) {
        errors.push('expo-task-manager is required for background location delivery.');
      }
    }

    if (['testflight', 'production'].includes(profileName)) {
      const easConfig = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
      const profile = easConfig?.build?.[profileName];
      const submitProfile = easConfig?.submit?.[profileName];
      if (profile?.distribution !== 'store') {
        errors.push(`${profileName} profile must use store distribution.`);
      }
      if (!profile?.autoIncrement) {
        errors.push(`${profileName} profile must auto-increment the build number.`);
      }
      if (!submitProfile?.ios?.ascAppId) {
        errors.push(`${profileName} submit profile is missing ascAppId.`);
      }
      if (!driverHelpOnly) {
        errors.push(`${profileName} profile must set EXPO_PUBLIC_DRIVER_HELP_ONLY=true.`);
      }
      if (appConfig?.ios?.bundleIdentifier !== 'com.readyroute.driverapp') {
        errors.push(`${profileName} profile must use the production iOS bundle identifier.`);
      }
      if (!appConfig?.extra?.eas?.projectId) {
        errors.push('Expo projectId is missing.');
      }
    }
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
  console.log(`- Driver help only: ${driverHelpOnly ? 'yes' : 'no'}`);
  console.log(`- Google Maps key: ${driverHelpOnly ? 'not required' : `${googleMapsKey.slice(0, 8)}...`}`);
  if (profileName) {
    console.log(`- EAS profile: ${profileName}`);
  }
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
