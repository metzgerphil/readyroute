const test = require('node:test');
const assert = require('node:assert/strict');

const { REQUIRED_SCHEMA_VERSION } = require('../config/schemaVersion');
const { readSchemaCompatibility } = require('./health');

function schemaClient(result) {
  return {
    from(table) {
      assert.equal(table, 'readyroute_schema_state');
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => result
              };
            }
          };
        }
      };
    }
  };
}

test('schema compatibility is true only for the required release', async () => {
  const result = await readSchemaCompatibility(schemaClient({
    data: { version: REQUIRED_SCHEMA_VERSION, applied_at: new Date().toISOString() },
    error: null
  }));

  assert.equal(result.required, REQUIRED_SCHEMA_VERSION);
  assert.equal(result.current, REQUIRED_SCHEMA_VERSION);
  assert.equal(result.compatible, true);
});

test('schema compatibility fails closed for an old or unavailable schema', async () => {
  const oldSchema = await readSchemaCompatibility(schemaClient({
    data: { version: '20260711210000' },
    error: null
  }));
  const unavailable = await readSchemaCompatibility({
    from() {
      throw new Error('database unavailable');
    }
  });

  assert.equal(oldSchema.compatible, false);
  assert.equal(unavailable.compatible, false);
  assert.equal(unavailable.current, null);
});
