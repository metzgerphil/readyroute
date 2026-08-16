const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STAGING_AUTOMATION_EMAIL,
  STAGING_COMPANY_NAME,
  STAGING_PROJECT_REF
} = require('./provisionStagingManager');

test('staging automation uses a fixed non-human manager identity', () => {
  assert.equal(STAGING_AUTOMATION_EMAIL, 'rra-staging-automation@readyroute.test');
  assert.equal(STAGING_COMPANY_NAME, 'Smoke Test ReadyRoute Account');
  assert.equal(STAGING_PROJECT_REF, 'xtzbjlmizmdfqelvhhwx');
  assert.notEqual(STAGING_AUTOMATION_EMAIL, process.env.STAGING_MANAGER_BOOTSTRAP_EMAIL);
});
