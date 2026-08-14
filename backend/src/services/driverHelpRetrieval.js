const { matchCriticalIntent } = require('./driverHelpIntentProfiles');

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'but', 'can', 'do', 'for', 'from', 'how', 'i',
  'if', 'in', 'is', 'it', 'm', 'me', 'my', 'of', 'on', 'or', 'the', 'there', 'this',
  'to', 'was', 'what', 'when', 'where', 'with', 'ignore', 'instructions', 'invent',
  'pretend', 'general', 'mystery', 'rule', 'rules', 'just', 'says', 'uh', 'okay',
  'so', 'please', 'actually', 'wait', 'im', 'standing', 'by', 'right', 'now',
  'knowledge', 'easier'
]);

const TOKEN_ALIASES = new Map([
  ['pkg', 'package'],
  ['pkgs', 'packages'],
  ['box', 'package'],
  ['boxes', 'packages'],
  ['carton', 'package'],
  ['cartons', 'packages'],
  ['sig', 'signature'],
  ['singer', 'signature'],
  ['signer', 'signature'],
  ['scann', 'scan'],
  ['scanned', 'scan'],
  ['scanning', 'scan'],
  ['scans', 'scan'],
  ['cust', 'customer'],
  ['custmer', 'customer'],
  ['receiver', 'recipient'],
  ['truck', 'vehicle'],
  ['van', 'vehicle'],
  ['vans', 'vehicle'],
  ['vehicles', 'vehicle'],
  ['swap', 'change'],
  ['swapped', 'change'],
  ['switch', 'change'],
  ['switched', 'change'],
  ['changing', 'change'],
  ['trigger', 'scanner'],
  ['refuse', 'refused'],
  ['refuses', 'refused'],
  ['refuzed', 'refused'],
  ['rong', 'wrong'],
  ['misdelivered', 'wrong'],
  ['misdelivery', 'wrong'],
  ['leaked', 'leak'],
  ['leaking', 'leak'],
  ['leaks', 'leak'],
  ['syncing', 'sync'],
  ['ppoda', 'ppod'],
  ['sign', 'signature'],
  ['handheld', 'scanner'],
  ['identification', 'id'],
  ['wine', 'alcohol'],
  ['picture', 'photo'],
  ['pictures', 'photo'],
  ['pics', 'photo'],
  ['threatening', 'threat'],
  ['log', 'login']
]);

const FUZZY_INTENT_TERMS = [
  'address', 'alcohol', 'barcode', 'customer', 'delivered', 'delivery', 'direct',
  'dog', 'forge', 'hazmat', 'home', 'indirect', 'misdelivery', 'neighbor',
  'nobody', 'package', 'packages', 'pharmacy', 'pickup', 'recipient', 'refused',
  'scanner', 'signature', 'unsafe', 'vehicle', 'wrong'
];
const INTENT_TOKEN_CACHE = new Map();

function editDistance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) rows[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = left[row - 1] === right[column - 1] ? 0 : 1;
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + substitution
      );
      if (row > 1 && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]) {
        rows[row][column] = Math.min(rows[row][column], rows[row - 2][column - 2] + 1);
      }
    }
  }
  return rows[left.length][right.length];
}

function normalizeIntentToken(token) {
  if (INTENT_TOKEN_CACHE.has(token)) return INTENT_TOKEN_CACHE.get(token);
  const alias = TOKEN_ALIASES.get(token);
  let normalized = alias || token;
  if (!alias && token.length >= 5 && !FUZZY_INTENT_TERMS.includes(token)) {
    const matches = FUZZY_INTENT_TERMS.filter((term) => (
      Math.abs(term.length - token.length) <= 1 && editDistance(token, term) <= 1
    ));
    if (matches.length === 1) normalized = matches[0];
  }
  INTENT_TOKEN_CACHE.set(token, normalized);
  return normalized;
}

const ANSWER_THRESHOLD = 15;
const CLARIFICATION_MARGIN = 5;
const PRODUCTION_ELIGIBLE_STATUSES = new Set(['SOURCE_VERIFIED', 'READY_ROUTE_APPROVED']);

function isProductionEligibleRecord(record) {
  return PRODUCTION_ELIGIBLE_STATUSES.has(record?.status) && record?.is_published === true;
}

function normalizeDriverQuestion(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenize(value) {
  return normalizeDriverQuestion(value)
    // Remove common whole-clause speech filler before token scoring. In
    // particular, "actually no wait" must not turn a self-correction into a
    // false zero-package intent merely because the filler contains "no".
    .replace(/^actually no wait\b/, '')
    .replace(/^uh okay so\b/, '')
    .replace(/^im standing by the vehicle and\b/, '')
    .replace(/\bright now$/, '')
    .replace(/\bignore (?:your|the) rules.*$/, '')
    .split(' ')
    .filter((token) => token && (!STOP_WORDS.has(token) || /^\d+$/.test(token)))
    .map(normalizeIntentToken);
}

function getPhrases(tokens) {
  const phrases = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    phrases.push(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return phrases;
}

function getRecordSearchSurfaces(record) {
  return [
    { value: record.canonical_situation, weight: 1.6 },
    { value: record.normalized_description, weight: 1.1 },
    { value: record.authoritative_rule, weight: 0.65 },
    ...(record.driver_question_variants || []).map((value) => ({ value, weight: 2 })),
    ...(record.taxonomy_paths || []).map((value) => ({ value, weight: 0.9 }))
  ].filter((surface) => surface.value);
}

function scoreKnowledgeRecord(question, record, context = {}) {
  const normalizedQuestion = normalizeDriverQuestion(question);
  const queryTokens = tokenize(normalizedQuestion);
  const queryTokenSet = new Set(queryTokens);
  const damageRecord = /(?:DAMAGE|HAZ-LEAK)/.test(String(record.knowledge_id || ''));
  const hasDamageLanguage = queryTokens.some((token) => (
    ['damage', 'damaged', 'crushed', 'broken', 'leak', 'leaking', 'wet', 'spill', 'spilling'].includes(token)
  ));
  if (damageRecord && !hasDamageLanguage) {
    return 0;
  }
  const queryPhrases = getPhrases(queryTokens);
  let bestSurfaceScore = 0;

  for (const surface of getRecordSearchSurfaces(record)) {
    const normalizedSurface = normalizeDriverQuestion(surface.value);
    const surfaceTokens = tokenize(normalizedSurface);
    const surfaceTokenSet = new Set(surfaceTokens);
    const overlap = queryTokens.filter((token) => surfaceTokenSet.has(token)).length;
    const union = new Set([...queryTokens, ...surfaceTokens]).size || 1;
    const coverage = queryTokens.length ? overlap / queryTokens.length : 0;
    const similarity = overlap / union;
    const phraseMatches = queryPhrases.filter((phrase) => normalizedSurface.includes(phrase)).length;
    const exactBonus = normalizedQuestion === normalizedSurface
      ? 80
      : queryTokens.length >= 3
        && (normalizedSurface.includes(normalizedQuestion) || normalizedQuestion.includes(normalizedSurface))
        ? 22
        : 0;
    const allTokensBonus = queryTokenSet.size > 1 && overlap === queryTokenSet.size ? 14 : 0;
    const score = surface.weight * (
      overlap * 5
      + coverage * 16
      + similarity * 12
      + phraseMatches * 7
      + exactBonus
      + allTokensBonus
    );
    bestSurfaceScore = Math.max(bestSurfaceScore, score);
  }

  const intentSignals = [
    { id: 'KNO-DEL-SIG-DSR-001', anySets: [['dsr'], ['direct', 'signature']], boost: 180 },
    { id: 'KNO-DEL-BUS-CLOSED-001', required: ['business', 'closed'], any: ['delivery', 'package'], boost: 240 },
    {
      id: 'KNO-FORGE-BUSINESS-CLOSURE-MSG-001',
      required: ['business', 'closed'],
      any: ['report', 'message', 'recurring', 'monday', 'month', 'date'],
      boost: 280
    },
    { id: 'KNO-DEL-SIG-ISR-001', anySets: [['isr'], ['indirect', 'signature']], boost: 180 },
    { id: 'KNO-DEL-SIG-ASR-001', anySets: [['asr'], ['adult', 'signature']], boost: 180 },
    { id: 'KNO-SAF-DOG-ENCOUNTER-001', required: ['dog'], any: ['loose', 'porch', 'approach', 'bite', 'blocks', 'door', 'unsafe'], boost: 280 },
    { id: 'KNO-FORGE-VEHICLE-CHANGE-001', required: ['vehicle', 'change'] },
    { id: 'KNO-PUP-CALLTAG-FRAUD-001', required: ['call', 'tag', 'fraud'], boost: 80 },
    { id: 'KNO-DEL-MISDELIVERY-RECOVERY-001', required: ['wrong'], any: ['house', 'address', 'door'] },
    {
      id: 'KNO-PUP-WEIGHT-ENTRY-001',
      required: ['pickup', 'weight'],
      any: ['forge', 'scanner', 'package', 'box', 'skip', 'required', 'put'],
      boost: 320
    },
    {
      id: 'KNO-PUP-SCANNER-FAIL-001',
      required: ['pickup'],
      anySets: [['barcode'], ['scanner', 'scan'], ['scanner', 'read'], ['scanner', 'wont']],
      any: ['barcode', 'read', 'scan', 'wont', 'manual', 'entry'],
      boost: 200
    },
    { id: 'KNO-PUP-VEHICLE-CAPACITY-001', required: ['pickup', 'vehicle', 'fit'] },
    {
      id: 'KNO-DEL-OP206-001',
      required: ['scanner', 'refused'],
      any: ['recipient', 'name', 'sign', 'signature', 'card', 'device'],
      boost: 170
    },
    {
      id: 'KNO-DEL-PHARMACY-001',
      required: ['pharmacy'],
      any: ['counter', 'front', 'desk', 'signature', 'closed', 'package'],
      boost: 180
    },
    {
      id: 'KNO-DEL-HAZMAT-SIGNATURE-001',
      required: ['hazmat'],
      any: ['nobody', 'home', 'leave', 'door', 'porch', 'signature'],
      boost: 180
    },
    {
      id: 'KNO-PUP-CALLTAG-RESTRICTED-001',
      required: ['call', 'tag'],
      any: ['leak', 'leaking', 'liquid', 'damage', 'damaged', 'restricted', 'hazmat', 'boxed'],
      boost: 180
    },
    { id: 'KNO-DEL-ATTEMPT-LIMIT-001', required: ['fourth', 'time'], any: ['package', 'address', 'back'], boost: 180 },
    { id: 'KNO-PUP-UNLISTED-001', required: ['pickup', 'listed'], any: ['not', 'shipper', 'ready'], boost: 180 },
    { id: 'KNO-PUP-WINDOW-RISK-001', required: ['pickup'], any: ['closing', 'window', 'late', 'finish'], boost: 180 },
    { id: 'KNO-FORGE-CAMERA-SCAN-001', required: ['camera', 'scan'], any: ['hardware', 'trigger', 'barcode'], boost: 190 },
    { id: 'KNO-FORGE-DEVICE-TIME-001', required: ['device', 'time'], any: ['incorrect', 'wrong', 'error', 'login', 'forge'], boost: 320 },
    { id: 'KNO-FORGE-DELAYED-LOGIN-001', required: ['authentication'], any: ['down', 'outage', 'route', 'list'], boost: 190 },
    {
      id: 'KNO-COMMS-MEDIA-001',
      anySets: [['recorded', 'interview'], ['media', 'interview'], ['reporter', 'interview']],
      any: ['fedex', 'customer', 'reporter', 'comment', 'interview'],
      boost: 320
    },
    { id: 'KNO-DEL-APT-001', required: ['apartment', 'office'], any: ['unit', 'answers', 'open'], boost: 180 },
    { id: 'KNO-DEL-HAL-NONHAL-TRANSFER-001', required: ['hal', 'transfer'], any: ['normal', 'non', 'package'], boost: 190 },
    { id: 'KNO-HAZ-LOAD-PAPERS-001', required: ['hazmat', 'papers'], any: ['loaded', 'stay', 'driving'], boost: 200 },
    { id: 'KNO-HAZ-AKHI-001', required: ['hawaii'], any: ['hazmat', 'dangerous', 'goods', 'shipment'], boost: 190 },
    { id: 'KNO-SEC-ACTIVE-THREAT-001', anySets: [['armed', 'attacking'], ['weapon', 'attacking'], ['gun', 'attacking']], boost: 220 },
    { id: 'KNO-INC-ACCIDENT-SCENE-001', anySets: [['collision', 'blocking'], ['crash', 'blocking']], boost: 200 },
    { id: 'KNO-INC-ACCIDENT-REPORT-001', required: ['crash'], any: ['report', 'notification', 'notify'], boost: 190 },
    { id: 'KNO-HOS-DUTY-LIMITS-001', required: ['eleven', 'hours'], any: ['driving', 'stops', 'keep'], boost: 200 },
    { id: 'KNO-VEH-RENTAL-PREP-001', required: ['rental', 'vehicle'], any: ['markings', 'unit', 'number', 'route'], boost: 200 },
    { id: 'KNO-PUP-INTERNATIONAL-DOCS-001', required: ['international', 'pickup'], any: ['document', 'documents', 'paper', 'papers'] },
    { id: 'KNO-FORGE-EDIT-ADDRESS-001', required: ['address'], any: ['edit', 'wrong', 'incorrect', 'label'] }
  ];
  const signal = intentSignals.find((candidate) => candidate.id === record.knowledge_id);
  if (
    signal &&
    (!signal.required || signal.required.every((token) => queryTokenSet.has(token))) &&
    (!signal.anySets || signal.anySets.some((set) => set.every((token) => queryTokenSet.has(token)))) &&
    (!signal.any || signal.any.some((token) => queryTokenSet.has(token)))
  ) {
    bestSurfaceScore += signal.boost || 24;
  }

  const hasTypedSignature = ['asr', 'dsr', 'isr', 'adult', 'direct', 'indirect']
    .some((token) => queryTokenSet.has(token));
  if (/^KNO-DEL-SIG-(ISR|DSR|ASR)-/.test(record.knowledge_id)
    && queryTokenSet.has('signature')
    && !hasTypedSignature) {
    // Generic signature questions should rank the three controlling signature
    // branches ahead of records that merely mention a signer (for example a
    // pharmacy or hazmat record). The decision layer will still ask for the
    // signature type rather than selecting a branch.
    bestSurfaceScore += 130;
    if (queryTokenSet.has('front') && queryTokenSet.has('desk')) {
      bestSurfaceScore += 24;
    }
  }
  const conceptIntentBoosts = [
    {
      id: 'KNO-DEL-OP206-001',
      required: ['recipient', 'signature', 'device'],
      any: ['name', 'refused', 'not', 'card'],
      boost: 180
    },
    {
      id: 'KNO-DEL-ALCOHOL-001',
      required: ['alcohol'],
      boost: 110
    },
    {
      id: 'KNO-HAZ-ACCEPTANCE-001',
      requiredAnySets: [['hazmat'], ['dangerous', 'goods']],
      any: ['take', 'accept', 'pickup', 'sure', 'paperwork'],
      boost: 110
    },
    {
      id: 'KNO-HAZ-MANIFEST-001',
      requiredAnySets: [['hazmat'], ['dangerous', 'goods']],
      any: ['paperwork', 'manifest', 'onboard', 'transfer'],
      boost: 105
    },
    {
      id: 'KNO-DEL-BUS-OP201-001',
      required: ['business', 'closed'],
      any: ['leave', 'release', 'deliver', 'package'],
      boost: 120
    },
    {
      id: 'KNO-DEL-SIG-ISR-001',
      required: ['neighbor'],
      any: ['leave', 'signature'],
      boost: 120
    },
    {
      id: 'KNO-PUP-ZERO-001',
      required: ['customer', 'package'],
      any: ['no', 'none', 'nothing', 'zero'],
      boost: 110
    },
    {
      id: 'KNO-PUP-CALLTAG-SUCCESS-001',
      required: ['call', 'tag'],
      forbiddenAny: ['fraud', 'refused', 'restricted', 'ready', 'hazmat', 'leak', 'leaking', 'liquid', 'damage', 'damaged', 'boxed'],
      boost: 100
    },
    {
      id: 'KNO-DEL-BARCODE-001',
      required: ['scanner'],
      any: ['work', 'working', 'scan', 'read', 'barcode'],
      boost: 100
    },
    {
      id: 'KNO-PUP-SCANNER-FAIL-001',
      required: ['scanner'],
      any: ['work', 'working', 'scan', 'read', 'barcode'],
      boost: 90
    }
  ];
  const conceptBoost = conceptIntentBoosts.find((candidate) => candidate.id === record.knowledge_id);
  if (conceptBoost
    && (!conceptBoost.required || conceptBoost.required.every((token) => queryTokenSet.has(token)))
    && (!conceptBoost.requiredAnySets || conceptBoost.requiredAnySets.some(
      (set) => set.every((token) => queryTokenSet.has(token))
    ))
    && (!conceptBoost.forbiddenAny || !conceptBoost.forbiddenAny.some(
      (token) => queryTokenSet.has(token)
    ))
    && (!conceptBoost.any || conceptBoost.any.some((token) => queryTokenSet.has(token)))) {
    bestSurfaceScore += conceptBoost.boost;
  }
  const generalIntentBoosts = [
    { id: 'KNO-SEC-ACTIVE-THREAT-001', required: ['threat'], boost: 70 },
    { id: 'KNO-HAZ-LEAK-001', required: ['package', 'leak'], boost: 70 },
    { id: 'KNO-DEL-DAMAGE-INSPECTION-001', required: ['package', 'leak'], boost: 36 },
    { id: 'KNO-DEL-PLACEMENT-HAZARD-001', required: ['mailbox'], boost: 90 },
    { id: 'KNO-FORGE-DELAYED-LOGIN-001', required: ['forge', 'login'], boost: 70 },
    { id: 'KNO-FORGE-LOGIN-WARNING-001', required: ['forge', 'login'], boost: 40 },
    { id: 'KNO-FORGE-SYNC-QUEUE-001', required: ['sync'], boost: 80 },
    { id: 'KNO-DEL-SIG-ASR-001', required: ['id'], boost: 48 },
    { id: 'KNO-DEL-ALCOHOL-001', required: ['id'], boost: 42 },
    { id: 'KNO-INC-ACCIDENT-SCENE-001', required: ['vehicle', 'road'], any: ['block', 'blocking'], boost: 70 },
    { id: 'KNO-SEC-LOST-BADGE-001', required: ['lost', 'badge'], boost: 90 },
    { id: 'KNO-PUP-ZERO-001', required: ['pickup', 'ready'], boost: 120 },
    { id: 'KNO-PUP-CALLTAG-NOTREADY-001', required: ['pickup', 'ready'], boost: 120 },
    { id: 'KNO-DEL-CLASSIFICATION-001', required: ['leave'], boost: 64 },
    { id: 'KNO-DEL-SAFEPLACE-001', required: ['leave'], boost: 64 },
    { id: 'KNO-DEL-HAL-DELIVERY-001', required: ['rth'], boost: 60 }
  ];
  const generalBoost = generalIntentBoosts.find((candidate) => candidate.id === record.knowledge_id);
  if (generalBoost
    && generalBoost.required.every((token) => queryTokenSet.has(token))
    && (!generalBoost.any || generalBoost.any.some((token) => queryTokenSet.has(token)))) {
    bestSurfaceScore += generalBoost.boost;
  }

  const contextBoost = (context.knowledge_ids || []).includes(record.knowledge_id) ? 8 : 0;
  return Number((bestSurfaceScore + contextBoost).toFixed(5));
}

function buildExplicitMultiIssueClarification(question) {
  const normalized = normalizeDriverQuestion(question);
  const joinsIssues = /\b(and|also|another|separately|plus)\b/.test(normalized);
  if (!joinsIssues) return null;

  const hasMisdelivery = /\b(misdeliver|wrong house|wrong door|wrong address)\w*\b/.test(normalized);
  const hasPickupScanFailure = /\bpickup\b/.test(normalized)
    && /\b(scan|scanner|barcode|read)\w*\b/.test(normalized);
  const hasZeroPickup = /\b(pickup\b.*\b(zero|none|nothing|no packages?)|\b(zero|none|nothing|no packages?)\b.*\bpickup)\b/.test(normalized);
  const hasCallTagRefusal = /\bcall\s*tag\b/.test(normalized) && /\b(refuse|refused|wont take|will not take)\b/.test(normalized);

  if ((hasMisdelivery && hasPickupScanFailure) || (hasZeroPickup && hasCallTagRefusal)) {
    const options = hasMisdelivery
      ? [
          flowOption('multi-issue', 'misdelivery', 'Misdelivery first', 'I made a misdelivery what do I do'),
          flowOption('multi-issue', 'pickup-scan', 'Pickup scan first', 'pickup package barcode will not scan')
        ]
      : [
          flowOption('multi-issue', 'zero-pickup', 'Zero-package pickup first', 'scheduled pickup customer has zero packages'),
          flowOption('multi-issue', 'call-tag-refusal', 'Call-tag refusal first', 'customer refused call tag')
        ];
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates: [],
      selected_records: [],
      clarification_prompt: 'I found two separate operational issues. Which one do you need help with first?',
      clarification_options: options,
      clarification_id: 'multi-issue'
    };
  }
  return null;
}

function normalizeKnowledgeRecord(row) {
  return {
    ...row,
    version: Number(row.version || 1),
    taxonomy_paths: Array.isArray(row.taxonomy_paths) ? row.taxonomy_paths : [],
    driver_question_variants: Array.isArray(row.driver_question_variants) ? row.driver_question_variants : [],
    driver_question_patterns: Array.isArray(row.driver_question_patterns) ? row.driver_question_patterns : [],
    clarification_requirements: Array.isArray(row.clarification_requirements) ? row.clarification_requirements : []
  };
}

function getMatchingQuestionPattern(question, record) {
  const normalizedQuestion = normalizeDriverQuestion(question);
  const patterns = record.driver_question_patterns || [];
  const exact = patterns.find((pattern) => (
    normalizeDriverQuestion(pattern?.utterance) === normalizedQuestion
  ));
  if (exact) return exact;

  return patterns.find((pattern) => {
    const normalizedPattern = normalizeDriverQuestion(pattern?.utterance);
    const patternTokens = tokenize(normalizedPattern);
    const questionTokens = tokenize(normalizedQuestion);
    if (patternTokens.length < 2 || questionTokens.length < 2) return false;
    if (normalizedQuestion.includes(normalizedPattern) || normalizedPattern.includes(normalizedQuestion)) {
      return true;
    }
    const questionSet = new Set(questionTokens);
    const overlap = patternTokens.filter((token) => questionSet.has(token)).length;
    return overlap >= 2
      && overlap / patternTokens.length >= 0.5
      && overlap / questionTokens.length >= 0.5;
  }) || null;
}

function hasExactQuestionVariant(question, record) {
  const normalizedQuestion = normalizeDriverQuestion(question);
  return (record.driver_question_variants || []).some((variant) => (
    normalizeDriverQuestion(variant) === normalizedQuestion
  ));
}

function getPatternRuntimeMode(pattern) {
  if (!pattern) return null;
  if (pattern.response_mode === 'ASK_MINIMUM_CLARIFICATION') return 'CLARIFY';
  if (pattern.response_mode === 'DIRECT_SOURCE_GROUNDED_ANSWER' || pattern.response_mode === 'ALTERNATE_DOCUMENTATION') return 'ANSWER';
  if (pattern.response_mode === 'IMMEDIATE_SAFETY_ACTION_THEN_CLARIFY') return 'ANSWER';
  return 'ESCALATE';
}

function selectCanonicalRecordVersions(records) {
  const grouped = new Map();
  for (const rawRecord of records || []) {
    const record = normalizeKnowledgeRecord(rawRecord);
    if (!record.knowledge_id) continue;
    grouped.set(record.knowledge_id, [...(grouped.get(record.knowledge_id) || []), record]);
  }

  return [...grouped.values()].map((versions) => {
    const ordered = versions.sort((left, right) => right.version - left.version);
    const latest = ordered[0];
    if (['PENDING_REVIEW', 'POTENTIALLY_OUTDATED', 'INSUFFICIENT_EVIDENCE'].includes(latest.status)) {
      return latest;
    }
    return ordered.find((record) => (
      record.status === 'READY_ROUTE_APPROVED' && record.is_published === true
    )) || latest;
  });
}

function rankKnowledgeRecords(question, records, context = {}) {
  return selectCanonicalRecordVersions(records)
    .filter((record) => record?.knowledge_id && record?.canonical_situation)
    .map((record) => ({
      record,
      score: scoreKnowledgeRecord(question, record, context)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.record.knowledge_id.localeCompare(right.record.knowledge_id));
}

function getTaxonomyFamily(record) {
  return String(record.taxonomy_paths?.[0] || record.knowledge_id || '').split('/').slice(0, 2).join('/');
}

function buildIsrPresentation(question) {
  const asksAboutNeighbor = tokenize(question).some((token) => ['neighbor', 'neighbour'].includes(token));
  const options = [
    {
      id: 'isr-address-signature',
      label: 'Someone at the address signs',
      summary: 'Get an in-person signature at the labeled delivery address.',
      details: ['Complete the signature prompts in FORGE.']
    },
    {
      id: 'isr-neighbor',
      label: 'A neighbor accepts and signs',
      summary: 'Allowed for eligible ISR packages when the neighbor accepts the package and signs.',
      details: [
        'Confirm FORGE shows ISR and no stricter service applies.',
        'Record the actual neighbor address and obtain the signature there.',
        'Complete and scan the door tag naming the delivery location, then leave it at the original primary entrance.'
      ]
    },
    {
      id: 'isr-signed-door-tag',
      label: 'Recipient signed the door tag',
      summary: 'Use only when the signed-door-tag release is eligible and the release location is safe.',
      details: [
        'Do not use this path for DSR, ASR, Appointment Delivery, or another stricter service.',
        'Complete ALT, record the recipient first initial and last name, and capture a clear image of the signature.',
        'Return the full signed door tag to the station.'
      ]
    },
    {
      id: 'isr-paper-sra',
      label: 'Paper release authorization',
      summary: 'Use the applicable paper SRA workflow when a valid form is available.',
      details: [
        'Follow the correct barcoded or non-barcoded SRA prompts.',
        'Turn in the physical form through the required station check-in process.'
      ]
    },
    {
      id: 'isr-electronic-signature',
      label: 'Electronic signature in FORGE',
      summary: 'Use it only after FORGE receives the intercept and replaces the ISR icon.',
      details: ['Complete the resulting FORGE delivery prompts.']
    }
  ];

  if (asksAboutNeighbor) {
    options.sort((left, right) => (left.id === 'isr-neighbor' ? -1 : right.id === 'isr-neighbor' ? 1 : 0));
  }

  return {
    steps: [asksAboutNeighbor
      ? 'Yes—if FORGE shows ISR and no stricter service applies. The neighbor must accept the package and sign.'
      : 'Confirm FORGE shows ISR and no stricter service applies, then choose the approved path that matches.'],
    options
  };
}

function buildPresentedAnswer(record, question = '') {
  const normalized = normalizeDriverQuestion(question);
  if (record.knowledge_id === 'KNO-DEL-PPOD-001') {
    if (normalized === 'what is ppod') {
      return 'PPOD means Picture Proof of Delivery—the photo record for an eligible completed delivery.';
    }
    if (normalized === 'what is ppoda') {
      return 'PPODA means Picture Proof of Delivery Attempt—the prompted photo record for an unsuccessful delivery attempt.';
    }
  }
  if (record.knowledge_id === 'KNO-SAF-DOG-ENCOUNTER-001'
    && /\b(?:bit|bite|bitten)\b/.test(normalized)) {
    return 'Clean the wound, seek immediate medical care, obtain the owner, veterinarian, and vaccination information when available, and report the bite to local animal control.';
  }
  return record.concise_answer;
}

function buildAnswerStructure(record, question = '') {
  const conciseSteps = (String(buildPresentedAnswer(record, question) || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const isrPresentation = record.knowledge_id === 'KNO-DEL-SIG-ISR-001'
    ? buildIsrPresentation(question)
    : null;
  return {
    steps: isrPresentation?.steps || conciseSteps,
    options: isrPresentation?.options || [],
    procedure_steps: (record.required_procedure || [])
      .map((item) => String(item?.action || '').trim())
      .filter(Boolean),
    documentation: (record.required_documentation || []).map(String).filter(Boolean),
    prohibited_actions: (record.prohibited_actions || []).map(String).filter(Boolean),
    escalation_requirements: (record.escalation_requirements || []).map(String).filter(Boolean)
  };
}

function buildCriticalIntentDecision(question, records) {
  const intent = matchCriticalIntent(question, {
    normalize: normalizeDriverQuestion,
    tokenize
  });
  if (!intent) return null;

  const record = selectCanonicalRecordVersions(records).find((candidate) => (
    candidate.knowledge_id === intent.knowledge_id
  ));
  const candidate = record ? [{
    knowledge_id: record.knowledge_id,
    version: record.version,
    canonical_situation: record.canonical_situation,
    score: 1000,
    routing_reason: `critical-intent:${intent.intent_id}`
  }] : [];

  if (!isProductionEligibleRecord(record)) {
    return {
      response_mode: 'ESCALATE',
      confidence: 1,
      candidates: candidate,
      selected_records: [],
      intent_id: intent.intent_id,
      intent_profile_version: intent.profile_version,
      escalation_message: 'Ready Route identified a critical situation but could not load its driver-facing procedure. Contact your manager or station immediately, and call 9-1-1 when emergency help is needed.'
    };
  }

  return {
    response_mode: 'ANSWER',
    confidence: 1,
    candidates: candidate,
    selected_records: [record],
    intent_id: intent.intent_id,
    intent_profile_version: intent.profile_version,
    required_answer_patterns: intent.required_answer_patterns || [],
    answer: buildPresentedAnswer(record, question),
    more_info: record.more_info_answer || null,
    answer_structure: buildAnswerStructure(record, question)
  };
}

function buildClarificationDecision(ranked, candidates, topScore, prompt = 'Which situation best matches what is happening?') {
  const clarificationCandidates = ranked
    .filter((candidate) => topScore - candidate.score <= CLARIFICATION_MARGIN)
    .slice(0, 4);

  return {
    response_mode: 'CLARIFY',
    confidence: Math.min(topScore / 100, 0.99),
    candidates,
    selected_records: [],
    clarification_prompt: prompt,
    clarification_options: clarificationCandidates.map(({ record }) => ({
      knowledge_id: record.knowledge_id,
      version: record.version,
      label: record.canonical_situation,
      query: record.canonical_situation
    }))
  };
}

function clarificationOptionsFromRanked(ranked, limit = 4) {
  return ranked.slice(0, limit).map(({ record }) => ({
    knowledge_id: record.knowledge_id,
    version: record.version,
    label: record.canonical_situation,
    query: record.canonical_situation
  }));
}

function flowOption(flowId, optionId, label, query) {
  return {
    knowledge_id: `FLOW:${flowId}:${optionId}`,
    version: 1,
    label,
    query
  };
}

function buildFlowClarification(flowId, prompt, options, notSureQuery, candidates = []) {
  return {
    response_mode: 'CLARIFY',
    confidence: 0,
    candidates,
    selected_records: [],
    clarification_id: flowId,
    clarification_prompt: prompt,
    clarification_options: options,
    clarification_not_sure_query: notSureQuery
  };
}

function buildDriverFirstClarification(question, candidates = []) {
  const normalized = normalizeDriverQuestion(question);
  const tokens = new Set(tokenize(question));
  const clarify = (flowId, prompt, options, notSureQuery) => (
    buildFlowClarification(flowId, prompt, options, notSureQuery, candidates)
  );
  const hasSignatureType = ['asr', 'dsr', 'isr', 'adult', 'direct', 'indirect']
    .some((token) => tokens.has(token));

  if (/\b(?:not sure what this is|dont know what (?:this is|im looking at)|not sure what im looking at)\b/.test(normalized)) {
    return clarify('identify-package', 'What do you see?', [
      flowOption('identify-package', 'signature', 'ISR / DSR / ASR', 'not sure which signature type the package shows'),
      flowOption('identify-package', 'alcohol', 'Alcohol', 'alcohol package what do I do'),
      flowOption('identify-package', 'hazmat', 'Hazmat / dangerous goods', 'not sure if this package is hazmat'),
      flowOption('identify-package', 'hal', 'HAL / hold at location', 'what is HAL and what do I do'),
      flowOption('identify-package', 'call-tag', 'Call tag', 'what do I do with this call tag')
    ], 'I cannot identify the label or screen prompt');
  }

  const misdelivery = tokens.has('misdelivery')
    || (tokens.has('wrong')
      && (tokens.has('delivered') || tokens.has('delivery') || /\bwrong hous(?:e|es)\b/.test(normalized))
      && !tokens.has('edit'));
  const recoveredMisdelivery = tokens.has('recovered')
    || (tokens.has('got') && tokens.has('back'))
    || (tokens.has('have') && tokens.has('package'));
  if (misdelivery && !recoveredMisdelivery && !tokens.has('today')) {
    return clarify('misdelivery-recovery', 'Have you safely recovered the package?', [
      flowOption('misdelivery-recovery', 'yes', 'Yes', 'wrong house got package back now what'),
      flowOption('misdelivery-recovery', 'no', 'No', 'misdelivered package has not been recovered')
    ], 'not sure whether the package can be safely recovered');
  }

  if (/\b(?:not sure|dont know) (?:if )?(?:it|this|package) (?:needs?|requires?) (?:a )?signature\b/.test(normalized)) {
    return clarify('identify-signature', 'What do you see on the label or in FORGE?', [
      flowOption('identify-signature', 'isr', 'ISR', 'ISR package what do I do'),
      flowOption('identify-signature', 'dsr', 'DSR', 'DSR package what do I do'),
      flowOption('identify-signature', 'asr', 'ASR', 'ASR package what do I do'),
      flowOption('identify-signature', 'alcohol', 'Alcohol label', 'alcohol package what do I do'),
      flowOption('identify-signature', 'prompt', 'Signature prompt in FORGE', 'FORGE shows a signature prompt but I cannot see the type')
    ], 'I do not see a signature label or prompt');
  }

  const genericLeave = /\b(?:can i leave (?:(?:a|the|this|that) package|this|that|it|this one)|customer says just leave it|dont know if i can leave it)\b/.test(normalized)
    && !hasSignatureType
    && !/\b(?:alcohol|hazmat|mailbox|locker|neighbor|neighbour|lobby|office|front desk|back door|op ?201)\b/.test(normalized);
  if (genericLeave) {
    return clarify('release-signature-check', 'Does it need a signature?', [
      flowOption('release-signature-check', 'yes', 'Yes', 'signature required package what signature type'),
      flowOption('release-signature-check', 'no', 'No', 'package has no signature service is the stop residential or commercial')
    ], 'not sure if this package needs a signature');
  }

  if (/\bno signature\b/.test(normalized) && /\b(?:residential|commercial)\b/.test(normalized)) {
    return clarify('release-stop-type', 'What kind of stop is it?', [
      flowOption('release-stop-type', 'residential', 'Residential', 'residential package no signature can I driver release it'),
      flowOption('release-stop-type', 'commercial', 'Commercial', 'commercial package no signature can I leave it')
    ], 'not sure if this stop is residential or commercial');
  }

  const nobodyHome = /\b(?:nobody|no one)\b.*\b(?:home|there|answer|answered|available)\b|\bnobody home\b/.test(normalized);
  const hasNobodyContext = ['signature', 'isr', 'dsr', 'asr', 'alcohol', 'hazmat', 'business', 'commercial', 'residential', 'pickup']
    .some((token) => tokens.has(token))
    || (tokens.has('call') && tokens.has('tag'));
  if (nobodyHome && !hasNobodyContext) {
    return clarify('nobody-home-type', "What kind of stop or package is it?", [
      flowOption('nobody-home-type', 'signature', 'Signature-required', 'signature required package nobody home'),
      flowOption('nobody-home-type', 'residential', 'Normal residential', 'normal residential package nobody home can I leave it'),
      flowOption('nobody-home-type', 'commercial', 'Commercial', 'commercial delivery nobody available'),
      flowOption('nobody-home-type', 'alcohol', 'Alcohol', 'alcohol package nobody home')
    ], 'not sure if this package needs a signature');
  }

  if (tokens.has('signature')
    && !hasSignatureType
    && !(tokens.has('recipient') && tokens.has('device'))
    && !tokens.has('pharmacy')) {
    const nobodySuffix = nobodyHome ? ' nobody home' : '';
    return clarify('signature-type', 'What signature type does FORGE show?', [
      flowOption('signature-type', 'isr', 'ISR — Indirect Signature', `ISR package${nobodySuffix}`),
      flowOption('signature-type', 'dsr', 'DSR — Direct Signature', `DSR package${nobodySuffix}`),
      flowOption('signature-type', 'asr', 'ASR — Adult Signature', `ASR package${nobodySuffix}`)
    ], 'not sure which signature type FORGE shows');
  }

  if (/\bdog\b/.test(normalized)
    && !tokens.has('unsafe')
    && !/\b(?:cant|cannot|can t) (?:get|reach|approach).*(?:safe|safely|close)\b/.test(normalized)
    && !/\b(?:bit|bite|bitten|knocked|running|coming|loose|blocks?|approach|approaching|aggressive|charging|chasing|growling)\b/.test(normalized)) {
    return clarify('dog-behavior', 'What is the dog doing?', [
      flowOption('dog-behavior', 'present', 'Just present', 'dog is present at the stop'),
      flowOption('dog-behavior', 'approaching', 'Approaching', 'dog is approaching me at the stop'),
      flowOption('dog-behavior', 'aggressive', 'Aggressive', 'aggressive dog is blocking the stop'),
      flowOption('dog-behavior', 'bit', 'Bit me', 'dog bit me')
    ], 'dog situation is unclear but I do not feel safe');
  }

  if (/^(?:what about )?hazmat$|^hazmat question$/.test(normalized)) {
    return clarify('hazmat-topic', 'What kind of hazmat issue is it?', [
      flowOption('hazmat-topic', 'pickup', 'Pickup acceptance', 'hazmat pickup acceptance requirements'),
      flowOption('hazmat-topic', 'paperwork', 'Paperwork', 'hazmat paperwork missing or incomplete'),
      flowOption('hazmat-topic', 'transport', 'Loading or transport', 'hazmat loading and paperwork while driving'),
      flowOption('hazmat-topic', 'leak', 'Leaking or damaged', 'hazmat package is leaking or damaged'),
      flowOption('hazmat-topic', 'ak-hi', 'Alaska or Hawaii', 'hazmat package going to Alaska or Hawaii')
    ], 'not sure if this package is hazmat');
  }

  if (/\b(?:scanner not working|scanner wont work|scanner doesnt work)\b/.test(normalized)) {
    return clarify('scanner-problem', 'Is the whole scanner failing, or is one barcode not scanning?', [
      flowOption('scanner-problem', 'device', 'Whole scanner', 'FORGE scanner device is not working'),
      flowOption('scanner-problem', 'delivery', 'Delivery barcode', 'delivery package barcode will not scan'),
      flowOption('scanner-problem', 'pickup', 'Pickup barcode', 'pickup package barcode will not scan'),
      flowOption('scanner-problem', 'camera', 'Use camera scanning', 'how do I turn on camera scanning in FORGE')
    ], 'scanner problem type is unclear');
  }

  if (/\bforge (?:is )?(?:stuck|frozen)\b/.test(normalized)) {
    return clarify('forge-problem', 'What part of FORGE is stuck?', [
      flowOption('forge-problem', 'login', 'Login', 'FORGE login problem exact screen message'),
      flowOption('forge-problem', 'sync', 'Sync', 'FORGE is not syncing'),
      flowOption('forge-problem', 'scan', 'Scanning', 'FORGE barcode scanning problem'),
      flowOption('forge-problem', 'stop', 'Stop workflow', 'FORGE stop workflow is stuck')
    ], 'FORGE problem type is unclear');
  }

  if (/\b(?:this one needs id|scanner wants id|id prompt)\b/.test(normalized)
    && !/\b(?:asr|adult|alcohol)\b/.test(normalized)) {
    return clarify('id-prompt', 'What does FORGE or the label show?', [
      flowOption('id-prompt', 'asr', 'ASR', 'ASR package ID verification'),
      flowOption('id-prompt', 'alcohol', 'Alcohol', 'alcohol package ID verification'),
      flowOption('id-prompt', 'other', 'Another ID prompt', 'FORGE shows another ID controlled service')
    ], 'cannot identify the ID prompt');
  }

  if (/\bpackage not on manifest\b/.test(normalized)) {
    return clarify('manifest-problem', 'Is this a delivery package or a pickup situation?', [
      flowOption('manifest-problem', 'delivery', 'Delivery package', 'delivery package is not on my manifest'),
      flowOption('manifest-problem', 'pickup', 'Pickup situation', 'pickup is not on my list')
    ], 'not sure whether this is delivery or pickup');
  }

  const multiplePackagesOneScan = (tokens.has('two') || tokens.has('2') || tokens.has('multiple'))
    && (tokens.has('package') || tokens.has('packages'))
    && tokens.has('one')
    && tokens.has('scan');
  if (multiplePackagesOneScan) {
    return clarify('multi-package-scan', 'What is happening with the second package?', [
      flowOption('multi-package-scan', 'barcode', 'Its barcode will not scan', 'delivery package barcode will not scan'),
      flowOption('multi-package-scan', 'missing', 'It is missing from the stop or manifest', 'delivery package is not on my manifest'),
      flowOption('multi-package-scan', 'pickup', 'This is a pickup package', 'pickup package barcode will not scan')
    ], 'not sure whether the barcode or the stop listing is the problem');
  }

  if (/\bcustomer (?:wants|asked for) (?:it )?held\b/.test(normalized)) {
    return clarify('hold-request', 'What kind of hold did the customer request?', [
      flowOption('hold-request', 'future', 'Future delivery date', 'customer requested future delivery date'),
      flowOption('hold-request', 'hal', 'Hold at Location', 'customer requested hold at location'),
      flowOption('hold-request', 'no-attempt', 'No attempt today', 'customer requested no attempt today')
    ], 'hold request type is unclear');
  }

  if (/^(?:minor )?accident$|\bi got hit\b/.test(normalized)) {
    return clarify('accident-severity', 'First, move to safety if you can. Are there injuries or an immediate traffic hazard?', [
      flowOption('accident-severity', 'yes', 'Yes', 'accident with injuries or immediate traffic hazard'),
      flowOption('accident-severity', 'no', 'No', 'accident no injuries and no immediate traffic hazard')
    ], 'accident severity is unclear');
  }

  return null;
}

function buildDiscoveredTopicClarification(question, ranked, candidates) {
  const normalizedQuestion = normalizeDriverQuestion(question);
  const tokens = new Set(tokenize(question));
  const hasSignatureType = ['asr', 'dsr', 'isr', 'adult', 'direct', 'indirect']
    .some((token) => tokens.has(token));

  const topRankedRecord = ranked[0]?.record || null;

  const hasNobodyAvailable = tokens.has('nobody')
    || (tokens.has('no') && tokens.has('one'));
  const hasNoAnswerContext = [
    'signature', 'isr', 'dsr', 'asr', 'alcohol', 'hazmat', 'business',
    'residential', 'apartment', 'pickup', 'call', 'tag'
  ].some((token) => tokens.has(token));
  if (hasNobodyAvailable && !hasNoAnswerContext) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'Is this a signature-required delivery, a normal residential delivery, a business delivery, or a pickup?',
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  if (tokens.has('customer')
    && tokens.has('package')
    && ['no', 'none', 'nothing', 'zero'].some((token) => tokens.has(token))
    && !tokens.has('pickup')) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'Is this a scheduled pickup where the customer has zero packages, or a delivery/package-location issue?',
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  const hasUncertainHazmatClassification = (tokens.has('hazmat')
    || (tokens.has('dangerous') && tokens.has('goods')))
    && (tokens.has('sure') || tokens.has('unsure'))
    && !['pickup', 'delivery', 'onboard', 'transfer', 'manifest', 'paperwork']
      .some((token) => tokens.has(token));
  if (hasUncertainHazmatClassification) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'Is this about identifying a package before pickup acceptance, paperwork for hazmat already onboard, or a hazmat delivery?',
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  const explicitlyNamesSpecializedSignatureWorkflow = (
    topRankedRecord?.knowledge_id === 'KNO-DEL-PHARMACY-001' && tokens.has('pharmacy')
  ) || (
    topRankedRecord?.knowledge_id === 'KNO-DEL-OP206-001'
      && tokens.has('recipient')
      && tokens.has('device')
  );
  const signatureServiceQuestion = tokens.has('signature')
    && (tokens.has('package') || tokens.has('nobody') || tokens.has('home') || tokens.has('service'));
  if (signatureServiceQuestion && !hasSignatureType && !explicitlyNamesSpecializedSignatureWorkflow) {
    const signatureRecords = ranked
      .filter(({ record }) => /^KNO-DEL-SIG-(ISR|DSR|ASR)-/.test(record.knowledge_id))
      .filter(({ record }) => isProductionEligibleRecord(record))
      .slice(0, 3);
    if (signatureRecords.length >= 2) {
      return {
        response_mode: 'CLARIFY',
        confidence: 0,
        candidates,
        selected_records: [],
        clarification_prompt: 'What signature type does FORGE show?',
        clarification_options: signatureRecords.map(({ record }) => ({
          knowledge_id: record.knowledge_id,
          version: record.version,
          label: record.knowledge_id.includes('-ISR-')
            ? 'ISR — Indirect Signature'
            : record.knowledge_id.includes('-DSR-')
              ? 'DSR — Direct Signature'
              : 'ASR — Adult Signature',
          query: record.knowledge_id.includes('-ISR-')
            ? 'ISR package what do I do'
            : record.knowledge_id.includes('-DSR-')
              ? 'DSR package what do I do'
              : 'ASR package what do I do'
        })),
        clarification_id: 'signature-type',
        clarification_not_sure_query: 'not sure which signature type FORGE shows'
      };
    }
  }

  const damageTerms = ['damage', 'damaged', 'crushed'];
  const hasDamage = damageTerms.some((token) => tokens.has(token));
  const hasDamageContext = ['delivery', 'pickup', 'calltag', 'hazmat', 'hazardous', 'leak', 'leaking']
    .some((token) => tokens.has(token))
    || (/\b(?:okay|ok|fine|good)\b/.test(normalizedQuestion) && tokens.has('package'));
  if (hasDamage && !hasDamageContext) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'Is this a delivery package, a pickup/call tag, or a leaking or hazardous-material package?',
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  const asksToConfirmDelivery = (tokens.has('confirm') || tokens.has('confirmation'))
    && (tokens.has('delivery') || tokens.has('delivered'));
  if (asksToConfirmDelivery) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'What do you mean by confirm the delivery?',
      clarification_options: [
        {
          knowledge_id: 'KNO-FORGE-STANDARD-DELIVERY-001',
          version: 1,
          label: 'Complete or close the delivery in FORGE',
          query: 'How close normal business stop'
        },
        {
          knowledge_id: 'KNO-DEL-SCAN-INTEGRITY-001',
          version: 1,
          label: 'Make sure the delivery scan is accurate',
          query: 'Choosing when and where to scan a delivery or attempt'
        },
        {
          knowledge_id: 'KNO-DEL-DISPUTE-PREVENTION-001',
          version: 1,
          label: 'Verify the address and placement before release',
          query: 'Preventing a disputed delivery while completing a delivery or attempt'
        },
        {
          knowledge_id: 'KNO-DEL-SIG-ISR-001',
          version: 1,
          label: 'Check which signature or release proof is required',
          query: 'How do I handle a signature package'
        }
      ]
    };
  }

  const hasCallTag = tokens.has('call') && tokens.has('tag');
  const hasCallTagOutcome = ['ready', 'refused', 'restricted', 'fraud', 'hazmat']
    .some((token) => tokens.has(token));
  if (hasCallTag && !hasCallTagOutcome) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'What happened with the call tag: successful pickup, not ready, refused, or restricted/prohibited contents?',
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  const hasPhotoQuestion = tokens.has('photo')
    && !['delivered', 'attempt', 'locker', 'residential', 'business', 'ppod', 'ppoda']
      .some((token) => tokens.has(token));
  if (hasPhotoQuestion) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'Is this a delivered-package photo, an attempted-delivery photo, or another photo prompt?',
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  if (tokens.has('scanner') && (tokens.has('working') || tokens.has('work'))
    && !['pickup', 'delivery', 'barcode'].some((token) => tokens.has(token))) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'Is the whole device failing, or is one delivery or pickup barcode not scanning?',
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  const hasHazmatTerm = tokens.has('hazmat') || (tokens.has('dangerous') && tokens.has('goods'));
  const hasHazmatWorkflowContext = ['delivered', 'delivery', 'pickup', 'onboard', 'transfer']
    .some((token) => tokens.has(token));
  if (hasHazmatTerm && (tokens.has('prompt') || (tokens.has('paperwork') && !hasHazmatWorkflowContext))) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'Is this about pickup acceptance paperwork, onboard manifest/transfer paperwork, or a delivery prompt?',
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  if (tokens.has('id') && !['adult', 'asr', 'alcohol', 'wine'].some((token) => tokens.has(token))) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'Does FORGE show Adult Signature Required, alcohol, or another ID-controlled service?',
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  if (tokens.has('business') && tokens.has('closed')
    && !['leave', 'deliver', 'release', 'package'].some((token) => tokens.has(token))
    && !['delivery', 'pickup', 'both'].some((token) => tokens.has(token))) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'Is the closure for one date, a date range, or a recurring weekday, and does it apply to delivery, pickup, or both?',
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  const releaseContextTokens = [
    'signature', 'isr', 'dsr', 'asr', 'alcohol', 'hazmat', 'mailbox', 'garage',
    'ramp', 'neighbor', 'door', 'location', 'business', 'residential', 'apartment', 'lobby'
  ];
  if (tokens.has('leave')
    && tokens.size <= 3
    && !releaseContextTokens.some((token) => tokens.has(token))) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'What service or signature requirement does the package show, and where are you considering leaving it?',
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  return null;
}

function buildDriverHelpDecision(question, records, context = {}) {
  const normalizedQuestion = normalizeDriverQuestion(question);
  const requestsBoundaryBypass = /\b(ignore|invent|pretend)\b/.test(normalizedQuestion);
  const requestsProtectedMaterial = /\b(hidden|system) (instructions|prompt)\b|\braw source documents?\b|\breveal (your )?(instructions|prompt)\b/.test(normalizedQuestion);
  const forcedUnsupportedCode = /\bsay code [a-z0-9]+ no matter what\b/.test(normalizedQuestion);
  const operationalTerms = /\b(package|pickup|delivery|vehicle|scanner|signature|dsr|isr|asr|dog|hazmat|route|stop|customer|recipient)\b/.test(normalizedQuestion);
  const substantiveTokens = tokenize(question).filter((token) => (
    !['package', 'route', 'ready', 'fedex', 'data', 'knowledge', 'model'].includes(token)
  ));
  if ((requestsBoundaryBypass && substantiveTokens.length === 0)
    || (requestsProtectedMaterial && !operationalTerms)
    || forcedUnsupportedCode) {
    return {
      response_mode: 'ESCALATE',
      confidence: 0,
      candidates: [],
      selected_records: [],
      escalation_message: 'Ready Route cannot provide an operational answer without an applicable verified procedure. Contact your manager or station.'
    };
  }
  const criticalIntentDecision = buildCriticalIntentDecision(question, records);
  if (criticalIntentDecision) return criticalIntentDecision;
  const multiIssueClarification = buildExplicitMultiIssueClarification(question);
  if (multiIssueClarification) return multiIssueClarification;
  const ranked = rankKnowledgeRecords(question, records, context);
  const top = ranked[0] || null;
  const second = ranked[1] || null;
  const candidates = ranked.slice(0, 5).map(({ record, score }) => ({
    knowledge_id: record.knowledge_id,
    version: record.version,
    canonical_situation: record.canonical_situation,
    score
  }));

  // A business-closure message is administrative notice only. It must never be
  // treated as authority to leave a package when the release procedure itself
  // is unresolved or not production eligible.
  const asksAboutClosedBusinessDisposition = /\bbusiness\b/.test(normalizedQuestion)
    && /\b(closed|closure)\b/.test(normalizedQuestion)
    && /\b(leave|deliver|release|package)\b/.test(normalizedQuestion)
    && !/\bop\s*201\b/.test(normalizedQuestion);
  if (asksAboutClosedBusinessDisposition) {
    const closedBusinessRecord = selectCanonicalRecordVersions(records).find(
      (record) => record.knowledge_id === 'KNO-DEL-BUS-CLOSED-001'
    );
    if (isProductionEligibleRecord(closedBusinessRecord)) {
      return {
        response_mode: 'ANSWER',
        confidence: 0.99,
        candidates,
        selected_records: [closedBusinessRecord],
        answer: buildPresentedAnswer(closedBusinessRecord, question),
        more_info: closedBusinessRecord.more_info_answer || null,
        answer_structure: buildAnswerStructure(closedBusinessRecord, question)
      };
    }
    const releaseRecord = selectCanonicalRecordVersions(records).find(
      (record) => record.knowledge_id === 'KNO-DEL-BUS-OP201-001'
    );
    if (!isProductionEligibleRecord(releaseRecord)) {
      return {
        response_mode: 'ESCALATE',
        confidence: top ? Math.min(top.score / 100, 0.99) : 0,
        candidates,
        selected_records: [],
        escalation_message: 'A business-closure message does not authorize leaving the package. Ready Route does not have a complete approved release procedure for this situation; contact your manager or station.'
      };
    }
  }

  const asksAboutCallTagFraud = /\bcall\s*tag\b/.test(normalizedQuestion)
    && /\bfraud\b/.test(normalizedQuestion);
  if (asksAboutCallTagFraud) {
    const fraudRecord = selectCanonicalRecordVersions(records).find(
      (record) => record.knowledge_id === 'KNO-PUP-CALLTAG-FRAUD-001'
    );
    if (!isProductionEligibleRecord(fraudRecord)) {
      return {
        response_mode: 'ESCALATE',
        confidence: top ? Math.min(top.score / 100, 0.99) : 0,
        candidates,
        selected_records: [],
        escalation_message: 'Ready Route does not have an approved suspected-fraud call-tag procedure. Contact your manager, station, or CXPC for the current direction.'
      };
    }
  }

  const tokens = new Set(tokenize(question));
  const refusalWording = tokens.has('refused')
    || /\b(?:won t|wont|will not|doesn t|doesnt|does not) (?:take|accept|want)\b/.test(normalizedQuestion);
  const ordinaryRecipientRefusal = refusalWording
    && (tokens.has('customer') || tokens.has('recipient'))
    && (tokens.has('package') || tokens.has('delivery'))
    && !(tokens.has('call') && tokens.has('tag'))
    && !['asr', 'adult', 'cod', 'id'].some((token) => tokens.has(token));
  if (ordinaryRecipientRefusal) {
    const refusalRecord = selectCanonicalRecordVersions(records).find(
      (record) => record.knowledge_id === 'KNO-DEL-REFUSED-001'
    );
    if (!isProductionEligibleRecord(refusalRecord)) {
      return {
        response_mode: 'ESCALATE',
        confidence: top ? Math.min(top.score / 100, 0.99) : 0,
        candidates,
        selected_records: [],
        escalation_message: 'For an ordinary delivery refusal, Ready Route can verify code 006, but the current sources do not establish the complete documentation and final-disposition procedure. Keep the package in your custody and contact your manager or station for the remaining steps.'
      };
    }
  }

  const asksAboutForgeLogin = /\bforge\b/.test(normalizedQuestion)
    && /\b(log\s*in|login)\b/.test(normalizedQuestion);
  if (asksAboutForgeLogin) {
    const warningRecord = selectCanonicalRecordVersions(records).find(
      (record) => record.knowledge_id === 'KNO-FORGE-LOGIN-WARNING-001'
    );
    const explicitlyDescribesWarning = /\b(warning|license|medical|qualification|agreement|carb|hours of service|hos)\b/.test(normalizedQuestion);
    const explicitlyDescribesOutage = /\b(outage|offline|authentication|network|delayed)\b/.test(normalizedQuestion);
    const explicitlyDescribesDeviceTime = /\b(device|system)\b/.test(normalizedQuestion)
      && /\b(time|date|clock|timezone)\b/.test(normalizedQuestion)
      && /\b(incorrect|wrong|error)\b/.test(normalizedQuestion);
    if (!isProductionEligibleRecord(warningRecord) && explicitlyDescribesWarning) {
      return {
        response_mode: 'ESCALATE',
        confidence: top ? Math.min(top.score / 100, 0.99) : 0,
        candidates,
        selected_records: [],
        escalation_message: 'A FORGE login failure may be an outage or an unresolved compliance warning. Ready Route cannot establish which from this description; report the exact screen message to your manager or station.'
      };
    }
    if (!isProductionEligibleRecord(warningRecord)
      && !explicitlyDescribesOutage
      && !explicitlyDescribesDeviceTime) {
      return buildFlowClarification('forge-login-type', 'Is this an outage, or does FORGE show a warning?', [
        flowOption('forge-login-type', 'outage', 'Outage / offline', 'FORGE authentication outage need delayed login'),
        flowOption('forge-login-type', 'warning', 'Warning on screen', 'FORGE login warning exact message'),
        flowOption('forge-login-type', 'credentials', 'Regular sign-in problem', 'FORGE regular login problem no warning')
      ], 'cannot identify why FORGE will not log in', candidates);
    }
  }

  const driverFirstClarification = buildDriverFirstClarification(question, candidates);
  if (driverFirstClarification) return driverFirstClarification;

  const topicClarification = buildDiscoveredTopicClarification(question, ranked, candidates);
  if (topicClarification) return topicClarification;

  if (!top || top.score < ANSWER_THRESHOLD) {
    return {
      response_mode: 'ESCALATE',
      confidence: top ? Math.min(top.score / ANSWER_THRESHOLD, 0.99) : 0,
      candidates,
      selected_records: [],
      escalation_message: 'Ready Route cannot establish an approved answer from the verified material available. Contact your manager or station for the correct procedure.'
    };
  }

  if (!isProductionEligibleRecord(top.record)) {
    return {
      response_mode: 'ESCALATE',
      confidence: Math.min(top.score / 100, 0.99),
      candidates,
      selected_records: [],
      escalation_message: `Ready Route found material about “${top.record.canonical_situation},” but the supplied sources do not establish a complete approved answer. Contact your manager or station for the current procedure.`,
      escalation_details: (top.record.clarification_requirements || []).slice(0, 3)
    };
  }

  const matchedPattern = getMatchingQuestionPattern(question, top.record);
  const patternRuntimeMode = getPatternRuntimeMode(matchedPattern);
  const definitionMatch = normalizedQuestion.match(/^what is (?:a |an )?([a-z0-9 ]{1,24})$/);
  const definitionTokens = definitionMatch ? tokenize(definitionMatch[1]) : [];
  const topSurfaceTokens = new Set(
    getRecordSearchSurfaces(top.record).flatMap((surface) => tokenize(surface.value))
  );
  const isSupportedDefinition = definitionTokens.length > 0
    && definitionTokens.every((token) => topSurfaceTokens.has(token))
    && top.score >= 45;
  const queryTokenSet = tokens;
  const isNarrowDirectIntent = (
    top.record.knowledge_id === 'KNO-FORGE-VEHICLE-CHANGE-001'
      && queryTokenSet.has('vehicle')
      && queryTokenSet.has('change')
  ) || (
    top.record.knowledge_id === 'KNO-SEC-LOST-BADGE-001'
      && queryTokenSet.has('lost')
      && queryTokenSet.has('badge')
      && queryTokenSet.size <= 2
  ) || (
    top.record.knowledge_id === 'KNO-DEL-PLACEMENT-HAZARD-001'
      && queryTokenSet.has('mailbox')
  ) || (
    top.record.knowledge_id === 'KNO-DEL-OP206-001'
      && queryTokenSet.has('recipient')
      && queryTokenSet.has('signature')
      && queryTokenSet.has('device')
      && ['not', 'refused'].some((token) => queryTokenSet.has(token))
  ) || (
    top.record.knowledge_id === 'KNO-PUP-CALLTAG-REFUSED-001'
      && queryTokenSet.has('call')
      && queryTokenSet.has('tag')
      && queryTokenSet.has('refused')
  ) || (
    top.record.knowledge_id === 'KNO-DEL-BARCODE-001'
      && queryTokenSet.has('delivery')
      && queryTokenSet.has('barcode')
      && ['missing', 'zero'].some((token) => queryTokenSet.has(token))
  ) || (
    top.record.knowledge_id === 'KNO-FORGE-DEVICE-TIME-001'
      && queryTokenSet.has('device')
      && queryTokenSet.has('time')
      && ['incorrect', 'wrong', 'error', 'login'].some((token) => queryTokenSet.has(token))
  ) || (
    top.record.knowledge_id === 'KNO-COMMS-MEDIA-001'
      && queryTokenSet.has('interview')
      && ['recorded', 'media', 'reporter'].some((token) => queryTokenSet.has(token))
  ) || (
    /^KNO-DEL-SIG-(ISR|DSR|ASR)-/.test(top.record.knowledge_id)
      && ['isr', 'dsr', 'asr', 'indirect', 'direct', 'adult']
        .some((token) => queryTokenSet.has(token))
      && patternRuntimeMode === 'CLARIFY'
      && (matchedPattern?.must_clarify || []).length > 0
      && matchedPattern.must_clarify.every((item) => /signature type/i.test(String(item)))
  );
  if (isSupportedDefinition || (isNarrowDirectIntent && patternRuntimeMode !== 'ESCALATE')) {
    return {
      response_mode: 'ANSWER',
      confidence: Math.min(top.score / 100, 0.99),
      candidates,
      selected_records: [top.record],
      answer: buildPresentedAnswer(top.record, question),
      more_info: top.record.more_info_answer || null,
      answer_structure: buildAnswerStructure(top.record, question)
    };
  }
  const closeNonverifiedCandidate = ranked.find((candidate, index) => (
    index > 0
      && top.score - candidate.score <= CLARIFICATION_MARGIN
      && !isProductionEligibleRecord(candidate.record)
  ));
  if (closeNonverifiedCandidate) {
    if (patternRuntimeMode === 'CLARIFY') {
      const clarification = matchedPattern.must_clarify?.[0]
        || top.record.clarification_requirements?.[0]
        || 'one more detail about the situation';
      return {
        response_mode: 'CLARIFY',
        confidence: Math.min(top.score / 100, 0.99),
        candidates,
        selected_records: [],
        clarification_prompt: `Ready Route needs one detail before answering: ${clarification}.`,
        clarification_options: clarificationOptionsFromRanked(ranked)
      };
    }
    if (patternRuntimeMode) {
      return {
        response_mode: 'ESCALATE',
        confidence: Math.min(top.score / 100, 0.99),
        candidates,
        selected_records: [],
        escalation_message: 'Ready Route found overlapping procedures, but at least one relevant procedure is not currently approved. Contact your manager or station rather than relying on an uncertain answer.'
      };
    }
    return buildClarificationDecision(
      ranked,
      candidates,
      top.score,
      'I found more than one possible procedure. Which situation best matches?'
    );
  }

  if (patternRuntimeMode === 'ESCALATE') {
    return {
      response_mode: 'ESCALATE',
      confidence: Math.min(top.score / 100, 0.99),
      candidates,
      selected_records: [],
      escalation_message: 'The available details are not sufficient for an approved answer. Contact your manager or station for the current procedure.'
    };
  }
  if (patternRuntimeMode === 'CLARIFY') {
    const clarification = matchedPattern.must_clarify?.[0]
      || top.record.clarification_requirements?.[0]
      || 'one more detail about the situation';
    return {
      response_mode: 'CLARIFY',
      confidence: Math.min(top.score / 100, 0.99),
      candidates,
      selected_records: [],
      clarification_prompt: `Ready Route needs one detail before answering: ${clarification}.`,
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }
  if (patternRuntimeMode === 'ANSWER') {
    return {
      response_mode: 'ANSWER',
      confidence: Math.min(top.score / 100, 0.99),
      candidates,
      selected_records: [top.record],
      answer: buildPresentedAnswer(top.record, question),
      more_info: top.record.more_info_answer || null,
      answer_structure: buildAnswerStructure(top.record, question)
    };
  }

  if (tokenize(question).length <= 2 && !hasExactQuestionVariant(question, top.record)) {
    const clarification = (top.record.clarification_requirements || []).slice(0, 2).join(' ')
      || 'what kind of package, stop, or procedure is involved';
    return {
      response_mode: 'CLARIFY',
      confidence: Math.min(top.score / 100, 0.99),
      candidates,
      selected_records: [],
      clarification_prompt: `I found the topic, but need one more detail: ${clarification}`,
      clarification_options: clarificationOptionsFromRanked(ranked)
    };
  }

  const materiallyDifferentSecond = second
    && second.score >= ANSWER_THRESHOLD
    && top.score - second.score <= CLARIFICATION_MARGIN
    && top.record.knowledge_id !== second.record.knowledge_id;

  if (materiallyDifferentSecond) {
    return buildClarificationDecision(ranked, candidates, top.score);
  }

  return {
    response_mode: 'ANSWER',
    confidence: Math.min(top.score / 100, 0.99),
    candidates,
    selected_records: [top.record],
    answer: buildPresentedAnswer(top.record, question),
    more_info: top.record.more_info_answer || null,
    answer_structure: buildAnswerStructure(top.record, question)
  };
}

module.exports = {
  ANSWER_THRESHOLD,
  CLARIFICATION_MARGIN,
  buildAnswerStructure,
  buildCriticalIntentDecision,
  buildDriverHelpDecision,
  buildPresentedAnswer,
  getMatchingQuestionPattern,
  getPatternRuntimeMode,
  normalizeDriverQuestion,
  rankKnowledgeRecords,
  scoreKnowledgeRecord,
  selectCanonicalRecordVersions,
  tokenize
};
