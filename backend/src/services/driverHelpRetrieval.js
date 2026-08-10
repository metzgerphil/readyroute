const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'but', 'can', 'do', 'for', 'from', 'how', 'i',
  'if', 'in', 'is', 'it', 'm', 'me', 'my', 'of', 'on', 'or', 'the', 'there', 'this',
  'to', 'was', 'what', 'when', 'where', 'with', 'ignore', 'instructions', 'invent',
  'pretend', 'general', 'mystery', 'ready', 'rule'
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
  ['cust', 'customer'],
  ['custmer', 'customer'],
  ['receiver', 'recipient'],
  ['truck', 'vehicle'],
  ['van', 'vehicle'],
  ['swap', 'change'],
  ['swapped', 'change'],
  ['switch', 'change'],
  ['switched', 'change'],
  ['trigger', 'scanner'],
  ['refuse', 'refused'],
  ['refuses', 'refused'],
  ['refuzed', 'refused'],
  ['rong', 'wrong'],
  ['misdelivered', 'wrong'],
  ['misdelivery', 'wrong']
]);

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
    .split(' ')
    .filter((token) => token && (!STOP_WORDS.has(token) || /^\d+$/.test(token)))
    .map((token) => TOKEN_ALIASES.get(token) || token);
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
    { id: 'KNO-DEL-SIG-DSR-001', anySets: [['dsr'], ['direct', 'signature']] },
    { id: 'KNO-DEL-SIG-ISR-001', anySets: [['isr'], ['indirect', 'signature']] },
    { id: 'KNO-DEL-SIG-ASR-001', anySets: [['asr'], ['adult', 'signature']] },
    { id: 'KNO-SAF-DOG-ENCOUNTER-001', required: ['dog'], any: ['loose', 'porch', 'approach', 'bite', 'blocks'], boost: 60 },
    { id: 'KNO-FORGE-VEHICLE-CHANGE-001', required: ['vehicle', 'change'] },
    { id: 'KNO-DEL-MISDELIVERY-RECOVERY-001', required: ['wrong'], any: ['house', 'address', 'door'] },
    { id: 'KNO-PUP-SCANNER-FAIL-001', required: ['pickup', 'scanner'], any: ['barcode', 'package', 'read', 'scan'], boost: 60 },
    { id: 'KNO-PUP-VEHICLE-CAPACITY-001', required: ['pickup', 'vehicle', 'fit'] },
    { id: 'KNO-DEL-OP206-001', required: ['scanner', 'refused'], any: ['recipient', 'name', 'sign'] },
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
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates: [],
      selected_records: [],
      clarification_prompt: 'I found two separate operational issues. Which one do you need help with first?',
      clarification_options: []
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

function buildAnswerStructure(record, question = '') {
  const conciseSteps = (String(record.concise_answer || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
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
      label: record.canonical_situation
    }))
  };
}

function buildDiscoveredTopicClarification(question, ranked, candidates) {
  const tokens = new Set(tokenize(question));
  const hasSignatureType = ['asr', 'dsr', 'isr', 'adult', 'direct', 'indirect']
    .some((token) => tokens.has(token));

  if (tokens.has('signature') && !hasSignatureType) {
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
              : 'ASR — Adult Signature'
        }))
      };
    }
  }

  const damageTerms = ['damage', 'damaged', 'crushed'];
  const hasDamage = damageTerms.some((token) => tokens.has(token));
  const hasDamageContext = ['delivery', 'pickup', 'calltag', 'hazmat', 'hazardous', 'leak', 'leaking']
    .some((token) => tokens.has(token));
  if (hasDamage && !hasDamageContext) {
    return {
      response_mode: 'CLARIFY',
      confidence: 0,
      candidates,
      selected_records: [],
      clarification_prompt: 'Is this a delivery package, a pickup/call tag, or a leaking or hazardous-material package?',
      clarification_options: []
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

  return null;
}

function buildDriverHelpDecision(question, records, context = {}) {
  const normalizedQuestion = normalizeDriverQuestion(question);
  const requestsBoundaryBypass = /\b(ignore|invent|pretend)\b/.test(normalizedQuestion);
  const requestsProtectedMaterial = /\b(hidden|system) (instructions|prompt)\b|\braw source documents?\b|\breveal (your )?(instructions|prompt)\b/.test(normalizedQuestion);
  const forcedUnsupportedCode = /\bsay code [a-z0-9]+ no matter what\b/.test(normalizedQuestion);
  const operationalTerms = /\b(package|pickup|delivery|vehicle|scanner|signature|dsr|isr|asr|dog|hazmat|route|stop|customer|recipient)\b/.test(normalizedQuestion);
  const substantiveTokens = tokenize(question).filter((token) => !['package', 'route', 'data', 'knowledge', 'model'].includes(token));
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
        clarification_options: []
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
      clarification_options: []
    };
  }
  if (patternRuntimeMode === 'ANSWER') {
    return {
      response_mode: 'ANSWER',
      confidence: Math.min(top.score / 100, 0.99),
      candidates,
      selected_records: [top.record],
      answer: top.record.concise_answer,
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
      clarification_options: []
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
    answer: top.record.concise_answer,
    more_info: top.record.more_info_answer || null,
    answer_structure: buildAnswerStructure(top.record, question)
  };
}

module.exports = {
  ANSWER_THRESHOLD,
  CLARIFICATION_MARGIN,
  buildAnswerStructure,
  buildDriverHelpDecision,
  getMatchingQuestionPattern,
  getPatternRuntimeMode,
  normalizeDriverQuestion,
  rankKnowledgeRecords,
  scoreKnowledgeRecord,
  selectCanonicalRecordVersions,
  tokenize
};
