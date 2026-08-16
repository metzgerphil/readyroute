const test = require('node:test');
const assert = require('node:assert/strict');

const {
  APP_REVIEW_EMAIL,
  APP_REVIEW_USERNAME,
  assertAppReviewIdentity
} = require('./provisionAppReviewDriver');

test('app review provisioner is locked to the dedicated identity', () => {
  assert.doesNotThrow(() => assertAppReviewIdentity(APP_REVIEW_EMAIL, APP_REVIEW_USERNAME));
  assert.throws(() => assertAppReviewIdentity('real-driver@example.com', APP_REVIEW_USERNAME));
  assert.throws(() => assertAppReviewIdentity(APP_REVIEW_EMAIL, 'another-user'));
});
