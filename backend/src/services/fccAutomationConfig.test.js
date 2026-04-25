const test = require('node:test');
const assert = require('node:assert/strict');

const { parseRouteFilter, renderTemplate, resolveFccAutomationConfig } = require('./fccAutomationConfig');

test('parseRouteFilter returns trimmed route filters', () => {
  assert.deepEqual(parseRouteFilter('810, 811 , ,823'), ['810', '811', '823']);
});

test('renderTemplate replaces named placeholders', () => {
  assert.equal(
    renderTemplate('https://example.com/manifests?date={workDate}&route={route}', {
      workDate: '2026-04-24',
      route: '810'
    }),
    'https://example.com/manifests?date=2026-04-24&route=810'
  );
});

test('resolveFccAutomationConfig pulls selectors and flags from env', () => {
  const config = resolveFccAutomationConfig({
    FEDEX_FCC_LOGIN_URL: 'https://fcc.example.com/login',
    FEDEX_FCC_PORTAL_URL: 'https://fcc.example.com/portal',
    FEDEX_FCC_MANIFEST_URL: 'https://fcc.example.com/manifest?date={workDate}',
    FEDEX_FCC_MANIFEST_ROW_SELECTOR: 'table tbody tr',
    READYROUTE_FCC_ROUTE_FILTER: '810,811',
    FEDEX_FCC_HEADLESS: 'false',
    FEDEX_FCC_SLOW_MO_MS: '125'
  });

  assert.equal(config.loginUrl, 'https://fcc.example.com/login');
  assert.equal(config.portalUrl, 'https://fcc.example.com/portal');
  assert.equal(config.manifestRowSelector, 'table tbody tr');
  assert.deepEqual(config.routeFilter, ['810', '811']);
  assert.equal(config.headless, false);
  assert.equal(config.slowMoMs, 125);
});
