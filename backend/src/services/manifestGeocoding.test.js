const test = require('node:test');
const assert = require('node:assert/strict');

const axios = require('axios');
const { enrichManifestStopsWithGeocoding } = require('./manifestGeocoding');

class QueryBuilder {
  constructor(handler, table) {
    this.handler = handler;
    this.table = table;
    this.state = { filters: [], payload: null, operation: 'select' };
  }

  select() {
    this.state.operation = 'select';
    return this;
  }

  insert(payload) {
    this.state.operation = 'insert';
    this.state.payload = payload;
    return this;
  }

  update(payload) {
    this.state.operation = 'update';
    this.state.payload = payload;
    return this;
  }

  eq(column, value) {
    this.state.filters.push({ op: 'eq', column, value });
    return this;
  }

  is(column, value) {
    this.state.filters.push({ op: 'is', column, value });
    return this;
  }

  limit() {
    return this;
  }

  async maybeSingle() {
    return this.handler({ table: this.table, ...this.state, mode: 'maybeSingle' });
  }

  async then(resolve, reject) {
    try {
      const result = await this.handler({ table: this.table, ...this.state, mode: 'all' });
      return resolve(result);
    } catch (error) {
      return reject(error);
    }
  }
}

function createSupabase(handler) {
  return {
    from(table) {
      return new QueryBuilder(handler, table);
    }
  };
}

test('enrichManifestStopsWithGeocoding geocodes stops when lat/lng are null', async () => {
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalGet = axios.get;
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';

  let insertPayload = null;
  const supabase = createSupabase(async (query) => {
    if (query.table !== 'location_corrections') {
      throw new Error(`Unexpected table ${query.table}`);
    }

    if (query.operation === 'select') {
      return { data: null, error: null };
    }

    if (query.operation === 'insert') {
      insertPayload = query.payload;
      return { data: null, error: null };
    }

    throw new Error(`Unexpected operation ${query.operation}`);
  });

  axios.get = async () => ({
    data: {
      status: 'OK',
      results: [
        {
          geometry: {
            location: { lat: 33.1, lng: -117.2 },
            location_type: 'ROOFTOP'
          },
          formatted_address: '123 Main St, Escondido, CA 92025, USA'
        }
      ]
    }
  });

  try {
    const result = await enrichManifestStopsWithGeocoding(supabase, 'acct-1', [
      {
        address: '123 Main St, Escondido, CA 92025',
        address_line2: null,
        lat: null,
        lng: null
      }
    ]);

    assert.equal(result.summary.status, 'completed');
    assert.equal(result.summary.attempted, 1);
    assert.equal(result.summary.geocoded, 1);
    assert.equal(result.stops[0].lat, 33.1);
    assert.equal(result.stops[0].lng, -117.2);
    assert.equal(result.stops[0].geocode_source, 'manifest_geocoded');
    assert.equal(result.stops[0].geocode_accuracy, 'rooftop');
    assert.ok(insertPayload);
  } finally {
    axios.get = originalGet;
    process.env.GOOGLE_MAPS_API_KEY = originalKey;
  }
});
