const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const { buildImport, readJsonLines } = require('../scripts/importDriverKnowledge');
const { createDriverHelpService, resolveClarificationFollowUp } = require('./driverHelp');

const root = path.resolve(__dirname, '../../..');
const references = readJsonLines(path.join(root, 'knowledge/reference/delivery-status-codes.jsonl'));
const cases = readJsonLines(path.join(root, 'knowledge/evaluations/reference-language-cases.jsonl'));
const referenceRows = buildImport(
  [],
  new Date(0).toISOString(),
  [],
  new Map(),
  new Map(),
  references,
  cases
).knowledgeRows;

function fakeSupabase(records) {
  const writes = [];
  return {
    writes,
    from(table) {
      if (table === 'driver_help_knowledge_records') {
        return {
          select() {
            return Promise.resolve({ data: records, error: null });
          }
        };
      }
      return {
        insert(row) {
          writes.push({ table, row });
          return Promise.resolve({ error: null });
        }
      };
    }
  };
}

test('short replies resolve against the pending clarification choices', () => {
  const context = {
    pending_clarification_options: [
      { label: 'Yes', query: 'package requires a signature' },
      { label: 'No', query: 'package does not require a signature' }
    ],
    pending_clarification_not_sure_query: 'not sure whether package requires a signature'
  };

  assert.equal(resolveClarificationFollowUp('Yes', context), 'package requires a signature');
  assert.equal(resolveClarificationFollowUp('no', context), 'package does not require a signature');
  assert.equal(
    resolveClarificationFollowUp("I'm not sure.", context),
    'not sure whether package requires a signature'
  );
  assert.equal(resolveClarificationFollowUp('Actually it is ASR', context), 'Actually it is ASR');
});

test('production service routes reference questions separately and preserves canonical trace', async () => {
  const supabase = fakeSupabase(referenceRows);
  const service = createDriverHelpService({
    supabase,
    now: () => new Date('2026-08-10T12:00:00.000Z')
  });

  const response = await service.answerQuestion({
    accountId: 'account-1',
    driverId: 'driver-1',
    question: '002 or 003'
  });

  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.answer_type, 'REFERENCE');
  assert.deepEqual(response.trace.map((item) => item.knowledge_id), [
    'DELIVERY_STATUS:002',
    'DELIVERY_STATUS:003'
  ]);
  assert.ok(response.trace.every((item) => item.knowledge_status === 'SOURCE_VERIFIED'));
  assert.doesNotMatch(response.answer, /do not by themselves authorize/i);
  assert.match(response.more_info, /do not by themselves authorize/i);

  const interaction = supabase.writes.find((write) => write.table === 'driver_help_interactions');
  assert.deepEqual(interaction.row.selected_knowledge_ids, ['DELIVERY_STATUS:002', 'DELIVERY_STATUS:003']);
  assert.ok(interaction.row.canonical_trace.every((item) => item.source_ids.length > 0));
});
