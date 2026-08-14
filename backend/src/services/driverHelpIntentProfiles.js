const CRITICAL_INTENT_PROFILE_VERSION = 1;

function hasAny(tokens, values) {
  return values.some((value) => tokens.has(value));
}

const CRITICAL_INTENT_PROFILES = [
  {
    intent_id: 'active-vehicle-accident',
    knowledge_id: 'KNO-INC-ACCIDENT-SCENE-001',
    required_answer_patterns: ['(?:9-1-1|911)', '(?:safe|safety)'],
    matches({ normalized, tokens }) {
      const accidentLanguage = hasAny(tokens, ['accident', 'crash', 'collision', 'wreck'])
        || /\b(?:got hit|hit (?:a|another|the) (?:car|vehicle|truck)|backed into)\b/.test(normalized)
        || /\b(?:car|vehicle|truck)\b.*\bhit me\b/.test(normalized);
      const historicalPaperworkOnly = /\b(?:report|form|paperwork|document)\b/.test(normalized)
        && !/\b(?:just|now|scene|first|immediate|happened|involved)\b/.test(normalized);
      const evidenceCustodyQuestion = /\b(?:camera|vedr|evidence|recording)\b/.test(normalized)
        && /\b(?:record|custody|who has|taken out|removed)\b/.test(normalized);
      const minorSituationNeedsDetail = /\bminor (?:crash|accident|collision)\b/.test(normalized)
        && !/\b(?:just|now|scene|first|immediate)\b/.test(normalized);
      return accidentLanguage
        && !historicalPaperworkOnly
        && !evidenceCustodyQuestion
        && !minorSituationNeedsDetail;
    }
  },
  {
    intent_id: 'recipient-signature-falsification',
    knowledge_id: 'KNO-ETH-FALSIFICATION-001',
    required_answer_patterns: ['(?:do not|never)', '(?:sign|signature|forge)'],
    matches({ normalized }) {
      return /\b(?:fake|forge|falsify)\b.*\b(?:sign|signature|recipient|customer)\b/.test(normalized)
        || /\b(?:can|could|should|may|do|would) i\b.*\bsign\b.*\b(?:for|customer|recipient|them|their)\b/.test(normalized)
        || /\b(?:i|driver) (?:sign|enter) (?:for|the customer|the recipient|their name|a customer signature)\b/.test(normalized)
        || /\b(?:customer|recipient) (?:said|says|asked|told|gave permission).*\b(?:i |me to )?sign\b/.test(normalized)
        || /\bdriver sign(?:s|ing)? (?:for|the customer|the recipient)\b/.test(normalized);
    }
  },
  {
    intent_id: 'delivery-prescanning',
    knowledge_id: 'KNO-DEL-SCAN-INTEGRITY-001',
    required_answer_patterns: ['(?:do not|don.t|never)', '(?:pre.?scan|scan.*(?:actual|customer location|when))'],
    matches({ normalized }) {
      return /\bpre\s*scan(?:ned|ning)?\b/.test(normalized)
        || /\bscan\b.*\b(?:before|ahead of time|in advance)\b.*\b(?:dispatch|leave|leaving|route|stop|deliver|delivery)\b/.test(normalized)
        || /\bscan\b.*\b(?:deliveries|packages|boxes|stops)\b.*\b(?:ahead of time|in advance)\b/.test(normalized)
        || /\bscan\b.*\b(?:all|everything|packages|boxes|stops)\b.*\b(?:station|terminal|vehicle|van|truck)\b/.test(normalized)
        || /\bscan\b.*\b(?:station|terminal|vehicle|van|truck)\b.*\b(?:before|then deliver|ahead)\b/.test(normalized);
    }
  },
  {
    intent_id: 'hazmat-leak',
    knowledge_id: 'KNO-HAZ-LEAK-001',
    required_answer_patterns: ['(?:do not deliver|don.t deliver)', '(?:station|fedex)'],
    matches({ tokens }) {
      const hazmat = tokens.has('hazmat') || (tokens.has('dangerous') && tokens.has('goods'));
      return hazmat && hasAny(tokens, ['leak', 'leaking', 'spill', 'spilling']);
    }
  },
  {
    intent_id: 'pickup-vehicle-capacity',
    knowledge_id: 'KNO-PUP-VEHICLE-CAPACITY-001',
    required_answer_patterns: ['(?:notify|contact)', '(?:ao|bc|station|cxpc)', '(?:do not|don.t).*overload'],
    matches({ normalized, tokens }) {
      if (!tokens.has('pickup') || !tokens.has('vehicle')) return false;
      return hasAny(tokens, ['fit', 'capacity', 'large', 'big', 'overload'])
        || /\b(?:too many|more packages|more boxes|will not fit|wont fit|cannot fit)\b/.test(normalized);
    }
  },
  {
    intent_id: 'active-threat',
    knowledge_id: 'KNO-SEC-ACTIVE-THREAT-001',
    required_answer_patterns: ['(?:get out|escape|hide)', '(?:9-1-1|911)'],
    matches({ normalized, tokens }) {
      const storageOrScreeningQuestion = /\b(?:permit|concealed|screening|store|stored|stay in|leave in)\b/.test(normalized);
      if (storageOrScreeningQuestion) return false;
      return tokens.has('shooter')
        || /\b(?:gun|weapon)\b.*\b(?:threat|threatening|attack|attacking|shooting)\b/.test(normalized)
        || /\b(?:threat|threatening|attack|attacking|shooting)\b.*\b(?:gun|weapon)\b/.test(normalized)
        || /\b(?:armed|active) (?:person|attacker|threat|shooter)\b/.test(normalized)
        || /\b(?:someone|person|customer) (?:is )?(?:attacking|shooting|has a gun|has a weapon)\b/.test(normalized);
    }
  },
  {
    intent_id: 'dog-bite',
    knowledge_id: 'KNO-SAF-DOG-ENCOUNTER-001',
    required_answer_patterns: ['(?:medical|wound|care)', '(?:animal control|report)'],
    matches({ normalized }) {
      return /\bdog\b.*\b(?:bit|bite|bitten|wound|attacked)\b/.test(normalized)
        || /\b(?:bit|bitten|attacked)\b.*\b(?:by a )?dog\b/.test(normalized);
    }
  },
  {
    intent_id: 'hours-of-service-driving-limit',
    knowledge_id: 'KNO-HOS-DUTY-LIMITS-001',
    required_answer_patterns: ['(?:do not drive|may drive|drive up to)', '(?:11|14|70)'],
    matches({ normalized, tokens }) {
      const drivingLimit = tokens.has('driving') || tokens.has('drive') || /\bkeep going\b/.test(normalized);
      const limitLanguage = /\b(?:11|eleven|14|fourteen|70|seventy)\b/.test(normalized)
        || /\b(?:hours of service|hos|driving limit|out of hours|over my hours)\b/.test(normalized);
      return drivingLimit && limitLanguage;
    }
  }
];

function matchCriticalIntent(question, { normalize, tokenize }) {
  const normalized = normalize(question);
  const tokens = new Set(tokenize(question));
  const profile = CRITICAL_INTENT_PROFILES.find((candidate) => (
    candidate.matches({ normalized, tokens })
  ));
  if (!profile) return null;
  return {
    ...profile,
    profile_version: CRITICAL_INTENT_PROFILE_VERSION,
    interpreted_question: {
      normalized,
      tokens: [...tokens]
    }
  };
}

module.exports = {
  CRITICAL_INTENT_PROFILES,
  CRITICAL_INTENT_PROFILE_VERSION,
  matchCriticalIntent
};
