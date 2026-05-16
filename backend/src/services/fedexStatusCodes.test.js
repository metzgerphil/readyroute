const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getFedExExceptionCode,
  isFedExExceptionCode,
  normalizeFedExStatusCode
} = require('./fedexStatusCodes');

test('normalizes delivery and pickup FedEx exception codes', () => {
  assert.equal(normalizeFedExStatusCode('7'), '007');
  assert.equal(normalizeFedExStatusCode('status: 30'), '030');
  assert.equal(normalizeFedExStatusCode('status code 7'), '007');
  assert.equal(normalizeFedExStatusCode('P1'), 'P01');
  assert.equal(normalizeFedExStatusCode('10', { pickup: true }), 'P10');
});

test('identifies only tracked FedEx exception codes', () => {
  assert.equal(getFedExExceptionCode('7'), '007');
  assert.equal(getFedExExceptionCode('012'), '012');
  assert.equal(getFedExExceptionCode('P26'), 'P26');
  assert.equal(getFedExExceptionCode('26', { pickup: true }), 'P26');
  assert.equal(getFedExExceptionCode('014'), null);
  assert.equal(isFedExExceptionCode('014'), false);
});
