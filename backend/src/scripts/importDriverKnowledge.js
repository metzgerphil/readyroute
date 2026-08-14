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
const DEFAULT_DELIVERY_REFERENCES_PATH = path.resolve(
  __dirname,
  '../../../knowledge/reference/delivery-status-codes.jsonl'
);
const DEFAULT_PICKUP_REFERENCES_PATH = path.resolve(
  __dirname,
  '../../../knowledge/reference/pickup-reason-codes.jsonl'
);
const DEFAULT_REFERENCE_CASES_PATH = path.resolve(
  __dirname,
  '../../../knowledge/evaluations/reference-language-cases.jsonl'
);
const DEFAULT_ANSWER_BUNDLE_PATH = path.resolve(
  __dirname,
  '../../../outputs/answer-library-v1/drive-complete/runtime/bundle.json'
);
const DEFAULT_ANSWER_IMAGE_DIR = path.resolve(
  __dirname,
  '../../../outputs/answer-library-v1/drive-complete/runtime/images'
);
const DRIVER_HELP_IMAGE_BUCKET = 'driver-help-images';

const PRODUCTION_ELIGIBLE_STATUSES = new Set(['SOURCE_VERIFIED', 'READY_ROUTE_APPROVED']);

function parseArguments(argv) {
  const args = {
    source: DEFAULT_CORPUS_PATH,
    cases: DEFAULT_CASES_PATH,
    inventory: DEFAULT_INVENTORY_PATH,
    deliveryReferences: DEFAULT_DELIVERY_REFERENCES_PATH,
    pickupReferences: DEFAULT_PICKUP_REFERENCES_PATH,
    referenceCases: DEFAULT_REFERENCE_CASES_PATH,
    answerBundle: DEFAULT_ANSWER_BUNDLE_PATH,
    imageDir: DEFAULT_ANSWER_IMAGE_DIR,
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
    } else if (argv[index] === '--delivery-references' && argv[index + 1]) {
      args.deliveryReferences = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--pickup-references' && argv[index + 1]) {
      args.pickupReferences = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--reference-cases' && argv[index + 1]) {
      args.referenceCases = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--answer-bundle' && argv[index + 1]) {
      args.answerBundle = path.resolve(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--image-dir' && argv[index + 1]) {
      args.imageDir = path.resolve(argv[index + 1]);
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

function readPngDimensions(buffer, filename = 'image') {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`${filename} is not a valid PNG image.`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height) {
    throw new Error(`${filename} has invalid PNG dimensions.`);
  }
  return { width, height };
}

function readAnswerImageIndex(bundlePath, imageDir) {
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Answer bundle not found: ${bundlePath}`);
  }
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const bundleVersion = String(bundle.bundle_version || '').trim();
  if (!bundleVersion) {
    throw new Error('Answer bundle is missing bundle_version.');
  }

  const imagesByKnowledgeId = new Map();
  const assetsByStoragePath = new Map();
  for (const record of bundle.records || []) {
    const knowledgeId = String(record.trace?.source_record_id || '').trim();
    if (!knowledgeId || !Array.isArray(record.images) || !record.images.length) continue;

    const images = record.images.map((image) => {
      const filename = path.basename(String(image.filename || '').trim());
      if (!filename || filename !== image.filename || path.extname(filename).toLowerCase() !== '.png') {
        throw new Error(`Unsafe or unsupported answer image filename: ${image.filename || 'missing'}`);
      }
      const localPath = path.join(imageDir, filename);
      if (!fs.existsSync(localPath)) {
        throw new Error(`Referenced answer image not found: ${localPath}`);
      }
      const bytes = fs.readFileSync(localPath);
      const dimensions = readPngDimensions(bytes, filename);
      const storagePath = `${bundleVersion}/${filename}`;
      assetsByStoragePath.set(storagePath, {
        filename,
        localPath,
        storagePath,
        bytes,
        checksum: crypto.createHash('sha256').update(bytes).digest('hex')
      });
      return {
        filename,
        caption: String(image.caption || '').trim(),
        storage_bucket: DRIVER_HELP_IMAGE_BUCKET,
        storage_path: storagePath,
        width: dimensions.width,
        height: dimensions.height,
        checksum: assetsByStoragePath.get(storagePath).checksum
      };
    });

    const existing = imagesByKnowledgeId.get(knowledgeId) || [];
    const merged = [...existing];
    for (const image of images) {
      if (!merged.some((candidate) => candidate.storage_path === image.storage_path)) merged.push(image);
    }
    imagesByKnowledgeId.set(knowledgeId, merged);
  }

  return {
    bundleVersion,
    imagesByKnowledgeId,
    assets: [...assetsByStoragePath.values()]
  };
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

function toKnowledgeRow(
  record,
  importedAt,
  extraVariants = [],
  questionPatterns = [],
  publicationGate = {},
  images
) {
  const variants = [...new Set([...(record.driver_question_variants || []), ...extraVariants])];
  const isPublished = publicationGate.isPublished === true;
  const row = {
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
  if (images !== undefined) row.images = isPublished ? images : [];
  return row;
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

function mapReferenceStatus(status) {
  if (status === 'VERIFIED') return 'SOURCE_VERIFIED';
  if (status === 'POTENTIALLY_OUTDATED') return 'POTENTIALLY_OUTDATED';
  if (status === 'INSUFFICIENT_EVIDENCE') return 'INSUFFICIENT_EVIDENCE';
  return 'PENDING_REVIEW';
}

function validateReferenceRecord(reference) {
  const errors = [];
  if (!['DELIVERY_STATUS', 'PICKUP_REASON'].includes(reference.namespace)) errors.push('namespace');
  if (!/^\d{2,3}$/.test(String(reference.code || ''))) errors.push('code');
  if (!reference.label) errors.push('label');
  if (!reference.applies_when) errors.push('applies_when');
  if (!reference.source_id) errors.push('source_id');
  if (!reference.locator) errors.push('locator');
  if (!['VERIFIED', 'HUMAN_REVIEW_REQUIRED', 'POTENTIALLY_OUTDATED', 'INSUFFICIENT_EVIDENCE']
    .includes(reference.knowledge_status)) errors.push('knowledge_status');
  return errors;
}

function toCanonicalReferenceRecord(reference, referenceCases = []) {
  const knowledgeId = `${reference.namespace}:${reference.code}`;
  const status = mapReferenceStatus(reference.knowledge_status);
  const caseMatches = referenceCases.filter((testCase) => (
    (testCase.expected_reference_ids || []).includes(knowledgeId)
  ));
  const namespaceLabel = reference.namespace === 'PICKUP_REASON'
    ? 'pickup reason'
    : 'delivery status';
  const boundary = `This ${namespaceLabel} definition does not by itself authorize selecting the code or establish the complete operational workflow.`;
  return {
    schema_version: '1.0.0',
    knowledge_id: knowledgeId,
    record_version: 1,
    knowledge_status: status,
    source_research_status: reference.knowledge_status,
    canonical_situation: `${namespaceLabel} ${reference.code} — ${reference.label}`,
    normalized_description: reference.applies_when,
    category_paths: [`REFERENCE/${reference.namespace}`],
    applicability: [reference.applies_when],
    conditions: reference.scope_notes || [],
    authoritative_rule: `${reference.code} means “${reference.label}” in the ${namespaceLabel} namespace when ${reference.applies_when}`,
    prohibited_actions: [boundary],
    escalation_requirements: status === 'SOURCE_VERIFIED'
      ? []
      : ['Contact management or station personnel for the current approved definition and procedure.'],
    clarification_requirements: [],
    driver_question_variants: [
      `what is ${reference.code}`,
      `${namespaceLabel} ${reference.code}`,
      `code ${reference.code}`,
      ...caseMatches.map((testCase) => testCase.utterance)
    ],
    concise_driver_answer: `${reference.code} — ${reference.label}: ${reference.applies_when}`,
    more_info_answer: [...(reference.scope_notes || []), boundary].join(' '),
    source_date_or_version: reference.source_version || null,
    source_ids: [reference.source_id],
    source_evidence: [{
      source_id: reference.source_id,
      locator: reference.locator,
      evidence_summary: `${namespaceLabel} ${reference.code} definition.`
    }],
    production_eligibility: {
      status_eligible: status === 'SOURCE_VERIFIED',
      publication_ready: status === 'SOURCE_VERIFIED',
      capture_gate: 'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY',
      trace_gate: 'CLAIM_FRAGMENT_TRACE_READY',
      blockers: status === 'SOURCE_VERIFIED' ? [] : [`KNOWLEDGE_STATUS_${status}`]
    },
    reference_question_patterns: caseMatches.map((testCase) => ({
      utterance: testCase.utterance,
      response_mode: testCase.response_mode,
      information_sufficiency: testCase.information_sufficiency,
      must_clarify: testCase.must_clarify || [],
      unknown_reference_tokens: testCase.unknown_reference_tokens || []
    }))
  };
}

function buildImport(
  records,
  importedAt = new Date().toISOString(),
  driverCases = [],
  sourceInventory = new Map(),
  publicationGateIndex = buildPublicationGateIndex(records),
  references = [],
  referenceCases = [],
  imageIndex = null
) {
  const eligible = records.filter((record) => PRODUCTION_ELIGIBLE_STATUSES.has(record.knowledge_status));
  const invalid = eligible
    .map((record) => ({ record, errors: validateProductionEligibleRecord(record) }))
    .filter((entry) => entry.errors.length);
  if (invalid.length) {
    const detail = invalid.map((entry) => `${entry.record.knowledge_id || 'UNKNOWN'}: ${entry.errors.join(', ')}`).join('; ');
    throw new Error(`Production-eligible records failed publication validation: ${detail}`);
  }
  const invalidReferences = references
    .map((reference) => ({ reference, errors: validateReferenceRecord(reference) }))
    .filter((entry) => entry.errors.length);
  if (invalidReferences.length) {
    const detail = invalidReferences.map((entry) => (
      `${entry.reference.namespace || 'UNKNOWN'}:${entry.reference.code || 'UNKNOWN'}: ${entry.errors.join(', ')}`
    )).join('; ');
    throw new Error(`Canonical reference records failed validation: ${detail}`);
  }
  const referenceIds = references.map((reference) => `${reference.namespace}:${reference.code}`);
  if (new Set(referenceIds).size !== referenceIds.length) {
    throw new Error('Canonical reference records contain duplicate namespace/code identities.');
  }

  const variantIndex = buildVariantIndex(driverCases);
  const patternIndex = buildPatternIndex(driverCases);
  const knowledgeRows = records.map((record) => toKnowledgeRow(
    record,
    importedAt,
    variantIndex.get(record.knowledge_id) || [],
    patternIndex.get(record.knowledge_id) || [],
    publicationGateIndex.get(record.knowledge_id),
    imageIndex ? imageIndex.get(record.knowledge_id) || [] : undefined
  ));
  const canonicalReferences = references.map((reference) => (
    toCanonicalReferenceRecord(reference, referenceCases)
  ));
  const referenceGates = buildPublicationGateIndex(canonicalReferences);
  for (const record of canonicalReferences) {
    knowledgeRows.push(toKnowledgeRow(
      record,
      importedAt,
      [],
      record.reference_question_patterns || [],
      referenceGates.get(record.knowledge_id)
    ));
  }
  const sourceMap = new Map();
  const evidenceRows = [];

  for (const record of [...records, ...canonicalReferences]) {
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

async function uploadAnswerImages(supabase, assets) {
  const bucket = supabase.storage.from(DRIVER_HELP_IMAGE_BUCKET);
  for (const asset of assets) {
    const { error } = await bucket.upload(asset.storagePath, asset.bytes, {
      cacheControl: '31536000',
      contentType: 'image/png',
      upsert: true
    });
    if (error) throw error;
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const records = readJsonLines(args.source);
  const driverCases = fs.existsSync(args.cases) ? readJsonLines(args.cases) : [];
  const sourceInventory = fs.existsSync(args.inventory) ? readSourceInventory(args.inventory) : new Map();
  const references = [args.deliveryReferences, args.pickupReferences]
    .filter((filePath) => fs.existsSync(filePath))
    .flatMap((filePath) => readJsonLines(filePath));
  const referenceCases = fs.existsSync(args.referenceCases) ? readJsonLines(args.referenceCases) : [];
  const answerImages = fs.existsSync(args.answerBundle)
    ? readAnswerImageIndex(args.answerBundle, args.imageDir)
    : { bundleVersion: null, imagesByKnowledgeId: null, assets: [] };
  const publicationGateIndex = buildPublicationGateIndex(records);
  const payload = buildImport(
    records,
    new Date().toISOString(),
    driverCases,
    sourceInventory,
    publicationGateIndex,
    references,
    referenceCases,
    answerImages.imagesByKnowledgeId
  );
  const summary = {
    source_file: args.source,
    source_inventory_file: fs.existsSync(args.inventory) ? args.inventory : null,
    total_records: records.length,
    reference_records: references.length,
    indexed_records: payload.knowledgeRows.length,
    published_operational_records: payload.knowledgeRows.filter((row) => (
      row.is_published && !String(row.knowledge_id).includes(':')
    )).length,
    published_reference_definitions: payload.knowledgeRows.filter((row) => (
      row.is_published && String(row.knowledge_id).includes(':')
    )).length,
    withheld_reference_definitions: payload.knowledgeRows.filter((row) => (
      !row.is_published && String(row.knowledge_id).includes(':')
    )).length,
    published_production_eligible_records: payload.knowledgeRows.filter((row) => row.is_published).length,
    withheld_production_eligible_records: payload.knowledgeRows.filter((row) => (
      PRODUCTION_ELIGIBLE_STATUSES.has(row.status) && !row.is_published
    )).length,
    sources: payload.sourceRows.length,
    evidence_links: payload.evidenceRows.length,
    answer_bundle_version: answerImages.bundleVersion,
    records_with_images: payload.knowledgeRows.filter((row) => row.images?.length).length,
    answer_image_assets: answerImages.assets.length,
    dry_run: args.dryRun
  };

  if (!args.dryRun) {
    const supabase = require('../lib/supabase');
    await uploadAnswerImages(supabase, answerImages.assets);
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
  mapReferenceStatus,
  parseArguments,
  parseCsv,
  readAnswerImageIndex,
  readJsonLines,
  readPngDimensions,
  readSourceInventory,
  PRODUCTION_ELIGIBLE_STATUSES,
  toCanonicalReferenceRecord,
  uploadAnswerImages,
  validateReferenceRecord,
  validateProductionEligibleRecord
};
