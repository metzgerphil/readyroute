const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const { buildImport, readJsonLines } = require('../scripts/importDriverKnowledge');
const { createDriverHelpService, resolveClarificationFollowUp, resolveClarificationSelection } = require('./driverHelp');

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
const operationalRows = buildImport(
  readJsonLines(path.join(root, 'knowledge/operations/records.jsonl')),
  new Date(0).toISOString(),
  readJsonLines(path.join(root, 'knowledge/evaluations/driver-language-cases.jsonl'))
).knowledgeRows;

function filterChain(result) {
  const chain = {
    eq() {
      return chain;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    }
  };
  return chain;
}

function fakeSupabase(records, { sessionContext = null, signedUrl = null } = {}) {
  const writes = [];
  return {
    writes,
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(storagePath, expiresIn) {
            return signedUrl
              ? { data: { signedUrl: `${signedUrl}/${bucket}/${storagePath}?expires=${expiresIn}` }, error: null }
              : { data: null, error: { message: 'not configured' } };
          }
        };
      }
    },
    from(table) {
      if (table === 'driver_help_knowledge_records') {
        return {
          select() {
            return Promise.resolve({ data: records, error: null });
          }
        };
      }
      if (table === 'driver_help_sessions') {
        return {
          insert(row) {
            writes.push({ table, row });
            return Promise.resolve({ error: null });
          },
          select() {
            return filterChain({
              data: sessionContext ? { id: 'session-clarification', context: sessionContext, status: 'active' } : null,
              error: null
            });
          },
          update(row) {
            writes.push({ table, row });
            return filterChain({ error: null });
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

test('clarification choices retain the selected verified record identity', () => {
  const context = {
    pending_clarification_options: [{
      knowledge_id: 'KNO-DEL-BUS-CLOSED-001',
      version: 1,
      label: 'Business is closed when the driver attempts an assigned delivery',
      query: 'Business is closed when the driver attempts an assigned delivery'
    }]
  };

  assert.deepEqual(
    resolveClarificationSelection('Business is closed when the driver attempts an assigned delivery', context),
    context.pending_clarification_options[0]
  );
});

test('selecting an offered verified clarification returns that answer directly', async () => {
  const closedBusiness = operationalRows.find((record) => record.knowledge_id === 'KNO-DEL-BUS-CLOSED-001');
  assert.ok(closedBusiness);
  const label = closedBusiness.canonical_situation;
  const sessionContext = {
    pending_clarification_options: [{
      knowledge_id: closedBusiness.knowledge_id,
      version: closedBusiness.version,
      label,
      query: label
    }]
  };
  const service = createDriverHelpService({
    supabase: fakeSupabase(operationalRows, { sessionContext }),
    now: () => new Date('2026-08-14T20:45:00.000Z')
  });

  const response = await service.answerQuestion({
    accountId: 'account-1',
    driverId: 'driver-1',
    question: label,
    sessionId: 'session-clarification'
  });

  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.trace[0].knowledge_id, 'KNO-DEL-BUS-CLOSED-001');
  assert.ok(response.answer);
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

test('production service returns the published canonical answer without AI rewriting', async () => {
  const supabase = fakeSupabase(operationalRows);
  let composerCalls = 0;
  const service = createDriverHelpService({
    supabase,
    now: () => new Date('2026-08-13T12:00:00.000Z'),
    composeGroundedAnswer: async () => {
      composerCalls += 1;
      throw new Error('The canonical answer must not be rewritten');
    }
  });

  const response = await service.answerQuestion({
    accountId: 'account-1',
    driverId: 'driver-1',
    question: 'turned camera scan on now side button dead'
  });

  const canonicalRecord = operationalRows.find((record) => (
    record.knowledge_id === 'KNO-FORGE-CAMERA-SCAN-001'
  ));
  assert.equal(composerCalls, 0);
  assert.equal(response.composition_mode, 'DETERMINISTIC');
  assert.equal(response.answer, canonicalRecord.concise_answer);
  assert.deepEqual(response.trace[0].composition_source_paths, []);
  const interaction = supabase.writes.find((write) => write.table === 'driver_help_interactions');
  assert.equal(interaction.row.answer_snapshot, canonicalRecord.concise_answer);
  assert.deepEqual(interaction.row.canonical_trace[0].composition_source_paths, []);
});

test('production service signs images attached to the selected verified answer', async () => {
  const cameraRecord = operationalRows.find((record) => (
    record.knowledge_id === 'KNO-FORGE-CAMERA-SCAN-001'
  ));
  const records = operationalRows.map((record) => record === cameraRecord ? {
    ...record,
    images: [{
      filename: 'FAQ-FORGE-SETTINGS-P005.png',
      caption: 'Use Camera to Scan setting',
      storage_bucket: 'driver-help-images',
      storage_path: '2026-08-13.1/FAQ-FORGE-SETTINGS-P005.png',
      width: 1170,
      height: 2532
    }]
  } : record);
  const service = createDriverHelpService({
    supabase: fakeSupabase(records, { signedUrl: 'https://signed.test' }),
    now: () => new Date('2026-08-14T12:00:00.000Z')
  });

  const response = await service.answerQuestion({
    accountId: 'account-1',
    driverId: 'driver-1',
    question: 'turned camera scan on now side button dead'
  });

  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.images.length, 1);
  assert.equal(response.images[0].caption, 'Use Camera to Scan setting');
  assert.match(response.images[0].url, /^https:\/\/signed\.test\/driver-help-images\//);
  assert.equal(response.images[0].expires_in, 900);
  assert.equal(response.images[0].storage_path, undefined);
});
