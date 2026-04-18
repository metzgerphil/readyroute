import { Buffer } from 'buffer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn()
}));

import { getDriverFromToken } from './auth';

function makeToken(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `header.${encodedPayload}.signature`;
}

describe('auth service helpers', () => {
  it('extracts the driver payload from a token', () => {
    const token = makeToken({
      sub: 'driver-1',
      name: 'Phil',
      route_id: 'route-1'
    });

    expect(getDriverFromToken(token)).toEqual({
      sub: 'driver-1',
      name: 'Phil',
      route_id: 'route-1'
    });
  });

  it('returns null for missing or malformed tokens', () => {
    expect(getDriverFromToken(null)).toBeNull();
    expect(getDriverFromToken('not-a-jwt')).toBeNull();
    expect(getDriverFromToken('header.invalid.signature')).toBeNull();
  });
});
