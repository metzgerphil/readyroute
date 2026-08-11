const { normalizeDriverQuestion } = require('./driverHelpRetrieval');

const REFERENCE_ID = /^(DELIVERY_STATUS|PICKUP_REASON):(\d{2,3})$/;

function isReferenceRecord(record) {
  return REFERENCE_ID.test(String(record?.knowledge_id || ''));
}

function isEligibleReference(record) {
  return record?.status === 'SOURCE_VERIFIED' && record?.is_published === true;
}

function referenceParts(record) {
  const match = String(record.knowledge_id).match(REFERENCE_ID);
  return match ? { namespace: match[1], code: match[2] } : null;
}

function referenceCandidate(record, score = 1) {
  return {
    knowledge_id: record.knowledge_id,
    version: record.version,
    status: record.status,
    score
  };
}

function referenceFlowOption(optionId, label, query) {
  return {
    knowledge_id: `FLOW:code-selection:${optionId}`,
    version: 1,
    label,
    query
  };
}

function clarificationDecision(records, mustClarify = [], options = [], notSureQuery = null) {
  const detail = mustClarify.length
    ? mustClarify.join('; ')
    : 'whether this is a delivery status or pickup reason, and what actually happened';
  return {
    response_mode: 'CLARIFY',
    confidence: 0.9,
    candidates: records.map((record) => referenceCandidate(record)),
    selected_records: [],
    clarification_prompt: `Before selecting a code, confirm ${detail}.`,
    clarification_id: 'code-selection',
    clarification_options: options,
    clarification_not_sure_query: notSureQuery
  };
}

function escalationDecision(records, message) {
  return {
    response_mode: 'ESCALATE',
    confidence: records.length ? 0.95 : 0,
    candidates: records.map((record) => referenceCandidate(record)),
    selected_records: [],
    escalation_message: message,
    escalation_details: []
  };
}

function answerDecision(records) {
  const definitions = records.map((record) => record.concise_answer);
  const boundary = 'These are reference definitions only. They do not by themselves authorize code selection or replace the complete operational procedure.';
  return {
    response_mode: 'ANSWER',
    answer_type: 'REFERENCE',
    confidence: 0.99,
    candidates: records.map((record) => referenceCandidate(record, 100)),
    selected_records: records,
    answer: definitions.join('\n'),
    more_info: boundary,
    answer_structure: {
      heading: 'CODE REFERENCE',
      steps: definitions,
      procedure_steps: [],
      required_documentation: [],
      prohibited_actions: [],
      escalation_requirements: [],
      options: []
    }
  };
}

function patternForQuestion(question, records) {
  const normalized = normalizeDriverQuestion(question);
  for (const record of records) {
    for (const pattern of record.driver_question_patterns || []) {
      if (normalizeDriverQuestion(pattern.utterance) === normalized) return pattern;
    }
  }
  return null;
}

function recordsForPattern(question, records) {
  const normalized = normalizeDriverQuestion(question);
  return records.filter((record) => (record.driver_question_patterns || []).some((pattern) => (
    normalizeDriverQuestion(pattern.utterance) === normalized
  )));
}

function namespaceHint(normalizedQuestion) {
  if (/\bpickup\b|\bpup\b/.test(normalizedQuestion)) return 'PICKUP_REASON';
  if (/\bdelivery\b/.test(normalizedQuestion)) return 'DELIVERY_STATUS';
  if (/\bcode\b|\bstatus\b/.test(normalizedQuestion)) return 'DELIVERY_STATUS';
  return null;
}

function explicitCodeTokens(question) {
  const normalized = normalizeDriverQuestion(question);
  const looksLikeReference = /\b(code|status|reason)\b/.test(normalized)
    || /^what is \d{1,3}$/.test(normalized)
    || /^\d{1,3}(?: or \d{1,3})*$/.test(normalized);
  if (!looksLikeReference) return [];
  return [...new Set(normalized.match(/\b\d{1,3}\b/g) || [])];
}

function sameNumericCode(left, right) {
  return Number.parseInt(left, 10) === Number.parseInt(right, 10);
}

function buildDriverHelpReferenceDecision(question, allRecords) {
  const records = allRecords.filter(isReferenceRecord);
  const normalized = normalizeDriverQuestion(question);
  if (/\b(?:say|use|choose|return) code \d{1,3}.*\b(?:no matter what|regardless|ignore)\b/.test(normalized)) {
    return escalationDecision(
      [],
      'Ready Route cannot select or force a code without the canonical operational condition. Describe what happened, or contact management or station personnel.'
    );
  }
  const deliveryCode = (code) => records.filter((record) => {
    const parts = referenceParts(record);
    return parts?.namespace === 'DELIVERY_STATUS' && sameNumericCode(parts.code, code);
  });
  const recipientMoved = /\b(?:customer|recipient|person) (?:has )?moved\b/.test(normalized)
    || /\b(?:doesn t|doesnt|does not|no longer) live(?:s)? (?:here|there|at (?:this|the) address)\b/.test(normalized);
  if (recipientMoved) {
    const matchedRecords = deliveryCode('002');
    return matchedRecords.length && matchedRecords.every(isEligibleReference)
      ? answerDecision(matchedRecords)
      : escalationDecision(
        matchedRecords,
        'Ready Route cannot verify delivery status 002 in the current canonical reference set. Contact management or station personnel rather than guessing.'
      );
  }
  const cannotFindAddress = /\b(?:can t|cant|cannot|couldn t|couldnt|could not|unable to) (?:find|locate) (?:the |this )?(?:address|house|stop|location)\b/.test(normalized);
  if (cannotFindAddress) {
    const matchedRecords = [...deliveryCode('002'), ...deliveryCode('003')];
    return clarificationDecision(
      matchedRecords,
      ['whether the labeled address cannot be physically located or the recipient no longer lives there'],
      [
        referenceFlowOption('address-not-found', 'The labeled address cannot be physically located', 'what is delivery code 003'),
        referenceFlowOption('recipient-moved', 'I found the address, but the recipient moved', 'what is delivery code 002')
      ],
      'not sure whether the address is missing or the recipient moved'
    );
  }
  const matchedPattern = patternForQuestion(question, records);

  if (matchedPattern) {
    const matchedRecords = recordsForPattern(question, records);
    if (matchedPattern.response_mode === 'CLARIFY_BEFORE_REFERENCE_SELECTION') {
      return clarificationDecision(matchedRecords, matchedPattern.must_clarify || []);
    }
    if (matchedPattern.response_mode === 'WITHHOLD_UNKNOWN_REFERENCE') {
      const unknown = (matchedPattern.unknown_reference_tokens || []).join(', ');
      return escalationDecision(
        matchedRecords,
        `Ready Route cannot verify reference code ${unknown || 'requested'} in the current canonical reference set. Contact management or station personnel rather than guessing.`
      );
    }
    if (matchedPattern.response_mode === 'ANSWER_REFERENCE_WITH_WORKFLOW_BOUNDARY') {
      if (matchedRecords.length && matchedRecords.every(isEligibleReference)) {
        return answerDecision(matchedRecords);
      }
      return escalationDecision(
        matchedRecords,
        'The matching reference definition is not currently production eligible. Contact management or station personnel for the current code and procedure.'
      );
    }
  }

  const codes = explicitCodeTokens(question);
  if (codes.length) {
    const hint = namespaceHint(normalized);
    const matchedRecords = records.filter((record) => {
      const parts = referenceParts(record);
      return codes.some((code) => sameNumericCode(code, parts.code))
        && (!hint || parts.namespace === hint);
    });
    const unknownCodes = codes.filter((code) => !matchedRecords.some((record) => (
      sameNumericCode(code, referenceParts(record).code)
    )));
    if (unknownCodes.length) {
      return escalationDecision(
        matchedRecords,
        `Ready Route cannot verify reference code ${unknownCodes.join(', ')} in the current ${hint ? hint.toLowerCase().replace('_', ' ') : 'canonical reference'} set. Contact management or station personnel rather than guessing.`
      );
    }
    if (!hint && matchedRecords.length > codes.length) {
      return clarificationDecision(matchedRecords, [
        'whether each number is a delivery status or pickup reason'
      ], [
        referenceFlowOption('delivery', 'Delivery status', `what is delivery code ${codes.join(' or ')}`),
        referenceFlowOption('pickup', 'Pickup reason', `what is pickup code ${codes.join(' or ')}`)
      ], 'not sure whether this is a delivery or pickup code');
    }
    if (!matchedRecords.every(isEligibleReference)) {
      return escalationDecision(
        matchedRecords,
        'The requested reference definition is not currently production eligible. Contact management or station personnel for the current code and procedure.'
      );
    }
    return answerDecision(matchedRecords);
  }

  if (/\b(?:what|which) code\b|\bcode (?:do|should|would|for)\b|\bstatus code\b|\bpickup (?:code|reason)\b|\bnot sure what code\b/.test(normalized)) {
    return clarificationDecision([], [], [
      referenceFlowOption('completed', 'Delivered / completed', 'what delivery code for a completed stop'),
      referenceFlowOption('attempted', 'Tried but could not complete', 'what delivery code for an attempted but not completed stop'),
      referenceFlowOption('no-attempt', 'No attempt', 'what delivery code for no attempt'),
      referenceFlowOption('pickup', 'Pickup problem', 'what pickup reason code should I use')
    ], 'not sure what happened at the stop');
  }
  return null;
}

module.exports = {
  answerDecision,
  buildDriverHelpReferenceDecision,
  explicitCodeTokens,
  isReferenceRecord,
  referenceParts
};
