import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInspectionChecklistItem,
  getInspectionFormValidationError,
  getInspectionItemDefinition,
  serializeInspectionItems
} from './vehicleInspection.js';

test('manager inspection catalog matches the requested safety-equipment choices', () => {
  assert.deepEqual(getInspectionItemDefinition({ id: 'vedr' }).issueFields[0].options, ['Not Connected', 'red light', 'Fell off']);
  assert.deepEqual(getInspectionItemDefinition({ id: 'back_up_camera' }).issueFields[0].options, ['Not showing', 'Monitor glitching']);
  assert.deepEqual(getInspectionItemDefinition({ id: 'turn_cameras' }).issueFields[0].options, ['Not connected', 'monitor glitching', 'camera loose']);
  assert.deepEqual(getInspectionItemDefinition({ id: 'parking_sensors' }).issueFields[0].options, ['No sound', 'sensor missing']);
});

test('manager inspection validation requires issue details and severity', () => {
  const item = createInspectionChecklistItem({ id: 'tires', label: 'Tires' });
  const form = { items: [{ ...item, status: 'issue' }] };

  assert.equal(getInspectionFormValidationError(form), 'Tires needs a severity.');
  form.items[0].severity = 'unsafe';
  assert.equal(getInspectionFormValidationError(form), 'Tires needs which tire?.');
  form.items[0].issue_details = { positions: ['Front Left'], issue_types: ['Flat'] };
  assert.equal(getInspectionFormValidationError(form), null);
});

test('manager inspection serialization keeps issue evidence and removes it from passed items', () => {
  const issue = {
    ...createInspectionChecklistItem({ id: 'tires' }),
    status: 'issue',
    severity: 'unsafe',
    issue_details: { positions: ['Front Left'], issue_types: ['Flat'] },
    note: 'Needs replacement',
    photos: [{ storage_path: 'account/vehicle/photo.jpg' }]
  };
  const passed = {
    ...createInspectionChecklistItem({ id: 'horn' }),
    note: 'Discard this',
    photos: [{ storage_path: 'discard.jpg' }]
  };
  const serialized = serializeInspectionItems([issue, passed]);

  assert.equal(serialized[0].severity, 'unsafe');
  assert.equal(serialized[0].photos.length, 1);
  assert.equal(serialized[1].severity, null);
  assert.deepEqual(serialized[1].photos, []);
});
