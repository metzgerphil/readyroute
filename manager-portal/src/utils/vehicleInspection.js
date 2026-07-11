export const INSPECTION_SEVERITY_OPTIONS = [
  { value: 'minor', label: 'Minor' },
  { value: 'maintenance_soon', label: 'Maintenance Soon' },
  { value: 'unsafe', label: 'Unsafe' }
];

const TIRE_POSITIONS = ['Front Left', 'Front Right', 'Back Left', 'Back Right'];
const LIGHT_TYPES = ['Marker Lights', 'Back Turn Signals', 'Front Turn Signals', 'Headlights', 'Cargo Light', 'License Plate Light'];

export const INSPECTION_ITEM_DEFINITIONS = {
  tires: {
    label: 'Tires',
    category: 'critical_safety',
    issueFields: [
      { key: 'positions', label: 'Which tire?', type: 'multi', options: TIRE_POSITIONS, required: true },
      { key: 'issue_types', label: 'What is the issue?', type: 'multi', options: ['Low pressure', 'Uneven wear', 'Damage', 'Exposed cord', 'Flat', 'Other'], required: true }
    ]
  },
  check_engine_light: {
    label: 'Check Engine Light',
    category: 'critical_safety',
    issueFields: [
      { key: 'issue_type', label: 'What is happening?', type: 'single', options: ['Light on', 'Flashing', 'Warning message', 'Reduced power', 'Other'], required: true },
      { key: 'safe_to_operate_answer', label: 'Driving symptoms', type: 'single', options: ['No driving symptoms', 'Manager should review', 'Unsafe'], required: false }
    ]
  },
  lights: {
    label: 'Lights',
    category: 'critical_safety',
    issueFields: [
      { key: 'light_type', label: 'Which light?', type: 'single', options: LIGHT_TYPES, required: true },
      { key: 'issue_type', label: 'What is the issue?', type: 'single', options: ['Out', 'Dim', 'Cracked', 'Intermittent', 'Other'], required: true }
    ]
  },
  brake_fluid: {
    label: 'Brake Fluid',
    category: 'critical_safety',
    issueFields: [
      { key: 'issue_type', label: 'What is the issue?', type: 'single', options: ['Low', 'Empty', 'Leak suspected', 'Brake warning light', 'Soft brake pedal', 'Other'], required: true }
    ]
  },
  vedr: {
    label: 'VEDR',
    category: 'safety_equipment',
    defaultIssueSeverity: 'maintenance_soon',
    hideSeveritySelector: true,
    issueFields: [
      { key: 'issue_type', label: 'What is the issue?', type: 'single', options: ['Not Connected', 'red light', 'Fell off'], required: true }
    ]
  },
  back_up_camera: {
    label: 'Back Up Camera',
    category: 'safety_equipment',
    defaultIssueSeverity: 'maintenance_soon',
    hideSeveritySelector: true,
    issueFields: [
      { key: 'issue_type', label: 'What is the issue?', type: 'single', options: ['Not showing', 'Monitor glitching'], required: true }
    ]
  },
  turn_cameras: {
    label: 'Turn Cameras',
    category: 'safety_equipment',
    defaultIssueSeverity: 'maintenance_soon',
    hideSeveritySelector: true,
    issueFields: [
      { key: 'issue_type', label: 'What is the issue?', type: 'single', options: ['Not connected', 'monitor glitching', 'camera loose'], required: true }
    ]
  },
  parking_sensors: {
    label: 'Parking Sensors',
    category: 'safety_equipment',
    defaultIssueSeverity: 'maintenance_soon',
    hideSeveritySelector: true,
    issueFields: [
      { key: 'issue_type', label: 'What is the issue?', type: 'single', options: ['No sound', 'sensor missing'], required: true }
    ]
  },
  horn: { label: 'Horn', category: 'safety_equipment', issueFields: [] },
  coolant: {
    label: 'Coolant',
    category: 'maintenance',
    issueFields: [
      { key: 'issue_type', label: 'What is the issue?', type: 'single', options: ['Low', 'Empty', 'Leak suspected', 'Warning light', 'Overheating', 'Other'], required: true }
    ]
  },
  engine_oil: {
    label: 'Engine Oil',
    category: 'maintenance',
    issueFields: [
      { key: 'issue_type', label: 'What is the issue?', type: 'single', options: ['Low', 'Empty', 'Leak suspected', 'Oil light', 'Oil change due', 'Other'], required: true }
    ]
  },
  windshield_fluid: {
    label: 'Windshield Fluid',
    category: 'maintenance',
    issueFields: [
      { key: 'issue_type', label: 'What is the issue?', type: 'single', options: ['Low', 'Empty', 'Leak suspected', 'Other'], required: true }
    ]
  },
  wipers: {
    label: 'Wipers',
    category: 'maintenance',
    issueFields: [
      { key: 'position', label: 'Which wiper?', type: 'single', options: ['Left', 'Right', 'Both'], required: true },
      { key: 'issue_type', label: 'What is the issue?', type: 'single', options: ['Streaking', 'Torn', 'Missing', 'Not working', 'Other'], required: true }
    ]
  },
  truck_cleanliness: {
    label: 'Truck Cleanliness',
    category: 'vehicle_condition',
    conditionOptions: [
      { value: 'clean', label: 'Clean', status: 'pass' },
      { value: 'dirty', label: 'Dirty', status: 'issue' },
      { value: 'needs_attention', label: 'Needs Attention', status: 'issue' }
    ],
    issueFields: []
  }
};

export function normalizeInspectionItemKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function getInspectionItemDefinition(item = {}) {
  const key = normalizeInspectionItemKey(item.checklist_item_key || item.id || item.label);
  return INSPECTION_ITEM_DEFINITIONS[key] || {
    label: item.label || item.checklist_item_key || item.id || 'Inspection item',
    category: item.category || 'other',
    issueFields: []
  };
}

export function createInspectionChecklistItem(item = {}) {
  const checklistItemKey = normalizeInspectionItemKey(item.checklist_item_key || item.id || item.label);
  const definition = getInspectionItemDefinition({ ...item, checklist_item_key: checklistItemKey });

  return {
    checklist_item_key: checklistItemKey,
    label: definition.label || item.label || checklistItemKey,
    category: definition.category || item.category || 'other',
    status: 'pass',
    severity: null,
    issue_details: {},
    note: '',
    photos: []
  };
}

function hasValue(value) {
  return Array.isArray(value)
    ? value.length > 0
    : value !== null && value !== undefined && String(value).trim().length > 0;
}

export function getInspectionFormValidationError(form) {
  const items = Array.isArray(form?.items) ? form.items : [];

  if (!items.length) {
    return 'No inspection checklist items are enabled.';
  }

  const unanswered = items.find((item) => !item.status || item.status === 'unanswered');
  if (unanswered) {
    return `Answer ${unanswered.label || 'each inspection item'} before submitting.`;
  }

  for (const item of items) {
    if (item.status !== 'issue') {
      continue;
    }

    if (!item.severity) {
      return `${item.label || 'Issue'} needs a severity.`;
    }

    const definition = getInspectionItemDefinition(item);
    const missingField = (definition.issueFields || [])
      .filter((field) => field.required)
      .find((field) => !hasValue(item.issue_details?.[field.key]));

    if (missingField) {
      return `${item.label || 'Issue'} needs ${missingField.label.toLowerCase()}.`;
    }
  }

  return null;
}

export function serializeInspectionItems(items = []) {
  return items.map((item) => ({
    checklist_item_key: item.checklist_item_key,
    label: item.label,
    category: item.category || getInspectionItemDefinition(item).category,
    status: item.status,
    severity: item.status === 'issue' ? item.severity : null,
    issue_details: item.status === 'issue' ? (item.issue_details || {}) : {},
    note: item.status === 'issue' && item.note ? String(item.note).trim() : null,
    photos: item.status === 'issue' ? (item.photos || []) : []
  }));
}
