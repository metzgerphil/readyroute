const assert = require('node:assert/strict');
const test = require('node:test');

const { createRouteOptimizer } = require('./routeOptimizer');

test('route optimizer uses Application Default Credentials and preserves every stop', async () => {
  const requests = [];
  const optimizer = createRouteOptimizer({
    projectId: 'ready-route-project',
    auth: {
      async getClient() {
        return {
          async getAccessToken() {
            return { token: 'adc-access-token' };
          }
        };
      }
    },
    httpClient: {
      async post(url, body, config) {
        requests.push({ url, body, config });
        return {
          data: {
            routes: [{ visits: [{ shipmentIndex: 1 }, { shipmentIndex: 0 }] }]
          }
        };
      }
    }
  });
  const stops = [
    { id: 'stop-1', lat: 33.1, lng: -117.1 },
    { id: 'stop-2', lat: 33.2, lng: -117.2 }
  ];

  const result = await optimizer.optimizeRoute(stops, 33, -117, []);

  assert.deepEqual(result.stops.map((stop) => stop.id), ['stop-2', 'stop-1']);
  assert.equal(result.warning, null);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /ready-route-project:optimizeTours$/);
  assert.equal(requests[0].config.headers.Authorization, 'Bearer adc-access-token');
});

test('route optimizer falls back safely when project configuration is missing', async () => {
  const optimizer = createRouteOptimizer({
    projectId: '',
    auth: {
      async getProjectId() {
        return null;
      }
    }
  });
  const stops = [
    { id: 'stop-1', lat: 33.1, lng: -117.1 },
    { id: 'stop-2', lat: 33.2, lng: -117.2 }
  ];

  const result = await optimizer.optimizeRoute(stops, 33, -117, []);

  assert.deepEqual(result.stops.map((stop) => stop.id), ['stop-1', 'stop-2']);
  assert.equal(result.warning, 'optimization_unavailable');
});
