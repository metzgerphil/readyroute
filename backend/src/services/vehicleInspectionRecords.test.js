const test = require('node:test');
const assert = require('node:assert/strict');

const {
  insertVehicleInspectionWithSchemaFallback,
  normalizeInspectionItems,
  resolveInspectionStatus,
  summarizeInspectionItems,
  validateInspectionItemsForSubmission
} = require('./vehicleInspectionRecords');

test('normalizeInspectionItems preserves neutral unanswered state instead of defaulting to pass', () => {
  const items = normalizeInspectionItems([
    { checklist_item_key: 'tires', label: 'Tires' }
  ]);

  assert.equal(items[0].status, 'unanswered');
});

test('validateInspectionItemsForSubmission rejects unanswered required items', () => {
  const result = validateInspectionItemsForSubmission([
    { checklist_item_key: 'tires', label: 'Tires', status: 'pass' },
    { checklist_item_key: 'lights', label: 'Lights' }
  ]);

  assert.equal(result.error, 'All inspection items must be answered before submitting');
});

test('legacy fail status is accepted as an issue with conservative severity', () => {
  const result = validateInspectionItemsForSubmission([
    { checklist_item_key: 'tires', label: 'Tires', status: 'fail' }
  ]);

  assert.equal(result.error, undefined);
  assert.equal(result.items[0].status, 'issue');
  assert.equal(result.items[0].severity, 'maintenance_soon');
  assert.equal(resolveInspectionStatus({ items: result.items }), 'safe_with_maintenance_reported');
});

test('pass status with issue evidence is promoted before validation', () => {
  const result = validateInspectionItemsForSubmission([
    {
      checklist_item_key: 'wipers',
      label: 'Wipers',
      status: 'pass',
      severity: 'unsafe',
      issue_details: {
        position: 'Both',
        issue_type: 'Not working'
      }
    }
  ]);

  assert.equal(result.error, undefined);
  assert.equal(result.items[0].status, 'issue');
  assert.equal(result.items[0].severity, 'unsafe');
  assert.equal(resolveInspectionStatus({ items: result.items }), 'urgent_manager_review');
});

test('pass status with issue note but no severity is rejected instead of saving clean', () => {
  const result = validateInspectionItemsForSubmission([
    {
      checklist_item_key: 'engine_oil',
      label: 'Engine Oil',
      status: 'pass',
      note: 'I think it needs to be checked'
    }
  ]);

  assert.equal(result.error, 'Issue severity is required for every inspection issue');
});

test('unsafe issue resolves to urgent manager review without vehicle status authority', () => {
  const items = normalizeInspectionItems([
    {
      checklist_item_key: 'tires',
      label: 'Tires',
      status: 'issue',
      severity: 'unsafe',
      issue_details: {
        position: 'Back Right',
        issue_type: 'Exposed cord'
      }
    }
  ]);
  const summary = summarizeInspectionItems(items);

  assert.equal(summary.urgent_review, true);
  assert.equal(summary.manager_review_required, true);
  assert.equal(summary.highest_severity, 'unsafe');
  assert.equal(resolveInspectionStatus({ items }), 'urgent_manager_review');
});

test('general inspection note alone does not create manager review with no issue items', () => {
  const items = normalizeInspectionItems([
    { checklist_item_key: 'tires', label: 'Tires', status: 'pass' },
    { checklist_item_key: 'wipers', label: 'Wipers', status: 'pass' }
  ]);
  const summary = summarizeInspectionItems(items, { issueNote: 'General handoff note for the inspection.' });

  assert.equal(summary.issue_count, 0);
  assert.equal(summary.manager_review_required, false);
  assert.equal(summary.urgent_review, false);
  assert.equal(resolveInspectionStatus({ items, issueNote: 'General handoff note for the inspection.' }), 'safe_to_operate');
});

test('insertVehicleInspectionWithSchemaFallback retries legacy status when database constraint is old', async () => {
  let insertAttempts = 0;
  const supabase = {
    from(table) {
      assert.equal(table, 'vehicle_inspections');
      return {
        insert(payload) {
          insertAttempts += 1;
          if (insertAttempts === 1) {
            assert.equal(payload.status, 'urgent_manager_review');
            return {
              select() {
                return {
                  single: async () => ({
                    data: null,
                    error: {
                      code: '23514',
                      message: 'new row for relation "vehicle_inspections" violates check constraint "vehicle_inspections_status_check"'
                    }
                  })
                };
              }
            };
          }

          assert.equal(payload.status, 'needs_review');
          return {
            select() {
              return {
                single: async () => ({ data: { id: 'inspection-1', ...payload }, error: null })
              };
            }
          };
        }
      };
    }
  };

  const result = await insertVehicleInspectionWithSchemaFallback(supabase, {
    account_id: 'acct-1',
    vehicle_id: 'vehicle-1',
    inspection_date: '2026-06-27',
    inspection_type: 'driver',
    odometer: 65000,
    issue_reported: true,
    status: 'urgent_manager_review'
  });

  assert.equal(result.error, null);
  assert.equal(result.data.status, 'needs_review');
  assert.deepEqual(result.fallbackReasons, ['legacy_inspection_status']);
  assert.equal(insertAttempts, 2);
});
