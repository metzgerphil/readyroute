#!/usr/bin/env node

require('dotenv').config();

const { getLaunchReadiness } = require('../config/launchReadiness');

const readiness = getLaunchReadiness(process.env);

console.log(`Billing mode: ${readiness.modes.billing}`);
console.log(`FCC automation: ${readiness.modes.fcc}`);
for (const [name, configured] of Object.entries(readiness.capabilities)) {
  console.log(`${name}: ${configured ? 'configured' : 'not configured'}`);
}
for (const warning of readiness.warnings) {
  console.warn(`Warning: ${warning}`);
}
for (const error of readiness.errors) {
  console.error(`Error: ${error}`);
}

if (!readiness.ready) {
  process.exit(1);
}
