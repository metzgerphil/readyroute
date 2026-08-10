const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_CORPUS_PATH = path.resolve(
  __dirname,
  '../../../knowledge/operations/records.jsonl'
);
const DEFAULT_CASES_PATH = path.resolve(
  __dirname,
  '../../../knowledge/evaluations/driver-language-cases.jsonl'
);
const DEFAULT_INVENTORY_PATH = path.resolve(
  __dirname,
  '../../../knowledge/sources/registry.jsonl'
);

const PRODUCTION_ELIGIBLE_STATUSES = new Set(['SOURCE_VERIFIED', 'READY_ROUTE_APPROVED']);

function parseArguments(argv) {
  const args = {
    source: DEFAULT_CORPUS_PATH,
    cases: DEFAULT_CASES_PATH,
    inventory: DEFAULT_INVENTORY_PATH,
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
  if (path.extname(filePath).toLowerCase() === '.jsonl') {
    return new Map(readJsonLines(filePath).map((item) => [item.source_id, item]));
  }
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const headers = rows.shift() || [];
  return new Map(rows.map((values) => {
    const item = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    return [item.source_id, item];
  }).filter(([sourceId]) => sourceId));
}

function buildPublicationGateIndex(records) {
  return new Map(records.map((record) => {
    const eligibility = record.production_eligibility || {};
    const statusEligible = PRODUCTION_ELIGIBLE_STATUSES.has(record.knowledge_status);
    const declaredStatusEligible = eligibility.status_eligible === true;
    const blockers = [...(eligibility.blockers || [])];
    if (!statusEligible) blockers.unshift(`KNOWLEDGE_STATUS_${record.knowledge_status}`);
    if (statusEligible && !declaredStatusEligible) blockers.push('CANONICAL_STATUS_ELIGIBILITY_FALSE');
    return [record.knowledge_id, {
      isPublished: statusEligible && declaredStatusEligible && eligibility.publication_ready === true && blockers.length === 0,
      captureGate: eligibility.capture_gate || 'CAPTURE_GATE_MISSING',
      traceGate: eligibility.trace_gate || 'TRACE_GATE_MISSING',
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

function validateProductionEligibleRecord(record) {
  const errors = [];
  if (!record.knowledge_id) errors.push('knowledge_id');
  if (!record.canonical_situation) errors.push('canonical_situation');
  if (!record.authoritative_rule) errors.push('authoritative_rule');
  if (!record.concise_driver_answer) errors.push('concise_driver_answer');
  if (!Array.isArray(record.source_evidence) || !record.source_evidence.length) errors.push('source_evidence');
  if (!Array.isArray(record.driver_question_variants) || !record.driver_question_variants.length) errors.push('driver_question_variants');
  return errors;
}

function toKnowledgeRow(record, importedAt, extraVariants = [], questionPatterns = [], publicationGate = {}) {
  const variants = [...new Set([...(record.driver_question_variants || []), ...extraVariants])];
  const isPublished = publicationGate.isPublished === true;
  return {
    knowledge_id: record.knowledge_id,
    version: record.record_version,
    status: record.knowledge_status,
    is_published: isPublished,
    canonical_situation: record.canonical_situation,
    normalized_description: record.normalized_description || null,
    taxonomy_paths: record.category_paths || [],
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
    concise_answer: record.concise_driver_answer,
    more_info_answer: record.more_info_answer || null,
    source_date_or_version: record.source_date_or_version || null,
    source_ids: record.source_ids || [],
    production_capture_gate: publicationGate.captureGate || 'CAPTURE_GATE_MISSING',
    production_trace_gate: publicationGate.traceGate || 'WITHHOLD_EXACT_CLAIM_FRAGMENT_ASSERTION_UNTIL_ALLOCATED',
    publication_blockers: publicationGate.blockers || ['PUBLICATION_GATE_MISSING'],
    adjudication_id: record.adjudication_id || null,
    approved_by: record.approved_by || null,
    approval_date: record.approval_date || null,
    source_research_status: record.source_research_status || null,
    canonical_schema_version: record.schema_version || null,
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
  const eligible = records.filter((record) => PRODUCTION_ELIGIBLE_STATUSES.has(record.knowledge_status));
  const invalid = eligible
    .map((record) => ({ record, errors: validateProductionEligibleRecord(record) }))
    .filter((entry) => entry.errors.length);
  if (invalid.length) {
    const detail = invalid.map((entry) => `${entry.record.knowledge_id || 'UNKNOWN'}: ${entry.errors.join(', ')}`).join('; ');
    throw new Error(`Production-eligible records failed publication validation: ${detail}`);
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
    for (const evidence of record.source_evidence || []) {
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
        internal_location: source.local_archive_path || source.original_location || source.url_or_path || null,
        updated_at: importedAt
      });
      evidenceRows.push({
        knowledge_id: record.knowledge_id,
        knowledge_version: record.record_version,
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
  const publicationGateIndex = buildPublicationGateIndex(records);
  const payload = buildImport(records, new Date().toISOString(), driverCases, sourceInventory, publicationGateIndex);
  const summary = {
    source_file: args.source,
    source_inventory_file: fs.existsSync(args.inventory) ? args.inventory : null,
    total_records: records.length,
    indexed_records: payload.knowledgeRows.length,
    published_production_eligible_records: payload.knowledgeRows.filter((row) => row.is_published).length,
    withheld_production_eligible_records: payload.knowledgeRows.filter((row) => (
      PRODUCTION_ELIGIBLE_STATUSES.has(row.status) && !row.is_published
    )).length,
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
  PRODUCTION_ELIGIBLE_STATUSES,
  validateProductionEligibleRecord
};
