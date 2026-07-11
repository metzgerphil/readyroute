export const INSPECTION_SEVERITY_OPTIONS = [
  { value: 'minor', label: 'Minor' },
  { value: 'maintenance_soon', label: 'Maintenance Soon' },
  { value: 'unsafe', label: 'Unsafe' }
];

const INSPECTION_SECTIONS = [
  {
    id: 'critical_safety',
    title: 'Critical Safety',
    itemKeys: ['tires', 'check_engine_light', 'lights', 'brake_fluid']
  },
  {
    id: 'safety_equipment',
    title: 'Safety Equipment',
    itemKeys: ['vedr', 'back_up_camera', 'turn_cameras', 'parking_sensors', 'horn']
  },
  {
    id: 'maintenance',
    title: 'Maintenance',
    itemKeys: ['coolant', 'engine_oil', 'windshield_fluid', 'wipers']
  },
  {
    id: 'vehicle_condition',
    title: 'Vehicle Condition',
    itemKeys: ['truck_cleanliness']
  }
];

const INSPECTION_SECTION_ORDER = INSPECTION_SECTIONS.reduce((order, section, index) => ({
  ...order,
  [section.id]: index
}), {});

const TIRE_POSITIONS = ['Front Left', 'Front Right', 'Back Left', 'Back Right'];
const LIGHT_TYPES = ['Marker Lights', 'Back Turn Signals', 'Front Turn Signals', 'Headlights', 'Cargo Light', 'License Plate Light'];
const VEDR_ISSUE_TYPES = ['Not Connected', 'red light', 'Fell off'];
const BACK_UP_CAMERA_ISSUE_TYPES = ['Not showing', 'Monitor glitching'];
const TURN_CAMERAS_ISSUE_TYPES = ['Not connected', 'monitor glitching', 'camera loose'];
const PARKING_SENSORS_ISSUE_TYPES = ['No sound', 'sensor missing'];

export const INSPECTION_ITEM_DEFINITIONS = {
  tires: {
    label: 'Tires',
    category: 'critical_safety',
    issueFields: [
      { key: 'positions', label: 'Which tire?', type: 'multi', options: TIRE_POSITIONS, required: true },
      {
        key: 'issue_types',
        label: 'What is the issue?',
        type: 'multi',
        options: ['Low pressure', 'Uneven wear', 'Damage', 'Exposed cord', 'Flat', 'Other'],
        required: true
      }
    ]
  },
  check_engine_light: {
    label: 'Check Engine Light',
    category: 'critical_safety',
    issueFields: [
      {
        key: 'issue_type',
        label: 'What is happening?',
        type: 'single',
        options: ['Light on', 'Flashing', 'Warning message', 'Reduced power', 'Other'],
        required: true
      },
      {
        key: 'safe_to_operate_answer',
        label: 'Driving symptoms',
        type: 'single',
        options: ['No driving symptoms', 'Manager should review', 'Unsafe'],
        required: false
      }
    ]
  },
  lights: {
    label: 'Lights',
    category: 'critical_safety',
    issueFields: [
      { key: 'light_type', label: 'Which light?', type: 'single', options: LIGHT_TYPES, required: true },
      {
        key: 'issue_type',
        label: 'What is the issue?',
        type: 'single',
        options: ['Out', 'Dim', 'Cracked', 'Intermittent', 'Other'],
        required: true
      }
    ]
  },
  brake_fluid: {
    label: 'Brake Fluid',
    category: 'critical_safety',
    issueFields: [
      {
        key: 'issue_type',
        label: 'What is the issue?',
        type: 'single',
        options: ['Low', 'Empty', 'Leak suspected', 'Brake warning light', 'Soft brake pedal', 'Other'],
        required: true
      }
    ]
  },
  vedr: {
    label: 'VEDR',
    category: 'safety_equipment',
    defaultIssueSeverity: 'maintenance_soon',
    hideSeveritySelector: true,
    issueFields: [
      {
        key: 'issue_type',
        label: 'What is the issue?',
        type: 'single',
        options: VEDR_ISSUE_TYPES,
        required: true
      }
    ]
  },
  back_up_camera: {
    label: 'Back Up Camera',
    category: 'safety_equipment',
    defaultIssueSeverity: 'maintenance_soon',
    hideSeveritySelector: true,
    issueFields: [
      {
        key: 'issue_type',
        label: 'What is the issue?',
        type: 'single',
        options: BACK_UP_CAMERA_ISSUE_TYPES,
        required: true
      }
    ]
  },
  turn_cameras: {
    label: 'Turn Cameras',
    category: 'safety_equipment',
    defaultIssueSeverity: 'maintenance_soon',
    hideSeveritySelector: true,
    issueFields: [
      {
        key: 'issue_type',
        label: 'What is the issue?',
        type: 'single',
        options: TURN_CAMERAS_ISSUE_TYPES,
        required: true
      }
    ]
  },
  parking_sensors: {
    label: 'Parking Sensors',
    category: 'safety_equipment',
    defaultIssueSeverity: 'maintenance_soon',
    hideSeveritySelector: true,
    issueFields: [
      {
        key: 'issue_type',
        label: 'What is the issue?',
        type: 'single',
        options: PARKING_SENSORS_ISSUE_TYPES,
        required: true
      }
    ]
  },
  horn: { label: 'Horn', category: 'safety_equipment', issueFields: [] },
  coolant: {
    label: 'Coolant',
    category: 'maintenance',
    issueFields: [
      {
        key: 'issue_type',
        label: 'What is the issue?',
        type: 'single',
        options: ['Low', 'Empty', 'Leak suspected', 'Warning light', 'Overheating', 'Other'],
        required: true
      }
    ]
  },
  engine_oil: {
    label: 'Engine Oil',
    category: 'maintenance',
    issueFields: [
      {
        key: 'issue_type',
        label: 'What is the issue?',
        type: 'single',
        options: ['Low', 'Empty', 'Leak suspected', 'Oil light', 'Oil change due', 'Other'],
        required: true
      }
    ]
  },
  windshield_fluid: {
    label: 'Windshield Fluid',
    category: 'maintenance',
    issueFields: [
      {
        key: 'issue_type',
        label: 'What is the issue?',
        type: 'single',
        options: ['Low', 'Empty', 'Leak suspected', 'Other'],
        required: true
      }
    ]
  },
  wipers: {
    label: 'Wipers',
    category: 'maintenance',
    issueFields: [
      { key: 'position', label: 'Which wiper?', type: 'single', options: ['Left', 'Right', 'Both'], required: true },
      {
        key: 'issue_type',
        label: 'What is the issue?',
        type: 'single',
        options: ['Streaking', 'Torn', 'Missing', 'Not working', 'Other'],
        required: true
      }
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
  const definition = INSPECTION_ITEM_DEFINITIONS[key];

  if (definition) {
    return definition;
  }

  return {
    label: item.label || item.checklist_item_key || item.id || 'Inspection item',
    category: item.category || 'other',
    issueFields: []
  };
}

export function normalizeInspectionChecklistItem(item = {}) {
  const key = normalizeInspectionItemKey(item.checklist_item_key || item.id || item.label);
  const definition = getInspectionItemDefinition({ ...item, checklist_item_key: key });

  return {
    checklist_item_key: key,
    label: definition.label || item.label || key,
    category: definition.category || item.category || 'other',
    status: 'unanswered',
    severity: null,
    issue_details: {},
    note: '',
    photos: []
  };
}

export function getInspectionProgress(form) {
  const items = Array.isArray(form?.items) ? form.items : [];
  const completedCount = items.filter((item) => item.status && item.status !== 'unanswered').length;
  const issueCount = items.filter((item) => item.status === 'issue').length;

  return {
    total: items.length,
    completedCount,
    issueCount,
    remainingCount: Math.max(items.length - completedCount, 0)
  };
}

function hasIssueFieldValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== null && value !== undefined && String(value).trim().length > 0;
}

export function getInspectionIssueValidationError(item) {
  if (!item || item.status !== 'issue') {
    return null;
  }

  if (!item.severity) {
    return `${item.label || 'Issue'} needs a severity.`;
  }

  const definition = getInspectionItemDefinition(item);
  const missingField = (definition.issueFields || [])
    .filter((field) => field.required)
    .find((field) => !hasIssueFieldValue(item.issue_details?.[field.key]));

  if (missingField) {
    return `${item.label || 'Issue'} needs ${missingField.label.toLowerCase()}.`;
  }

  return null;
}

export function getInspectionFormValidationError(form) {
  const items = Array.isArray(form?.items) ? form.items : [];

  if (!items.length) {
    return 'Inspection checklist is not available. Contact your manager before starting the route.';
  }

  const firstUnanswered = items.find((item) => !item.status || item.status === 'unanswered');

  if (firstUnanswered) {
    return `Answer ${firstUnanswered.label || 'each inspection item'} before submitting.`;
  }

  const issueError = items.map(getInspectionIssueValidationError).find(Boolean);

  if (issueError) {
    return issueError;
  }

  return null;
}

export function getInspectionSectionsForItems(items = []) {
  const sectionsById = new Map(INSPECTION_SECTIONS.map((section) => [section.id, {
    ...section,
    items: []
  }]));

  for (const item of items || []) {
    const definition = getInspectionItemDefinition(item);
    const sectionId = definition.category || item.category || 'other';
    if (!sectionsById.has(sectionId)) {
      sectionsById.set(sectionId, {
        id: sectionId,
        title: sectionId === 'other' ? 'Other' : sectionId.replace(/_/g, ' '),
        itemKeys: [],
        items: []
      });
    }
    sectionsById.get(sectionId).items.push(item);
  }

  return [...sectionsById.values()]
    .filter((section) => section.items.length)
    .sort((left, right) => {
      const leftOrder = INSPECTION_SECTION_ORDER[left.id] ?? 99;
      const rightOrder = INSPECTION_SECTION_ORDER[right.id] ?? 99;
      return leftOrder - rightOrder;
    })
    .map((section) => ({
      ...section,
      items: [...section.items].sort((left, right) => {
        const leftIndex = section.itemKeys.indexOf(left.checklist_item_key);
        const rightIndex = section.itemKeys.indexOf(right.checklist_item_key);
        const safeLeftIndex = leftIndex === -1 ? 99 : leftIndex;
        const safeRightIndex = rightIndex === -1 ? 99 : rightIndex;
        return safeLeftIndex - safeRightIndex;
      })
    }));
}

export function serializeInspectionItems(items = []) {
  return (items || []).map((item) => ({
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
