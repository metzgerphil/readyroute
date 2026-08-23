const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');

test('the canonical signup page contains every required step and preserves an in-progress draft', () => {
  const signup = fs.readFileSync(path.join(root, 'landing-page/signup.html'), 'utf8');
  [
    'readyroute-signup-version',
    'name="role"',
    'name="company"',
    'name="cxpc_phone_number"',
    'name="csa_number"',
    'name="manager_name"',
    'name="manager_phone_number"',
    'name="drivers"',
    'readyrouteSignupDraftV3',
    'showServerValidation',
    'signup_form_version'
  ].forEach((expected) => assert.match(signup, new RegExp(expected)));
});

test('the legacy MVP page cannot submit the incomplete signup form', () => {
  const mvp = fs.readFileSync(path.join(root, 'landing-page/mvp.html'), 'utf8');
  assert.doesNotMatch(mvp, /id="waitlist-form"/);
  assert.doesNotMatch(mvp, /\/waitlist\/early-access/);
  assert.match(mvp, /href="\/signup"/);
});

test('landing hosting prevents stale signup HTML and redirects legacy entry points', () => {
  const firebase = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const landing = firebase.hosting.find((entry) => entry.target === 'landing');
  assert.ok(landing);
  const signupCacheHeader = landing.headers.find((entry) => entry.source.includes('signup'));
  assert.equal(signupCacheHeader.headers[0].value, 'no-cache, no-store, must-revalidate');
  assert.deepEqual(
    landing.redirects.filter((entry) => entry.source.startsWith('/mvp')),
    [
      { source: '/mvp', destination: '/signup', type: 302 },
      { source: '/mvp.html', destination: '/signup', type: 302 }
    ]
  );

  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'landing-page/vercel.json'), 'utf8'));
  assert.equal(vercel.headers.find((entry) => entry.source === '/signup').headers[0].value, 'no-cache, no-store, must-revalidate');
  assert.ok(vercel.redirects.some((entry) => entry.source === '/mvp' && entry.destination === '/signup'));
});
