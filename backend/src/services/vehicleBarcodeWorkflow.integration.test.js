const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const { createDriverHelpService } = require('./driverHelp');

function vehicleRecord() {
  return {
    knowledge_id: 'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001',
    version: 2,
    status: 'READY_ROUTE_APPROVED',
    is_published: true,
    source_ids: ['SRC-OWNER'],
    adjudication_id: 'ADJ-VEHICLE-BARCODE',
    approved_by: 'Phillip Metzger',
    approval_date: '2026-08-19',
    canonical_schema_version: '1.0.0',
    canonical_situation: 'The vehicle barcode is missing or cannot be scanned at login',
    normalized_description: 'Generate a Code 128 vehicle barcode inside ReadyRoute.',
    taxonomy_paths: ['TAX-FORGE', 'TAX-FORGE/TAX-VEHICLE-LOGIN'],
    applicability: ['A vehicle barcode is needed'],
    conditions: ['Use Code 128'],
    exceptions: [],
    authoritative_rule: 'Generate Code 128 for V plus the actual vehicle number.',
    required_procedure: [],
    required_documentation: [],
    prohibited_actions: [],
    escalation_requirements: [],
    clarification_requirements: ['What is the vehicle number?'],
    related_knowledge_ids: [],
    driver_question_variants: ['Can you create a barcode for me?'],
    driver_question_patterns: [],
    images: [],
    concise_answer: 'ReadyRoute generates the vehicle barcode in app.',
    more_info_answer: null
  };
}

function inMemorySupabase(records) {
  const sessions = new Map();
  const interactions = [];

  function filterable(resolveRows, updateRows = null) {
    const filters = [];
    const chain = {
      eq(column, value) { filters.push([column, value]); return chain; },
      maybeSingle() {
        const rows = resolveRows().filter((row) => filters.every(([column, value]) => row[column] === value));
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
      then(resolve, reject) {
        try {
          const rows = resolveRows().filter((row) => filters.every(([column, value]) => row[column] === value));
          if (updateRows) updateRows(rows);
          return Promise.resolve({ error: null }).then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      }
    };
    return chain;
  }

  return {
    sessions,
    interactions,
    storage: { from: () => ({ async createSignedUrl() { return { data: null, error: null }; } }) },
    from(table) {
      if (table === 'driver_help_knowledge_records') {
        return { select: async () => ({ data: records, error: null }) };
      }
      if (table === 'driver_help_sessions') {
        return {
          select() { return filterable(() => [...sessions.values()]); },
          insert(row) { sessions.set(row.id, { ...row, status: 'active' }); return Promise.resolve({ error: null }); },
          update(values) {
            return filterable(
              () => [...sessions.values()],
              (rows) => rows.forEach((row) => sessions.set(row.id, { ...row, ...values }))
            );
          }
        };
      }
      if (table === 'driver_help_interactions') {
        return { insert(row) { interactions.push(row); return Promise.resolve({ error: null }); } };
      }
      if (table === 'driver_help_answer_memory') {
        return { select() { return filterable(() => []); } };
      }
      if (table === 'driver_help_unanswered_questions') {
        return { insert() { return Promise.resolve({ error: null }); } };
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };
}

test('the two-turn barcode workflow is isolated by authenticated session and actor', async () => {
  const supabase = inMemorySupabase([vehicleRecord()]);
  const service = createDriverHelpService({
    supabase,
    aiInterpretationMode: 'OFF',
    now: () => new Date('2026-08-19T12:00:00Z')
  });

  const firstDriverPrompt = await service.answerQuestion({
    accountId: 'account-1',
    driverId: 'driver-1',
    question: 'Can you create a barcode for me?'
  });
  const secondDriverPrompt = await service.answerQuestion({
    accountId: 'account-1',
    driverId: 'driver-2',
    question: 'I need a Code 128'
  });

  assert.equal(firstDriverPrompt.response_mode, 'CLARIFY');
  assert.equal(firstDriverPrompt.clarification_prompt, 'What is the vehicle number?');
  assert.equal(secondDriverPrompt.response_mode, 'CLARIFY');
  assert.notEqual(firstDriverPrompt.session_id, secondDriverPrompt.session_id);

  const firstBarcode = await service.answerQuestion({
    accountId: 'account-1',
    driverId: 'driver-1',
    sessionId: firstDriverPrompt.session_id,
    question: '400770'
  });
  const secondBarcode = await service.answerQuestion({
    accountId: 'account-1',
    driverId: 'driver-2',
    sessionId: secondDriverPrompt.session_id,
    question: '123456'
  });

  assert.deepEqual(firstBarcode.barcode, { symbology: 'CODE128', value: 'V400770' });
  assert.deepEqual(secondBarcode.barcode, { symbology: 'CODE128', value: 'V123456' });
  assert.equal(firstBarcode.answer_type, 'VEHICLE_BARCODE');
  assert.equal(firstBarcode.trace[0].knowledge_id, 'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001');
  assert.equal(supabase.sessions.get(firstDriverPrompt.session_id).context.pending_workflow, null);
  assert.equal(supabase.sessions.get(secondDriverPrompt.session_id).context.pending_workflow, null);
});

test('a session id from another driver cannot consume that driver’s pending barcode state', async () => {
  const supabase = inMemorySupabase([vehicleRecord()]);
  const service = createDriverHelpService({ supabase, aiInterpretationMode: 'OFF' });
  const ownerPrompt = await service.answerQuestion({
    accountId: 'account-1', driverId: 'driver-1', question: 'Vehicle barcode is missing'
  });

  const otherDriver = await service.answerQuestion({
    accountId: 'account-1',
    driverId: 'driver-2',
    sessionId: ownerPrompt.session_id,
    question: '400770'
  });

  assert.equal(otherDriver.response_mode, 'ESCALATE');
  assert.equal(otherDriver.barcode, null);
});

test('one hundred simultaneous barcode conversations remain isolated', async () => {
  const supabase = inMemorySupabase([vehicleRecord()]);
  const service = createDriverHelpService({ supabase, aiInterpretationMode: 'OFF' });
  const drivers = Array.from({ length: 100 }, (_, index) => ({
    accountId: `account-${(index % 5) + 1}`,
    driverId: `driver-${index + 1}`,
    vehicleNumber: String(400000 + index)
  }));

  const prompts = await Promise.all(drivers.map((driver) => service.answerQuestion({
    accountId: driver.accountId,
    driverId: driver.driverId,
    question: indexIntent(driver.driverId)
  })));

  assert.equal(new Set(prompts.map((result) => result.session_id)).size, drivers.length);
  assert.ok(prompts.every((result) => (
    result.response_mode === 'CLARIFY'
    && result.clarification_prompt === 'What is the vehicle number?'
  )));

  const barcodes = await Promise.all(drivers.map((driver, index) => service.answerQuestion({
    accountId: driver.accountId,
    driverId: driver.driverId,
    sessionId: prompts[index].session_id,
    question: driver.vehicleNumber
  })));

  for (const [index, result] of barcodes.entries()) {
    assert.deepEqual(result.barcode, {
      symbology: 'CODE128',
      value: `V${drivers[index].vehicleNumber}`
    });
    assert.equal(supabase.sessions.get(prompts[index].session_id).context.pending_workflow, null);
  }
});

function indexIntent(driverId) {
  const number = Number(driverId.split('-').at(-1));
  return number % 3 === 0
    ? 'I need a Code 128'
    : number % 3 === 1
      ? 'Can you create a barcode for me?'
      : 'I cannot find the vehicle scan barcode';
}
