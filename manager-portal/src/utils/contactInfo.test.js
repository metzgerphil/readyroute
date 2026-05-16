import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTelHref, getStopContactDetails, getStopContactSummaryParts } from './contactInfo.js';

test('getStopContactDetails exposes manifest contact fields without using blanks', () => {
  assert.deepEqual(
    getStopContactDetails({
      contact_name: 'Acme Receiving',
      business_name: '',
      company_name: 'Acme Warehouse',
      primary_phone: '(555) 111-2222 ext. 9',
      alternate_phone: '555-222-3333',
      email: 'dock@example.com',
      customer_instructions: '',
      delivery_instructions: 'Use rear dock',
      consignee: 'Acme Logistics',
      shipper: 'Sender Co'
    }),
    {
      contactName: 'Acme Receiving',
      businessName: 'Acme Warehouse',
      primaryPhone: '(555) 111-2222 ext. 9',
      alternatePhone: '555-222-3333',
      email: 'dock@example.com',
      instructions: 'Use rear dock',
      consignee: 'Acme Logistics',
      shipper: 'Sender Co',
      hasPhone: true,
      hasAny: true
    }
  );
});

test('getStopContactDetails keeps empty manifests clean', () => {
  assert.deepEqual(
    getStopContactDetails({
      contact_name: '   ',
      business_name: '',
      primary_phone: '',
      email: null,
      customer_instructions: ''
    }),
    {
      contactName: '',
      businessName: '',
      primaryPhone: '',
      alternatePhone: '',
      email: '',
      instructions: '',
      consignee: '',
      shipper: '',
      hasPhone: false,
      hasAny: false
    }
  );
});

test('contact summaries and tel links stay display-safe for manager popups', () => {
  const stop = {
    contact_name: 'Dock Contact',
    business_name: 'North Dock',
    primary_phone: '+1 (555) 444-5555 x12',
    email: 'dock@example.com'
  };

  assert.deepEqual(getStopContactSummaryParts(stop), [
    'Dock Contact',
    'North Dock',
    '+1 (555) 444-5555 x12',
    'dock@example.com'
  ]);
  assert.equal(buildTelHref(stop.primary_phone), 'tel:+15554445555,12');
  assert.equal(buildTelHref('not a phone'), '');
});

