const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VEHICLE_NUMBER_PROMPT,
  buildVehicleBarcodeValue,
  buildVehicleBarcodeWorkflowDecision,
  isVehicleBarcodeIntent
} = require('./vehicleBarcodeWorkflow');

const record = {
  knowledge_id: 'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001',
  version: 2,
  canonical_situation: 'The vehicle barcode is missing or cannot be scanned at login'
};

test('detects Code 128, missing vehicle barcode, and barcode creation requests', () => {
  for (const question of [
    'I need a Code 128.',
    "I can't find the barcode for the vehicle scan. What do I do?",
    'The truck barcode is missing',
    'My van barcode will not scan',
    'Can you create a barcode for me?',
    'Can you make a bar code for me?',
    'Make me a barcode',
    'Please generate a barcode',
    'The veihcle barcode is missing'
  ]) {
    assert.equal(isVehicleBarcodeIntent(question), true, question);
  }
});

test('does not capture unrelated package-barcode questions', () => {
  for (const question of [
    'The pickup package has no barcode',
    'The package barcode will not scan',
    'Only the 00 barcode is visible',
    'The SRA form has no barcode',
    'The business is closed'
  ]) {
    assert.equal(isVehicleBarcodeIntent(question), false, question);
  }
});

test('asks only for the vehicle number when the workflow begins', () => {
  const decision = buildVehicleBarcodeWorkflowDecision('I need a Code 128', {}, record);

  assert.equal(decision.response_mode, 'CLARIFY');
  assert.equal(decision.answer_type, 'VEHICLE_BARCODE');
  assert.equal(decision.clarification_prompt, VEHICLE_NUMBER_PROMPT);
  assert.deepEqual(decision.clarification_options, []);
  assert.equal(decision.workflow.state, 'AWAITING_VEHICLE_NUMBER');
});

test('constructs the exact V-prefixed value and specifies Code 128', () => {
  assert.equal(buildVehicleBarcodeValue('400770'), 'V400770');
  assert.equal(buildVehicleBarcodeValue('  “400770?”  '), 'V400770');
  const decision = buildVehicleBarcodeWorkflowDecision('400770', {
    pending_workflow: { type: 'VEHICLE_BARCODE', state: 'AWAITING_VEHICLE_NUMBER' }
  }, record);

  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.barcode.value, 'V400770');
  assert.equal(decision.barcode.symbology, 'CODE128');
  assert.equal(decision.selected_records[0], record);
  assert.equal(decision.workflow.state, 'COMPLETE');
});
