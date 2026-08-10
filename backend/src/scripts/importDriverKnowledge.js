const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_CORPUS_PATH = path.resolve(
  __dirname,
  '../../../research/fedex-ground-driver-knowledge/knowledge/records.jsonl'
);
const DEFAULT_CASES_PATH = path.resolve(
  __dirname,
  '../../../research/fedex-ground-driver-knowledge/validation/driver_language_cases.jsonl'
);
const DEFAULT_INVENTORY_PATH = path.resolve(
  __dirname,
  '../../../research/fedex-ground-driver-knowledge/inventory/source_inventory.csv'
);
const DEFAULT_CAPTURE_GATES_PATH = path.resolve(
  __dirname,
  '../../../research/fedex-ground-driver-knowledge/knowledge/evidence_capture_risk_coverage.csv'
);
const DEFAULT_TRACE_GATES_PATH = path.resolve(
  __dirname,
  '../../../research/fedex-ground-driver-knowledge/knowledge/claim_evidence_allocation_coverage.jsonl'
);

function parseArguments(argv) {
  const args = {
    source: DEFAULT_CORPUS_PATH,
    cases: DEFAULT_CASES_PATH,
    inventory: DEFAULT_INVENTORY_PATH,
    captureGates: DEFAULT_CAPTURE_GATES_PATH,
    traceGates: DEFAULT_TRACE_GATES_PATH,
    dryRun: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--source' && argv[index + 1]) {
      args.source = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--dry-run') {
      args.dryRun = true;
    } else if (argv[index] === '--cases' && argv[index + 1]) {
      args.cases = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--inventory' && argv[index + 1]) {
      args.inventory = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--capture-gates' && argv[index + 1]) {
      args.captureGates = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--trace-gates' && argv[index + 1]) {
      args.traceGates = path.resolve(argv[index + 1]);
      index += 1;
    }
  }
  return args;
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    if (character === '"') {
      if (quoted && csvText[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && csvText[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readSourceInventory(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const headers = rows.shift() || [];
  return new Map(rows.map((values) => {
    const item = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    return [item.source_id, item];
  }).filter(([sourceId]) => sourceId));
}

function buildPublicationGateIndex(records, captureRows = [], traceClaims = []) {
  const captureByKnowledgeId = new Map(captureRows.map((row) => [row.knowledge_id, row]));
  const blockedClaimCounts = new Map();
  for (const claim of traceClaims) {
    if (claim.production_trace_gate !== 'CLAIM_FRAGMENT_TRACE_READY') {
      blockedClaimCounts.set(claim.knowledge_id, (blockedClaimCounts.get(claim.knowledge_id) || 0) + 1);
    }
  }

  return new Map(records.map((record) => {
    const capture = captureByKnowledgeId.get(record.knowledge_id);
    const captureGate = capture?.production_capture_gate || 'CAPTURE_GATE_MISSING';
    const blockedClaims = blockedClaimCounts.get(record.knowledge_id) || 0;
    const blockers = [];
    if (record.knowledge_status !== 'VERIFIED') blockers.push(`KNOWLEDGE_STATUS_${record.knowledge_status}`);
    if (!captureGate.startsWith('CAPTURE_COMPLETE')) blockers.push(captureGate);
    if (blockedClaims) blockers.push(`${blockedClaims}_CLAIMS_REQUIRE_EXACT_EVIDENCE_ALLOCATION`);
    return [record.knowledge_id, {
      isPublished: record.knowledge_status === 'VERIFIED' && blockers.length === 0,
      captureGate,
      traceGate: blockedClaims ? 'WITHHOLD_EXACT_CLAIM_FRAGMENT_ASSERTION_UNTIL_ALLOCATED' : 'CLAIM_FRAGMENT_TRACE_READY',
      blockers
    }];
  }));
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`);
      }
    });
}

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateVerifiedRecord(record) {
  const errors = [];
  if (!record.knowledge_id) errors.push('knowledge_id');
  if (!record.canonical_situation) errors.push('canonical_situation');
  if (!record.authoritative_rule) errors.push('authoritative_rule');
  if (!record.concise_ready_route_answer) errors.push('concise_ready_route_answer');
  if (!Array.isArray(record.evidence) || !record.evidence.length) errors.push('evidence');
  if (!Array.isArray(record.driver_question_variants) || !record.driver_question_variants.length) errors.push('driver_question_variants');
  return errors;
}

function toKnowledgeRow(record, importedAt, extraVariants = [], questionPatterns = [], publicationGate = {}) {
  const variants = [...new Set([...(record.driver_question_variants || []), ...extraVariants])];
  const isPublished = publicationGate.isPublished === true;
  return {
    knowledge_id: record.knowledge_id,
    version: 1,
    status: record.knowledge_status,
    is_published: isPublished,
    canonical_situation: record.canonical_situation,
    normalized_description: record.normalized_description || null,
    taxonomy_paths: record.taxonomy_paths || [],
    applicability: record.applicability || [],
    conditions: record.conditions || [],
    exceptions: record.exceptions || [],
    authoritative_rule: record.authoritative_rule,
    required_procedure: record.required_procedure || [],
    required_documentation: record.required_documentation || [],
    prohibited_actions: record.prohibited_actions || [],
    escalation_requirements: record.escalation_requirements || [],
    clarification_requirements: record.clarification_requirements || [],
    related_knowledge_ids: record.related_knowledge_ids || [],
    driver_question_variants: variants,
    driver_question_patterns: questionPatterns,
    concise_answer: record.concise_ready_route_answer,
    more_info_answer: record.more_info_answer || null,
    source_date_or_version: record.source_date_or_version || null,
    production_capture_gate: publicationGate.captureGate || 'CAPTURE_GATE_MISSING',
    production_trace_gate: publicationGate.traceGate || 'WITHHOLD_EXACT_CLAIM_FRAGMENT_ASSERTION_UNTIL_ALLOCATED',
    publication_blockers: publicationGate.blockers || ['PUBLICATION_GATE_MISSING'],
    record_checksum: checksum(record),
    published_at: isPublished ? importedAt : null,
    updated_at: importedAt
  };
}

function buildVariantIndex(driverCases = []) {
  const index = new Map();
  for (const testCase of driverCases) {
    for (const knowledgeId of testCase.expected_knowledge_ids || []) {
      const variants = index.get(knowledgeId) || [];
      variants.push(testCase.utterance);
      index.set(knowledgeId, variants);
    }
  }
  return index;
}

function buildPatternIndex(driverCases = []) {
  const index = new Map();
  for (const testCase of driverCases) {
    for (const knowledgeId of testCase.expected_knowledge_ids || []) {
      const patterns = index.get(knowledgeId) || [];
      patterns.push({
        utterance: testCase.utterance,
        response_mode: testCase.response_mode,
        information_sufficiency: testCase.information_sufficiency,
        must_clarify: testCase.must_clarify || []
      });
      index.set(knowledgeId, patterns);
    }
  }
  return index;
}

function buildImport(
  records,
  importedAt = new Date().toISOString(),
  driverCases = [],
  sourceInventory = new Map(),
  publicationGateIndex = buildPublicationGateIndex(records)
) {
  const verified = records.filter((record) => record.knowledge_status === 'VERIFIED');
  const invalid = verified
    .map((record) => ({ record, errors: validateVerifiedRecord(record) }))
    .filter((entry) => entry.errors.length);
  if (invalid.length) {
    const detail = invalid.map((entry) => `${entry.record.knowledge_id || 'UNKNOWN'}: ${entry.errors.join(', ')}`).join('; ');
    throw new Error(`Verified records failed publication validation: ${detail}`);
  }

  const variantIndex = buildVariantIndex(driverCases);
  const patternIndex = buildPatternIndex(driverCases);
  const knowledgeRows = records.map((record) => toKnowledgeRow(
    record,
    importedAt,
    variantIndex.get(record.knowledge_id) || [],
    patternIndex.get(record.knowledge_id) || [],
    publicationGateIndex.get(record.knowledge_id)
  ));
  const sourceMap = new Map();
  const evidenceRows = [];

  for (const record of records) {
    for (const evidence of record.evidence) {
      const sourceId = String(evidence.source_id || '').trim();
      const locator = String(evidence.locator || '').trim();
      if (!sourceId || !locator) {
        throw new Error(`${record.knowledge_id} has evidence without source_id or locator.`);
      }
      const source = sourceInventory.get(sourceId) || {};
      sourceMap.set(sourceId, {
        source_id: sourceId,
        title: source.title || sourceId,
        source_type: source.source_type || null,
        source_date_or_version: source.version || source.effective_date || source.modified_at || null,
        internal_location: source.local_archive_path || source.url_or_path || null,
        updated_at: importedAt
      });
      evidenceRows.push({
        knowledge_id: record.knowledge_id,
        knowledge_version: 1,
        source_id: sourceId,
        locator,
        evidence_note: evidence.evidence_summary || null
      });
    }
  }

  return {
    knowledgeRows,
    sourceRows: [...sourceMap.values()],
    evidenceRows
  };
}

async function upsertInBatches(table, rows, options = {}) {
  const supabase = require('../lib/supabase');
  for (let index = 0; index < rows.length; index += 50) {
    const { error } = await supabase.from(table).upsert(rows.slice(index, index + 50), options);
    if (error) throw error;
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const records = readJsonLines(args.source);
  const driverCases = fs.existsSync(args.cases) ? readJsonLines(args.cases) : [];
  const sourceInventory = fs.existsSync(args.inventory) ? readSourceInventory(args.inventory) : new Map();
  const captureRows = fs.existsSync(args.captureGates)
    ? (() => {
      const rows = parseCsv(fs.readFileSync(args.captureGates, 'utf8'));
      const headers = rows.shift() || [];
      return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
    })()
    : [];
  const traceClaims = fs.existsSync(args.traceGates) ? readJsonLines(args.traceGates) : [];
  const publicationGateIndex = buildPublicationGateIndex(records, captureRows, traceClaims);
  const payload = buildImport(records, new Date().toISOString(), driverCases, sourceInventory, publicationGateIndex);
  const summary = {
    source_file: args.source,
    source_inventory_file: fs.existsSync(args.inventory) ? args.inventory : null,
    total_records: records.length,
    indexed_records: payload.knowledgeRows.length,
    published_verified_records: payload.knowledgeRows.filter((row) => row.is_published).length,
    withheld_verified_records: payload.knowledgeRows.filter((row) => row.status === 'VERIFIED' && !row.is_published).length,
    sources: payload.sourceRows.length,
    evidence_links: payload.evidenceRows.length,
    dry_run: args.dryRun
  };

  if (!args.dryRun) {
    await upsertInBatches('driver_help_knowledge_sources', payload.sourceRows, { onConflict: 'source_id' });
    await upsertInBatches('driver_help_knowledge_records', payload.knowledgeRows, { onConflict: 'knowledge_id,version' });
    await upsertInBatches('driver_help_knowledge_record_sources', payload.evidenceRows, {
      onConflict: 'knowledge_id,knowledge_version,source_id,locator'
    });
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildImport,
  buildPublicationGateIndex,
  buildPatternIndex,
  buildVariantIndex,
  parseArguments,
  parseCsv,
  readJsonLines,
  readSourceInventory,
  validateVerifiedRecord
};
