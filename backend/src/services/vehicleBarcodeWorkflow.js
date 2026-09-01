const VEHICLE_BARCODE_KNOWLEDGE_ID = 'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001';
const VEHICLE_BARCODE_WORKFLOW_TYPE = 'VEHICLE_BARCODE';
const VEHICLE_NUMBER_PROMPT = 'What is the vehicle number?';

function normalizeIntentText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bveihcle\b/g, 'vehicle')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isVehicleBarcodeIntent(value) {
  const normalized = normalizeIntentText(value);
  if (!normalized) return false;

  const asksAboutCode128 = /\bcode\s*128\b/.test(normalized);
  const barcodePattern = '\\bbar\\s*code\\b';
  const asksToCreateBarcode = (
    new RegExp(`\\b(?:create|make|generate|build|produce)\\b.*${barcodePattern}`).test(normalized)
    || new RegExp(`${barcodePattern}.*\\b(?:create|make|generate|build|produce)\\b`).test(normalized)
  );
  const namesVehicle = /\b(?:vehicle|truck|van)\b/.test(normalized);
  const namesBarcode = new RegExp(barcodePattern).test(normalized)
    || /\bvehicle scan code\b/.test(normalized);
  const describesMissingOrNeededBarcode = /\b(?:cant find|cannot find|couldnt find|missing|gone|lost|wont scan|will not scan|cannot scan|need|where)\b/.test(normalized);

  const requestsCode128 = asksAboutCode128
    && /\b(?:need|create|make|generate|build|produce|show|get|want)\b/.test(normalized);

  return requestsCode128
    || asksToCreateBarcode
    || (namesVehicle && namesBarcode && describesMissingOrNeededBarcode);
}

function buildVehicleBarcodeValue(vehicleNumber) {
  const suppliedValue = String(vehicleNumber || '')
    .trim()
    .replace(/^[“"']+|[”"'?!.,;:]+$/g, '')
    .replace(/^v(?=\d)/i, '')
    .trim();
  return `V${suppliedValue}`;
}

function extractVehicleNumberFromRequest(value) {
  const text = String(value || '').trim();
  const patterns = [
    /\b(?:vehicle|truck|van)\s*(?:number|no\.?|#)?\s*(?:is|=|:)?\s*(v?\d{1,12})\b/i,
    /\b(?:for|using)\s+(v?\d{1,12})\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function recordCandidate(record) {
  return {
    knowledge_id: record.knowledge_id,
    version: record.version,
    canonical_situation: record.canonical_situation,
    score: 100
  };
}

function buildCompletedVehicleBarcodeDecision(vehicleNumber, record) {
  const value = buildVehicleBarcodeValue(vehicleNumber);
  return {
    response_mode: 'ANSWER',
    answer_type: VEHICLE_BARCODE_WORKFLOW_TYPE,
    confidence: 1,
    candidates: [recordCandidate(record)],
    selected_records: [record],
    answer: 'Scan this vehicle barcode.',
    more_info: null,
    answer_structure: {
      direct_answer: 'Scan this vehicle barcode.',
      steps: ['Scan the Code 128 barcode shown above.'],
      watch_for: 'Confirm the encoded value matches the actual vehicle number before scanning.',
      options: [],
      procedure_steps: [],
      documentation: [],
      prohibited_actions: [
        'Do not omit the uppercase V prefix.',
        'Do not use a barcode format other than Code 128.'
      ],
      escalation_requirements: []
    },
    barcode: {
      symbology: 'CODE128',
      value
    },
    workflow: {
      type: VEHICLE_BARCODE_WORKFLOW_TYPE,
      state: 'COMPLETE'
    }
  };
}

function buildVehicleBarcodeWorkflowDecision(question, context = {}, record = null) {
  if (!record) return null;

  const pendingWorkflow = context.pending_workflow;
  if (pendingWorkflow?.type === VEHICLE_BARCODE_WORKFLOW_TYPE
    && pendingWorkflow?.state === 'AWAITING_VEHICLE_NUMBER') {
    return buildCompletedVehicleBarcodeDecision(question, record);
  }

  if (!isVehicleBarcodeIntent(question)) return null;

  const suppliedVehicleNumber = extractVehicleNumberFromRequest(question);
  if (suppliedVehicleNumber) {
    return buildCompletedVehicleBarcodeDecision(suppliedVehicleNumber, record);
  }

  return {
    response_mode: 'CLARIFY',
    answer_type: VEHICLE_BARCODE_WORKFLOW_TYPE,
    confidence: 1,
    candidates: [recordCandidate(record)],
    selected_records: [],
    clarification_prompt: VEHICLE_NUMBER_PROMPT,
    clarification_requirement: 'actual vehicle number',
    clarification_plan: ['actual vehicle number'],
    clarification_options: [],
    workflow: {
      type: VEHICLE_BARCODE_WORKFLOW_TYPE,
      state: 'AWAITING_VEHICLE_NUMBER'
    }
  };
}

module.exports = {
  VEHICLE_BARCODE_KNOWLEDGE_ID,
  VEHICLE_BARCODE_WORKFLOW_TYPE,
  VEHICLE_NUMBER_PROMPT,
  buildVehicleBarcodeValue,
  buildVehicleBarcodeWorkflowDecision,
  extractVehicleNumberFromRequest,
  isVehicleBarcodeIntent,
  normalizeIntentText
};
