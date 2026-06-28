import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

import { getApiErrorMessage } from '../utils/apiError';
import api from '../services/api';
import appTheme from '../theme/appTheme';
import {
  removeClockInTime,
  removeToken,
  saveClockInTime
} from '../services/auth';
import { prefetchDriverDriveRoute, prefetchDriverManifest, saveDriverRouteSummary } from '../services/driverRouteCache';
import { loadStatusCodes } from '../services/statusCodes';

const INSPECTION_SEVERITY_OPTIONS = [
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

const INSPECTION_ITEM_DEFINITIONS = {
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
  vedr: { label: 'VEDR', category: 'safety_equipment', issueFields: [] },
  back_up_camera: { label: 'Back Up Camera', category: 'safety_equipment', issueFields: [] },
  turn_cameras: { label: 'Turn Cameras', category: 'safety_equipment', issueFields: [] },
  parking_sensors: { label: 'Parking Sensors', category: 'safety_equipment', issueFields: [] },
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

export const DAILY_SAFETY_REMINDERS = [
  {
    id: 'pretrip',
    title: 'Pre-trip finds problems before the road does',
    source: 'Driver Safety Guidebook: Pre-trip Inspection',
    bullets: [
      'Complete a pre-trip for every vehicle you drive that day, not just the first truck you touch.',
      'Verify the basics before rolling: 3 reflective triangles, charged fire extinguisher, required documents, and spare fuses.',
      'Check tires, leaks, lights, mirrors, brakes, and windshield while the truck is still parked.'
    ],
    takeaway: 'The book is clear that skipped inspections lead to missed defects, fines, and unsafe breakdowns later in the day.'
  },
  {
    id: 'loading',
    title: 'Load the truck so your next stop is safer and faster',
    source: 'Driver Safety Guidebook: Loading Safety',
    bullets: [
      'Keep aisleways clear and as much freight on the shelves as possible to reduce trip hazards.',
      'Pull the next few stops toward the rear so you are not climbing through boxes at every delivery.',
      'Check weight labels before lifting and keep the load close while lifting with your legs, not your back.'
    ],
    takeaway: 'Good loading is not just speed. It prevents falls, damaged packages, and avoidable lifting injuries.'
  },
  {
    id: 'weather',
    title: 'Rain and slick roads demand more space, not more confidence',
    source: 'Driver Safety Guidebook: Rain, Cold Weather, and Hydroplaning',
    bullets: [
      'The first 10 minutes of rain are especially slick because oil and water mix on the roadway.',
      'Slow down, increase following distance, and treat standing water as a hydroplaning risk.',
      'Never use cruise control in wet, snowy, or icy conditions. If you skid, release the brake and steer gently into the skid.'
    ],
    takeaway: 'The guidebook stresses that traction disappears before most drivers realize it, so the adjustment has to happen early.'
  },
  {
    id: 'following-distance',
    title: 'Build a real following gap before you need it',
    source: 'Driver Safety Guidebook: Spatial Awareness',
    bullets: [
      'Below 40 mph, leave at least 1 second for every 10 feet of vehicle length.',
      'Above 40 mph, add one extra second to that gap.',
      'Use a fixed roadside object to count your spacing instead of guessing by feel.'
    ],
    takeaway: 'Stopping distance grows fast. Even a short lapse in space can erase your time to react.'
  },
  {
    id: 'seatbelt-distraction',
    title: 'Seatbelt on, distractions off, before the truck moves',
    source: 'Driver Safety Guidebook: Seatbelt Safety and Distracted Driving',
    bullets: [
      'Seatbelts are required for the driver and passengers, and buckling up takes only a few seconds.',
      'Phones, route sheets, eating, radio adjustments, and daydreaming all count as distracted driving.',
      'If you need to read, type, search, or sort something, do it while stopped, not while rolling.'
    ],
    takeaway: 'The book ties distraction directly to delayed perception and decision-making, which is where preventable crashes start.'
  },
  {
    id: 'backing',
    title: 'Avoid backing when you can. Slow it down when you cannot.',
    source: 'Driver Safety Guidebook: Backing and Parking Safety',
    bullets: [
      'If curb parking or a pull-through option exists, use it instead of backing into avoidable risk.',
      'Before backing, do a visual sweep, turn on hazard lights, and scan mirrors and blind spots continuously.',
      'If the path, clearance, or pedestrians are uncertain, stop and reevaluate before moving another foot.'
    ],
    takeaway: 'The guidebook points out that most backing crashes come from unseen obstacles or poor technique, both of which are preventable.'
  },
  {
    id: 'clearance',
    title: 'Roof damage usually starts with one bad clearance guess',
    source: 'Driver Safety Guidebook: Overhead Clearance',
    bullets: [
      'Know your vehicle height before the route starts, not when you are already under an awning.',
      'If it looks close, get out and walk the clearance instead of trying to save a few steps.',
      'Avoid overhangs and pass-throughs when the maneuver risk is higher than the convenience.'
    ],
    takeaway: 'The guidebook treats overhead strikes as a frequent and avoidable source of damage, especially near delivery points.'
  },
  {
    id: 'security',
    title: 'Secure the truck and stay alert to the scene around it',
    source: 'Driver Safety Guidebook: Driver Communication, Road Rage, and Vehicle Security',
    bullets: [
      'Lock the vehicle when doors are not in use and never leave it running unattended.',
      'Park in a visible area, survey the people and activity around you, and move if the situation feels unsafe.',
      'If another driver escalates, do not engage. Let them go, maintain your lane, and call 911 if the danger continues.'
    ],
    takeaway: 'The book makes the same point in several sections: safety drops fast when frustration or convenience starts making decisions for you.'
  }
];

export function getFriendlyDate() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(new Date());
}

export function getGreetingByTime() {
  const currentHour = new Date().getHours();

  if (currentHour < 12) {
    return 'Good morning';
  }

  if (currentHour < 18) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

export function formatBreakLabel(breakType) {
  switch (breakType) {
    case 'lunch':
      return 'Lunch';
    case 'other':
      return 'Break';
    case 'rest':
    default:
      return 'Break';
  }
}

export function getBreakAutoEndTimestamp(activeBreak) {
  if (!activeBreak?.started_at) {
    return null;
  }

  if (activeBreak?.scheduled_end_at) {
    return activeBreak.scheduled_end_at;
  }

  const startedAtMs = new Date(activeBreak.started_at).getTime();

  if (!Number.isFinite(startedAtMs)) {
    return null;
  }

  const durationMinutes = activeBreak.break_type === 'lunch' ? 30 : 15;
  return new Date(startedAtMs + durationMinutes * 60 * 1000).toISOString();
}

export function formatLaborTime(timestamp) {
  if (!timestamp) {
    return '—';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

export function getTodayStorageDate() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function getDayOfYear(date = new Date()) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = today.getTime() - startOfYear.getTime();
  return Math.floor(diffMs / 86400000);
}

export function getDailySafetyReminder(date = new Date()) {
  const index = (getDayOfYear(date) - 1) % DAILY_SAFETY_REMINDERS.length;
  return DAILY_SAFETY_REMINDERS[(index + DAILY_SAFETY_REMINDERS.length) % DAILY_SAFETY_REMINDERS.length];
}

export function normalizeSafetyFocusResponse(safetyFocus) {
  if (!safetyFocus?.title || !Array.isArray(safetyFocus.bullets)) {
    return null;
  }

  const bullets = safetyFocus.bullets.filter((bullet) => typeof bullet === 'string' && bullet.trim());

  if (!bullets.length) {
    return null;
  }

  return {
    id: safetyFocus.id || safetyFocus.slug || 'database-safety-focus',
    title: safetyFocus.title,
    source: safetyFocus.source || 'ReadyRoute safety focus',
    bullets,
    takeaway: safetyFocus.takeaway || null
  };
}

export function getRoutePresentation(status) {
  switch (status) {
    case 'in_progress':
      return {
        badgeLabel: 'In progress',
        badgeStyle: styles.badgeInProgress,
        badgeTextStyle: styles.badgeInProgressText,
        actionLabel: 'Continue Route'
      };
    case 'complete':
      return {
        badgeLabel: 'Complete',
        badgeStyle: styles.badgeComplete,
        badgeTextStyle: styles.badgeCompleteText,
        actionLabel: null
      };
    case 'pending':
    default:
      return {
        badgeLabel: 'Ready to start',
        badgeStyle: styles.badgeReady,
        badgeTextStyle: styles.badgeReadyText,
        actionLabel: 'Acknowledge'
      };
  }
}

export function getRouteSummary(route) {
  if (!route) {
    return [];
  }

  const pickupStopCount = Number(route.pickup_stop_count || route.pickup_stops || route.driver_pickup_stops || 0);
  const completedPickups = Number(route.pickup_stops_completed || route.completed_pickup_stops || 0);

  return [
    route.work_area_name ? `Route ${route.work_area_name}` : null,
    route.vehicle_name || route.vehicle_id ? `Vehicle ${route.vehicle_name || route.vehicle_id}` : null,
    route.stops_per_hour != null ? `${route.stops_per_hour} stops/hr` : null,
    pickupStopCount > 0 ? `${completedPickups}/${pickupStopCount} pickups` : null
  ].filter(Boolean);
}

export function formatMileage(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US') : '0';
}

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

export function getOdometerRequirement(driverDay, route) {
  const requirement = driverDay?.odometer_requirement || null;

  if (!route || !requirement?.required || requirement.submitted) {
    return null;
  }

  const lastRecorded = Number(requirement.last_recorded_odometer ?? route.vehicle?.current_mileage ?? 0);
  const minimum = Number(requirement.minimum_odometer ?? lastRecorded);
  const maximum = Number(requirement.maximum_odometer ?? minimum + 300);

  return {
    ...requirement,
    vehicle_id: requirement.vehicle_id || route.vehicle_id || route.vehicle?.id || null,
    vehicle_name: requirement.vehicle_name || route.vehicle_name || route.vehicle?.name || null,
    last_recorded_odometer: Number.isFinite(lastRecorded) ? lastRecorded : 0,
    minimum_odometer: Number.isFinite(minimum) ? minimum : 0,
    maximum_odometer: Number.isFinite(maximum) ? maximum : 300
  };
}

export function getInspectionRequirement(driverDay, route) {
  const requirement = driverDay?.inspection_requirement || null;

  if (!requirement?.required || requirement.submitted) {
    return null;
  }

  const lastRecorded = Number(requirement.last_recorded_odometer ?? route?.vehicle?.current_mileage ?? 0);
  const minimum = Number(requirement.minimum_odometer ?? lastRecorded);
  const maximum = Number(requirement.maximum_odometer ?? minimum + 300);

  return {
    ...requirement,
    vehicle_id: requirement.vehicle_id || route?.vehicle_id || route?.vehicle?.id || null,
    vehicle_name: requirement.vehicle_name || route?.vehicle_name || route?.vehicle?.name || null,
    inspection_date: requirement.inspection_date || route?.date || getTodayStorageDate(),
    blocks_route_start: requirement.blocks_route_start !== false,
    last_recorded_odometer: Number.isFinite(lastRecorded) ? lastRecorded : 0,
    minimum_odometer: Number.isFinite(minimum) ? minimum : 0,
    maximum_odometer: Number.isFinite(maximum) ? maximum : 300,
    checklist_items: Array.isArray(requirement.checklist_items) ? requirement.checklist_items : []
  };
}

export function getInspectionSubmissionRouteId(requirement, route) {
  if (!requirement) {
    return null;
  }

  if (requirement.assignment_id) {
    return requirement.route_id || null;
  }

  return route?.id || requirement.route_id || null;
}

export function getInspectionForm(requirement) {
  return {
    odometer: '',
    issue_note: '',
    items: (requirement?.checklist_items || []).map(normalizeInspectionChecklistItem)
  };
}

export function getDriverDayStatus(driverDay, route) {
  if (route) {
    return 'dispatched';
  }

  return driverDay?.status || 'unassigned';
}

export function getDriverWaitingCopy(driverDay) {
  const routePreview = driverDay?.route_preview || null;
  const routeLabel = routePreview?.work_area_name ? `Route ${routePreview.work_area_name}` : 'Your route';
  const syncedLine = routePreview?.last_manifest_sync_at
    ? ` ReadyRoute last staged it at ${new Date(routePreview.last_manifest_sync_at).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })}.`
    : '';

  return {
    title: 'Route staged for dispatch',
    body: `${routeLabel} is loaded in ReadyRoute and waiting for your lead manager to dispatch the day.${syncedLine}`
  };
}

export function getPostDispatchChangeNotice(route) {
  const policyCode = route?.post_dispatch_change_policy?.code || 'none';

  if (policyCode === 'manager_review_required') {
    return {
      title: 'Route changed after dispatch',
      body: 'FCC changed this route after it went live and work has already started. Check with your manager before continuing if anything looks different.'
    };
  }

  if (policyCode === 'driver_warning') {
    return {
      title: 'Route updated after dispatch',
      body: 'FCC changed this route after it went live. Review your next stops carefully before heading out.'
    };
  }

  return null;
}

export function hasGrantedLocationPermission(permission) {
  return Boolean(permission?.granted || permission?.status === 'granted');
}

export function getLocationRequirementCopy() {
  return {
    title: 'Enable location for route tracking',
    body: 'ReadyRoute uses your location while you are on route so your manager can see route progress, support dispatch decisions, and locate drivers during the workday.',
    bullets: [
      'Shows your route location to your manager while you are working.',
      'Helps dispatch support pickups, rescues, and route progress.',
      'Keeps the fleet map accurate during the day.'
    ],
    secondary: 'You can manage location access later in your device settings.',
    blocked: 'Location access is required to run a route in ReadyRoute.'
  };
}

export function shouldPromptForLocationPermission(permission) {
  const status = String(permission?.status || '').toLowerCase();
  return !status || status === 'undetermined';
}

export function isBlockedLocationPermission(permission) {
  const status = String(permission?.status || '').toLowerCase();
  return status === 'denied' && !permission?.canAskAgain;
}

export function isDeniedLocationPermission(permission) {
  const status = String(permission?.status || '').toLowerCase();
  return status === 'denied' || (!status && permission?.granted === false);
}

function isUnauthorizedError(error) {
  return error?.response?.status === 401;
}

export default function HomeScreen({ navigation, onLogout }) {
  const isMountedRef = useRef(true);
  const activeBreakTimerRef = useRef(null);
  const [route, setRoute] = useState(null);
  const [clockedInAt, setClockedInAt] = useState(null);
  const [activeBreak, setActiveBreak] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingRoute, setIsStartingRoute] = useState(false);
  const [isSubmittingOdometer, setIsSubmittingOdometer] = useState(false);
  const [isSubmittingInspection, setIsSubmittingInspection] = useState(false);
  const [odometerInput, setOdometerInput] = useState('');
  const [odometerError, setOdometerError] = useState('');
  const [inspectionForm, setInspectionForm] = useState(null);
  const [inspectionError, setInspectionError] = useState('');
  const [isUploadingInspectionPhotoKey, setIsUploadingInspectionPhotoKey] = useState(null);
  const [isUpdatingClock, setIsUpdatingClock] = useState(false);
  const [isUpdatingBreak, setIsUpdatingBreak] = useState(false);
  const [isRetryingLoad, setIsRetryingLoad] = useState(false);
  const [isResolvingLocationPermission, setIsResolvingLocationPermission] = useState(false);
  const [hasLocationAccess, setHasLocationAccess] = useState(false);
  const [isLocationPermissionBlocked, setIsLocationPermissionBlocked] = useState(false);
  const [isLocationPermissionDenied, setIsLocationPermissionDenied] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [driverDay, setDriverDay] = useState({ status: 'unknown' });
  const [databaseSafetyFocus, setDatabaseSafetyFocus] = useState(null);

  async function ensureLocationPermission({ showAlert = false } = {}) {
    setIsResolvingLocationPermission(true);

    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      const permission = shouldPromptForLocationPermission(currentPermission)
        ? await Location.requestForegroundPermissionsAsync()
        : currentPermission;
      const granted = hasGrantedLocationPermission(permission);
      const blocked = isBlockedLocationPermission(permission);

      if (isMountedRef.current) {
        setHasLocationAccess(granted);
        setIsLocationPermissionBlocked(blocked);
        setIsLocationPermissionDenied(!granted && isDeniedLocationPermission(permission));
      }

      if (!granted && showAlert) {
        const copy = getLocationRequirementCopy();
        Alert.alert('Location required', copy.blocked, [
          {
            text: 'Not now',
            style: 'cancel'
          },
          {
            text: 'Open Settings',
            onPress: () => {
              Linking.openSettings?.().catch(() => {});
            }
          }
        ]);
      }

      return granted;
    } catch (_error) {
      if (isMountedRef.current) {
        setHasLocationAccess(false);
        setIsLocationPermissionBlocked(false);
        setIsLocationPermissionDenied(false);
      }

      if (showAlert) {
        Alert.alert('Location required', getLocationRequirementCopy().blocked);
      }

      return false;
    } finally {
      if (isMountedRef.current) {
        setIsResolvingLocationPermission(false);
      }
    }
  }

  async function checkLocationPermission() {
    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();

      if (isMountedRef.current) {
        setHasLocationAccess(hasGrantedLocationPermission(currentPermission));
        setIsLocationPermissionBlocked(isBlockedLocationPermission(currentPermission));
        setIsLocationPermissionDenied(isDeniedLocationPermission(currentPermission));
      }
    } catch (_error) {
      if (isMountedRef.current) {
        setHasLocationAccess(false);
        setIsLocationPermissionBlocked(false);
        setIsLocationPermissionDenied(false);
      }
    }
  }

  async function loadHomeData({ showAlert = true, isRetry = false } = {}) {
    if (isRetry && isMountedRef.current) {
      setIsRetryingLoad(true);
    }

    try {
      const routeRequest = api.get('/routes/today', {
        params: {
          view: 'summary'
        }
      }).then((response) => {
        if (response.data?.route?.id) {
          Promise.resolve(prefetchDriverManifest()).catch(() => {});
          Promise.resolve(prefetchDriverDriveRoute()).catch(() => {});
        }

        return response;
      });
      const [routeResponse, timecardStatusResponse, safetyFocusResponse] = await Promise.all([
        routeRequest,
        api.get('/timecards/status'),
        api.get('/safety-focuses/today').catch(() => null)
      ]);

      if (!isMountedRef.current) {
        return;
      }

      const timecardStatus = timecardStatusResponse;
      const activeTimecard = timecardStatus?.data?.active_timecard || null;
      const activeBreakState = timecardStatus?.data?.active_break || null;
      const resolvedClockIn = activeTimecard?.clock_in || null;
      const nextRoute = routeResponse.data?.route || null;
      const nextDriverDay = routeResponse.data?.driver_day || {
        status: nextRoute ? 'dispatched' : 'unassigned'
      };

      Promise.resolve(saveDriverRouteSummary(routeResponse.data || {})).catch(() => {});

      setClockedInAt(resolvedClockIn);
      setActiveBreak(activeBreakState);
      setRoute(nextRoute);
      setDriverDay(nextDriverDay);
      setDatabaseSafetyFocus(normalizeSafetyFocusResponse(safetyFocusResponse?.data?.safety_focus));
      setLoadError(null);

      if (resolvedClockIn) {
        Promise.resolve(saveClockInTime(resolvedClockIn)).catch(() => {});
      } else {
        Promise.resolve(removeClockInTime()).catch(() => {});
      }

      Promise.resolve(loadStatusCodes()).catch(() => {});
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      if (isUnauthorizedError(error)) {
        await removeClockInTime();
        await removeToken();
        onLogout();
        return;
      }

      const message = getApiErrorMessage(error, 'Unable to load your route right now.');
      setLoadError(message);
      if (showAlert) {
        Alert.alert('Could not load home screen', message);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRetryingLoad(false);
      }
    }
  }

  useEffect(() => {
    checkLocationPermission();
    loadHomeData();

    return () => {
      isMountedRef.current = false;
      if (activeBreakTimerRef.current) {
        clearTimeout(activeBreakTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadHomeData({ showAlert: false });
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const driverDayStatus = getDriverDayStatus(driverDay, route);

    if (driverDayStatus !== 'awaiting_dispatch') {
      return undefined;
    }

    const interval = setInterval(() => {
      loadHomeData({ showAlert: false });
    }, 30000);

    return () => clearInterval(interval);
  }, [driverDay, route]);

  useEffect(() => {
    if (activeBreakTimerRef.current) {
      clearTimeout(activeBreakTimerRef.current);
      activeBreakTimerRef.current = null;
    }

    const autoEndAt = getBreakAutoEndTimestamp(activeBreak);

    if (!autoEndAt) {
      return undefined;
    }

    const remainingMs = new Date(autoEndAt).getTime() - Date.now();

    if (!Number.isFinite(remainingMs)) {
      return undefined;
    }

    if (remainingMs <= 0) {
      loadHomeData({ showAlert: false });
      return undefined;
    }

    activeBreakTimerRef.current = setTimeout(() => {
      loadHomeData({ showAlert: false });
    }, remainingMs + 250);

    return () => {
      if (activeBreakTimerRef.current) {
        clearTimeout(activeBreakTimerRef.current);
        activeBreakTimerRef.current = null;
      }
    };
  }, [activeBreak]);

  useEffect(() => {
    const requirement = getInspectionRequirement(driverDay, route);

    if (!requirement) {
      setInspectionForm(null);
      setInspectionError('');
      return;
    }

    setInspectionForm((current) => {
      const inspectionRouteId = getInspectionSubmissionRouteId(requirement, route);
      const sameRequirement = current
        && current.route_id === inspectionRouteId
        && current.assignment_id === (requirement.assignment_id || null)
        && current.vehicle_id === requirement.vehicle_id
        && current.inspection_date === requirement.inspection_date;

      return sameRequirement
          ? current
          : {
              ...getInspectionForm(requirement),
              route_id: inspectionRouteId,
              assignment_id: requirement.assignment_id || null,
              vehicle_id: requirement.vehicle_id || null,
              inspection_date: requirement.inspection_date || null
            };
    });
    setInspectionError('');
  }, [driverDay, route]);

  async function handleRetryLoad() {
    setIsRetryingLoad(true);
    await loadHomeData({ showAlert: false, isRetry: true });
  }

  async function handleLogout() {
    await removeClockInTime();
    await removeToken();
    onLogout();
  }

  async function continueIntoRouteWorkflow() {
    if (!route) {
      return;
    }

    if (route.status === 'in_progress') {
      navigation.navigate('MyDrive');
      return;
    }

    if (route.status !== 'pending') {
      return;
    }

    setIsStartingRoute(true);

    try {
      await api.patch(`/routes/${route.id}/status`, {
        status: 'in_progress'
      });

      const nextRoute = {
        ...route,
        status: 'in_progress'
      };

      setRoute(nextRoute);
      navigation.navigate('MyDrive');
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to start your route right now.');
      Alert.alert('Could not start route', message);
    } finally {
      setIsStartingRoute(false);
    }
  }

  async function handleRouteAction() {
    if (!route) {
      return;
    }

    const hasPermission = await ensureLocationPermission({ showAlert: true });

    if (!hasPermission) {
      return;
    }

    const requirement = getOdometerRequirement(driverDay, route);
    if (requirement) {
      setOdometerError('Enter the current truck odometer before continuing.');
      return;
    }

    const inspectionRequirement = getInspectionRequirement(driverDay, route);
    if (inspectionRequirement && inspectionRequirement.blocks_route_start !== false) {
      setInspectionError('Complete the required vehicle inspection before continuing.');
      return;
    }

    await continueIntoRouteWorkflow();
  }

  function patchInspectionItem(itemKey, updater) {
    setInspectionForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item) => (
          item.checklist_item_key === itemKey
            ? updater(item)
            : item
        ))
      };
    });
    setInspectionError('');
  }

  function updateInspectionItemStatus(itemKey, status) {
    patchInspectionItem(itemKey, (item) => {
      if (status === 'pass') {
        return {
          ...item,
          status: 'pass',
          severity: null,
          issue_details: {},
          note: '',
          photos: []
        };
      }

      return {
        ...item,
        status: 'issue',
        severity: item.severity || null,
        issue_details: item.issue_details || {},
        photos: item.photos || []
      };
    });
  }

  function updateTruckCleanliness(itemKey, condition) {
    const option = INSPECTION_ITEM_DEFINITIONS.truck_cleanliness.conditionOptions
      .find((candidate) => candidate.value === condition);

    if (!option) {
      return;
    }

    patchInspectionItem(itemKey, (item) => ({
      ...item,
      status: option.status,
      severity: option.status === 'issue' ? item.severity : null,
      issue_details: option.status === 'issue' ? { condition: option.label } : {},
      note: option.status === 'issue' ? item.note : '',
      photos: option.status === 'issue' ? (item.photos || []) : []
    }));
  }

  function updateInspectionIssueDetail(itemKey, field, option) {
    patchInspectionItem(itemKey, (item) => {
      const currentDetails = item.issue_details || {};
      const currentValue = currentDetails[field.key];
      let nextValue = option;

      if (field.type === 'multi') {
        const currentArray = Array.isArray(currentValue) ? currentValue : [];
        nextValue = currentArray.includes(option)
          ? currentArray.filter((value) => value !== option)
          : [...currentArray, option];
      }

      return {
        ...item,
        issue_details: {
          ...currentDetails,
          [field.key]: nextValue
        }
      };
    });
  }

  function updateInspectionItemSeverity(itemKey, severity) {
    patchInspectionItem(itemKey, (item) => ({
      ...item,
      severity
    }));
  }

  function updateInspectionItemNote(itemKey, note) {
    patchInspectionItem(itemKey, (item) => ({
      ...item,
      note
    }));
  }

  function removeInspectionPhoto(itemKey, photoIndex) {
    patchInspectionItem(itemKey, (item) => ({
      ...item,
      photos: (item.photos || []).filter((_photo, index) => index !== photoIndex)
    }));
  }

  async function handleAttachInspectionPhoto(itemKey) {
    const requirement = getInspectionRequirement(driverDay, route);

    if (!requirement || (!route?.id && !requirement.assignment_id)) {
      return;
    }

    setIsUploadingInspectionPhotoKey(itemKey);
    setInspectionError('');

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission?.granted) {
        setInspectionError('Allow photo access to attach an inspection photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        base64: true,
        mediaTypes: ImagePicker.MediaTypeOptions?.Images || 'images',
        quality: 0.7
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];

      if (!asset?.base64) {
        setInspectionError('Could not read that photo. Try a different image.');
        return;
      }

      const inspectionRouteId = getInspectionSubmissionRouteId(requirement, route);
      const response = await api.post('/routes/inspection-photo', {
        ...(inspectionRouteId ? { route_id: inspectionRouteId } : {}),
        ...(requirement.assignment_id ? { assignment_id: requirement.assignment_id } : {}),
        vehicle_id: requirement.vehicle_id,
        checklist_item_key: itemKey,
        image_base64: asset.base64,
        mime_type: asset.mimeType || 'image/jpeg',
        file_name: asset.fileName || `${itemKey}.jpg`
      });
      const photo = response.data?.photo || null;

      if (!photo) {
        setInspectionError('Photo uploaded, but ReadyRoute did not return the photo details.');
        return;
      }

      patchInspectionItem(itemKey, (item) => ({
        ...item,
        photos: [...(item.photos || []), photo]
      }));
    } catch (error) {
      setInspectionError(getApiErrorMessage(error, 'Unable to attach this photo right now.'));
    } finally {
      setIsUploadingInspectionPhotoKey(null);
    }
  }

  async function handleSubmitInspection() {
    const requirement = getInspectionRequirement(driverDay, route);
    if (!requirement) {
      if (route) {
        await continueIntoRouteWorkflow();
      }
      return;
    }

    const parsedOdometer = Number(inspectionForm?.odometer);

    if (!Number.isInteger(parsedOdometer)) {
      setInspectionError('Enter the current odometer reading as a whole number.');
      return;
    }

    if (parsedOdometer < requirement.minimum_odometer || parsedOdometer > requirement.maximum_odometer) {
      setInspectionError('Odometer reading is outside the allowed range. Please recheck the truck odometer or contact your manager.');
      return;
    }

    if (!inspectionForm?.items?.length) {
      setInspectionError('Inspection checklist is not available. Contact your manager before starting the route.');
      return;
    }

    const validationError = getInspectionFormValidationError(inspectionForm);

    if (validationError) {
      setInspectionError(validationError);
      return;
    }

    setIsSubmittingInspection(true);
    setInspectionError('');

    try {
      const inspectionRouteId = getInspectionSubmissionRouteId(requirement, route);
      const response = await api.post('/routes/inspection', {
        vehicle_id: requirement.vehicle_id,
        ...(inspectionRouteId ? { route_id: inspectionRouteId } : {}),
        ...(requirement.assignment_id ? { assignment_id: requirement.assignment_id } : {}),
        inspection_date: requirement.inspection_date,
        odometer: parsedOdometer,
        issue_note: inspectionForm.issue_note || '',
        items: serializeInspectionItems(inspectionForm.items)
      });
      const inspection = response.data?.inspection || {
        odometer: parsedOdometer
      };

      setDriverDay((current) => ({
        ...current,
        inspection_requirement: {
          ...(current?.inspection_requirement || {}),
          submitted: true,
          latest_inspection: inspection
        },
        odometer_requirement: {
          ...(current?.odometer_requirement || {}),
          submitted: true,
          latest_entry: {
            odometer_reading: parsedOdometer
          }
        }
      }));
      setRoute((current) => current
        ? {
            ...current,
            vehicle: current.vehicle
              ? { ...current.vehicle, current_mileage: parsedOdometer }
              : current.vehicle,
            vehicle_current_mileage: parsedOdometer
          }
        : current);
      setInspectionForm(null);
      const statusLabel = inspection.urgent_review
        ? 'Urgent Manager Review'
        : inspection.manager_review_required
          ? 'Manager Review Required'
          : inspection.status === 'safe_with_maintenance_reported'
            ? 'Safe with Maintenance Reported'
            : 'Safe to Operate';
      Alert.alert(
        'Vehicle Inspection Complete',
        `Vehicle: ${requirement.vehicle_name || requirement.vehicle_id || 'Selected vehicle'}\nStatus: ${statusLabel}`
      );
      if (route && requirement.blocks_route_start !== false) {
        await continueIntoRouteWorkflow();
      } else {
        await loadHomeData({ showAlert: false });
      }
    } catch (error) {
      setInspectionError(getApiErrorMessage(error, 'Unable to save this inspection right now.'));
    } finally {
      setIsSubmittingInspection(false);
    }
  }

  async function handleSubmitOdometer() {
    if (!route) {
      return;
    }

    const requirement = getOdometerRequirement(driverDay, route);
    if (!requirement) {
      await continueIntoRouteWorkflow();
      return;
    }

    const parsedOdometer = Number(odometerInput);

    if (!Number.isInteger(parsedOdometer)) {
      setOdometerError('Enter the current odometer reading as a whole number.');
      return;
    }

    if (parsedOdometer < requirement.minimum_odometer || parsedOdometer > requirement.maximum_odometer) {
      setOdometerError('Odometer reading is outside the allowed range. Please recheck the truck odometer or contact your manager.');
      return;
    }

    setIsSubmittingOdometer(true);
    setOdometerError('');

    try {
      await api.post('/routes/odometer', {
        vehicle_id: requirement.vehicle_id,
        route_id: route.id,
        odometer_reading: parsedOdometer
      });

      setDriverDay((current) => ({
        ...current,
        odometer_requirement: {
          ...(current?.odometer_requirement || {}),
          submitted: true,
          latest_entry: {
            odometer_reading: parsedOdometer
          }
        }
      }));
      setRoute((current) => current
        ? {
            ...current,
            vehicle: current.vehicle
              ? { ...current.vehicle, current_mileage: parsedOdometer }
              : current.vehicle,
            vehicle_current_mileage: parsedOdometer
          }
        : current);
      setOdometerInput('');
      await continueIntoRouteWorkflow();
    } catch (error) {
      setOdometerError(getApiErrorMessage(error, 'Odometer reading is outside the allowed range. Please recheck the truck odometer or contact your manager.'));
    } finally {
      setIsSubmittingOdometer(false);
    }
  }

  async function handleClockToggle() {
    if (!clockedInAt) {
      const hasPermission = await ensureLocationPermission({ showAlert: true });

      if (!hasPermission) {
        return;
      }
    }

    if (!route && !clockedInAt) {
      Alert.alert('No route assigned', 'You need a route assigned today before clocking in.');
      return;
    }

    setIsUpdatingClock(true);

    try {
      if (clockedInAt) {
        await api.post('/timecards/clock-out');
        await removeClockInTime();
        setClockedInAt(null);
        setActiveBreak(null);
      } else {
        const response = await api.post('/timecards/clock-in', {
          route_id: route.id
        });
        const timestamp = response.data?.clock_in_at || new Date().toISOString();
        await saveClockInTime(timestamp);
        setClockedInAt(timestamp);
      }
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to update clock status right now.');
      Alert.alert('Clock update failed', message);
    } finally {
      setIsUpdatingClock(false);
    }
  }

  function handleBreakToggle() {
    if (!clockedInAt) {
      Alert.alert('Clock in first', 'Drivers need to clock in before starting a break or lunch.');
      return;
    }

    if (activeBreak) {
      endActiveBreak();
      return;
    }

    Alert.alert('Start break', 'Choose the type of break you are taking.', [
      {
        text: 'Rest break',
        onPress: () => startBreak('rest')
      },
      {
        text: 'Lunch',
        onPress: () => startBreak('lunch')
      },
      {
        text: 'Cancel',
        style: 'cancel'
      }
    ]);
  }

  async function startBreak(breakType) {
    setIsUpdatingBreak(true);

    try {
      const response = await api.post('/timecards/breaks/start', {
        break_type: breakType
      });
      setActiveBreak(response.data?.active_break || null);
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to start break right now.');
      Alert.alert('Break update failed', message);
    } finally {
      setIsUpdatingBreak(false);
    }
  }

  async function endActiveBreak() {
    setIsUpdatingBreak(true);

    try {
      await api.post('/timecards/breaks/end');
      setActiveBreak(null);
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to end break right now.');
      Alert.alert('Break update failed', message);
    } finally {
      setIsUpdatingBreak(false);
    }
  }

  const friendlyDate = getFriendlyDate();
  const routePresentation = route ? getRoutePresentation(route.status) : null;
  const routeSummary = getRouteSummary(route);
  const driverDayStatus = getDriverDayStatus(driverDay, route);
  const waitingCopy = getDriverWaitingCopy(driverDay);
  const postDispatchNotice = getPostDispatchChangeNotice(route);
  const odometerRequirement = getOdometerRequirement(driverDay, route);
  const inspectionRequirement = getInspectionRequirement(driverDay, route);
  const isManualInspectionAssignment = inspectionRequirement?.reason === 'manual_assignment';
  const isInspectionBlockingRoute = Boolean(inspectionRequirement && inspectionRequirement.blocks_route_start !== false);
  const canShowInspectionRequirement = Boolean(inspectionRequirement && (hasLocationAccess || !route || !isInspectionBlockingRoute));
  const parsedOdometerValue = odometerInput.length > 0 ? Number(odometerInput) : null;
  const isOdometerInRange = parsedOdometerValue !== null && odometerRequirement
    ? parsedOdometerValue >= odometerRequirement.minimum_odometer && parsedOdometerValue <= odometerRequirement.maximum_odometer
    : true;
  const isOdometerSubmittable = parsedOdometerValue !== null && isOdometerInRange;
  const odometerRangeHint = parsedOdometerValue !== null && odometerInput.length >= 4 && !isOdometerInRange
    ? 'Value is outside the accepted range.'
    : '';
  const locationRequirementCopy = getLocationRequirementCopy();
  const showLocationGate = Boolean(route && !hasLocationAccess);
  const locationPermissionDenied = isLocationPermissionBlocked || isLocationPermissionDenied;
  const locationButtonLabel = locationPermissionDenied ? 'Open Settings' : 'Enable Location';
  const breakButtonLabel = activeBreak ? `End ${formatBreakLabel(activeBreak.break_type)}` : 'Break';
  const fallbackDailyReminder = useMemo(() => getDailySafetyReminder(new Date()), []);
  const dailyReminder = databaseSafetyFocus || fallbackDailyReminder;
  const parsedInspectionOdometerValue = inspectionForm?.odometer?.length > 0 ? Number(inspectionForm.odometer) : null;
  const inspectionProgress = getInspectionProgress(inspectionForm);
  const inspectionSections = getInspectionSectionsForItems(inspectionForm?.items || []);
  const inspectionValidationError = getInspectionFormValidationError(inspectionForm);
  const isInspectionOdometerInRange = parsedInspectionOdometerValue !== null && inspectionRequirement
    ? parsedInspectionOdometerValue >= inspectionRequirement.minimum_odometer && parsedInspectionOdometerValue <= inspectionRequirement.maximum_odometer
    : true;
  const isInspectionSubmittable = Boolean(
    inspectionForm?.items?.length
      && parsedInspectionOdometerValue !== null
      && isInspectionOdometerInRange
      && !inspectionValidationError
  );
  const inspectionRangeHint = parsedInspectionOdometerValue !== null
    && inspectionForm?.odometer?.length >= 4
    && !isInspectionOdometerInRange
    ? 'Value is outside the accepted range.'
    : '';

  function renderInspectionChip({
    accessibilityLabel,
    label,
    onPress,
    selected,
    variant = 'neutral'
  }) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel || label}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.inspectionChip,
          selected && styles.inspectionChipSelected,
          selected && variant === 'pass' ? styles.inspectionChipPass : null,
          selected && variant === 'issue' ? styles.inspectionChipIssue : null,
          selected && variant === 'unsafe' ? styles.inspectionChipUnsafe : null,
          pressed ? styles.buttonPressed : null
        ]}
      >
        <Text
          style={[
            styles.inspectionChipText,
            selected && styles.inspectionChipTextSelected,
            selected && variant === 'pass' ? styles.inspectionChipTextPass : null,
            selected && variant === 'issue' ? styles.inspectionChipTextIssue : null,
            selected && variant === 'unsafe' ? styles.inspectionChipTextUnsafe : null
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  function renderInspectionIssueField(item, field) {
    const currentValue = item.issue_details?.[field.key];

    return (
      <View key={field.key} style={styles.inspectionIssueGroup}>
        <Text style={styles.inspectionIssueLabel}>{field.label}</Text>
        <View style={styles.inspectionChipWrap}>
          {field.options.map((option) => {
            const selected = field.type === 'multi'
              ? Array.isArray(currentValue) && currentValue.includes(option)
              : currentValue === option;

            return (
              <View key={option}>
                {renderInspectionChip({
                  label: option,
                  selected,
                  variant: selected ? 'issue' : 'neutral',
                  onPress: () => updateInspectionIssueDetail(item.checklist_item_key, field, option)
                })}
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  function renderInspectionSeverity(item) {
    return (
      <View style={styles.inspectionIssueGroup}>
        <Text style={styles.inspectionIssueLabel}>Severity</Text>
        <View style={styles.inspectionChipWrap}>
          {INSPECTION_SEVERITY_OPTIONS.map((option) => (
            <View key={option.value}>
              {renderInspectionChip({
                label: option.label,
                selected: item.severity === option.value,
                variant: option.value === 'unsafe' ? 'unsafe' : 'issue',
                onPress: () => updateInspectionItemSeverity(item.checklist_item_key, option.value)
              })}
            </View>
          ))}
        </View>
      </View>
    );
  }

  function renderInspectionPhotos(item) {
    const photos = item.photos || [];
    const isUploading = isUploadingInspectionPhotoKey === item.checklist_item_key;

    return (
      <View style={styles.inspectionIssueGroup}>
        <Text style={styles.inspectionIssueLabel}>Photo</Text>
        {photos.length ? (
          <View style={styles.inspectionPhotoList}>
            {photos.map((photo, index) => (
              <View key={photo.storage_path || photo.url || `${item.checklist_item_key}-${index}`} style={styles.inspectionPhotoPill}>
                <Text style={styles.inspectionPhotoText}>Photo {index + 1} attached</Text>
                <Pressable
                  accessibilityLabel={`Remove photo ${index + 1} from ${item.label}`}
                  onPress={() => removeInspectionPhoto(item.checklist_item_key, index)}
                >
                  <Text style={styles.inspectionPhotoRemove}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <Pressable
          accessibilityLabel={`Attach photo for ${item.label}`}
          disabled={isUploading}
          onPress={() => handleAttachInspectionPhoto(item.checklist_item_key)}
          style={({ pressed }) => [
            styles.inspectionPhotoButton,
            isUploading && styles.buttonDisabled,
            pressed && !isUploading ? styles.buttonPressed : null
          ]}
        >
          {isUploading ? (
            <ActivityIndicator color={appTheme.colors.orangeDeep} />
          ) : (
            <Text style={styles.inspectionPhotoButtonText}>{photos.length ? 'Add Another Photo' : 'Attach Photo'}</Text>
          )}
        </Pressable>
      </View>
    );
  }

  function renderInspectionItem(item) {
    const definition = getInspectionItemDefinition(item);
    const isIssue = item.status === 'issue';
    const isPass = item.status === 'pass';
    const itemStatusStyle = isIssue
      ? styles.inspectionChecklistRowIssue
      : isPass
        ? styles.inspectionChecklistRowPass
        : styles.inspectionChecklistRowNeutral;
    const selectedCleanlinessCondition = item.status === 'pass'
      ? 'clean'
      : normalizeInspectionItemKey(item.issue_details?.condition);

    return (
      <View key={item.checklist_item_key} style={[styles.inspectionChecklistRow, itemStatusStyle]}>
        <View style={[
          styles.inspectionChecklistHeader,
          item.checklist_item_key === 'truck_cleanliness' ? styles.inspectionChecklistHeaderStacked : null
        ]}>
          <View style={styles.inspectionChecklistCopy}>
            <Text style={styles.inspectionChecklistText}>{item.label}</Text>
            <Text style={styles.inspectionChecklistStatus}>
              {isIssue ? 'Issue marked' : isPass ? 'Passed' : 'Not answered'}
            </Text>
          </View>

          {item.checklist_item_key === 'truck_cleanliness' ? (
            <View style={[styles.inspectionChipWrap, styles.inspectionChipWrapFull]}>
              {definition.conditionOptions.map((option) => (
                <View key={option.value}>
                  {renderInspectionChip({
                    accessibilityLabel: `Mark truck cleanliness ${option.label}`,
                    label: option.label,
                    selected: selectedCleanlinessCondition === option.value,
                    variant: option.status === 'pass' ? 'pass' : 'issue',
                    onPress: () => updateTruckCleanliness(item.checklist_item_key, option.value)
                  })}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.inspectionStatusActions}>
              {renderInspectionChip({
                accessibilityLabel: `Mark ${item.label} passed`,
                label: 'Pass',
                selected: isPass,
                variant: 'pass',
                onPress: () => updateInspectionItemStatus(item.checklist_item_key, 'pass')
              })}
              {renderInspectionChip({
                accessibilityLabel: `Mark ${item.label} has an issue`,
                label: 'Issue',
                selected: isIssue,
                variant: 'issue',
                onPress: () => updateInspectionItemStatus(item.checklist_item_key, 'issue')
              })}
            </View>
          )}
        </View>

        {isIssue ? (
          <View style={styles.inspectionIssuePanel}>
            {(definition.issueFields || []).map((field) => renderInspectionIssueField(item, field))}
            {renderInspectionSeverity(item)}
            {renderInspectionPhotos(item)}
            <TextInput
              multiline
              onChangeText={(value) => updateInspectionItemNote(item.checklist_item_key, value)}
              placeholder="Optional notes"
              placeholderTextColor={appTheme.colors.textMuted}
              style={styles.inspectionItemNoteInput}
              textAlignVertical="top"
              value={item.note || ''}
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={appTheme.colors.orange} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && !route) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <Text style={styles.emptyTitle}>Home screen unavailable</Text>
          <Text style={styles.emptyText}>{loadError}</Text>
          <Pressable
            disabled={isRetryingLoad}
            onPress={handleRetryLoad}
            style={({ pressed }) => [
              styles.retryButton,
              isRetryingLoad && styles.buttonDisabled,
              pressed && !isRetryingLoad ? styles.buttonPressed : null
            ]}
          >
            {isRetryingLoad ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.retryButtonText}>Retry</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.mainContent}>
            <View style={styles.topRow}>
              <View style={styles.topRowText}>
                <Text style={styles.dateText}>{friendlyDate}</Text>
              </View>
              <Pressable onPress={handleLogout} style={styles.logoutButton}>
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>
            </View>

            {showLocationGate ? (
              <View style={styles.locationGateCard}>
                <Text style={styles.locationGateTitle}>{locationRequirementCopy.title}</Text>
                <Text style={styles.locationGateBody}>{locationRequirementCopy.body}</Text>
                <View style={styles.locationGateBullets}>
                  {locationRequirementCopy.bullets.map((bullet) => (
                    <View key={bullet} style={styles.locationGateBulletRow}>
                      <Text style={styles.locationGateBulletDot}>•</Text>
                      <Text style={styles.locationGateBulletText}>{bullet}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.locationGateSecondary}>
                  {locationPermissionDenied ? locationRequirementCopy.blocked : locationRequirementCopy.secondary}
                </Text>
                <Pressable
                  onPress={() => {
                    if (locationPermissionDenied) {
                      Linking.openSettings?.().catch(() => {});
                      return;
                    }

                    ensureLocationPermission({ showAlert: true });
                  }}
                  style={({ pressed }) => [
                    styles.locationGateButton,
                    isResolvingLocationPermission && styles.buttonDisabled,
                    pressed && !isResolvingLocationPermission ? styles.buttonPressed : null
                  ]}
                >
                  {isResolvingLocationPermission ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.locationGateButtonText}>{locationButtonLabel}</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            <View style={styles.safetyCard}>
              <View style={styles.safetyCardHeader}>
                <Text style={styles.safetyEyebrow}>Today&apos;s safety focus</Text>
              </View>

              <Text style={styles.safetyTitle}>{dailyReminder.title}</Text>
              <Text style={styles.safetySource}>{dailyReminder.source}</Text>

              <View style={styles.safetyBulletList}>
                {dailyReminder.bullets.map((bullet) => (
                  <View key={bullet} style={styles.safetyBulletRow}>
                    <Text style={styles.safetyBulletDot}>•</Text>
                    <Text style={styles.safetyBullet}>{bullet}</Text>
                  </View>
                ))}
              </View>

              {dailyReminder.takeaway ? (
                <Text style={styles.safetyTakeaway}>{dailyReminder.takeaway}</Text>
              ) : null}

              {route ? (
                <View style={styles.routeMetaRow}>
                  {routeSummary.map((item) => (
                    <View key={item} style={styles.routeMetaChip}>
                      <Text style={styles.routeMetaSecondary}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.inlineEmptyState}>
                  <Text style={styles.inlineEmptyTitle}>
                    {driverDayStatus === 'awaiting_dispatch' ? waitingCopy.title : 'No route assigned yet'}
                  </Text>
                  <Text style={styles.inlineEmptyBody}>
                    {driverDayStatus === 'awaiting_dispatch'
                      ? waitingCopy.body
                      : 'Your manager still needs to assign today&apos;s route.'}
                  </Text>
                </View>
              )}
            </View>

            {postDispatchNotice ? (
              <View style={styles.inlineNoticeState}>
                <Text style={styles.inlineNoticeTitle}>{postDispatchNotice.title}</Text>
                <Text style={styles.inlineNoticeBody}>{postDispatchNotice.body}</Text>
              </View>
            ) : null}

            {canShowInspectionRequirement ? (
              <View style={styles.inspectionCard}>
                <Text style={styles.inspectionEyebrow}>
                  {isManualInspectionAssignment
                    ? 'Assigned by manager'
                    : 'Required before route start'}
                </Text>
                <Text style={styles.inspectionTitle}>{inspectionRequirement.label || 'Weekly vehicle inspection'}</Text>
                <Text style={styles.inspectionBody}>
                  {isManualInspectionAssignment
                    ? `Complete the inspection for ${inspectionRequirement.vehicle_name || inspectionRequirement.vehicle_id || 'this vehicle'}.`
                    : `Complete the inspection for ${inspectionRequirement.vehicle_name || inspectionRequirement.vehicle_id || 'this vehicle'} before route actions unlock.`}
                </Text>
                {inspectionRequirement.assignment_note ? (
                  <Text style={styles.inspectionBody}>{inspectionRequirement.assignment_note}</Text>
                ) : null}
                <View style={styles.odometerDetailGrid}>
                  <View style={styles.odometerDetail}>
                    <Text style={styles.odometerDetailLabel}>Last recorded</Text>
                    <Text style={styles.odometerDetailValue}>{formatMileage(inspectionRequirement.last_recorded_odometer)}</Text>
                  </View>
                  <View style={styles.odometerDetail}>
                    <Text style={styles.odometerDetailLabel}>Acceptable range</Text>
                    <Text style={styles.odometerDetailValue}>
                      {formatMileage(inspectionRequirement.minimum_odometer)} to {formatMileage(inspectionRequirement.maximum_odometer)}
                    </Text>
                  </View>
                </View>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(value) => {
                    setInspectionForm((current) => current
                      ? { ...current, odometer: value.replace(/[^\d]/g, '') }
                      : current);
                    setInspectionError('');
                  }}
                  placeholder="Current odometer reading"
                  placeholderTextColor={appTheme.colors.textMuted}
                  style={styles.odometerInput}
                  value={inspectionForm?.odometer || ''}
                />

                <View style={styles.inspectionProgressPanel}>
                  <View>
                    <Text style={styles.inspectionProgressValue}>
                      {inspectionProgress.completedCount} of {inspectionProgress.total} completed
                    </Text>
                    <Text style={styles.inspectionProgressLabel}>
                      {inspectionProgress.remainingCount} {inspectionProgress.remainingCount === 1 ? 'item' : 'items'} remaining
                    </Text>
                  </View>
                  <View style={styles.inspectionIssueCountPill}>
                    <Text style={styles.inspectionIssueCountText}>{inspectionProgress.issueCount} issues</Text>
                  </View>
                </View>

                <View style={styles.inspectionChecklist}>
                  {inspectionSections.map((section) => (
                    <View key={section.id} style={styles.inspectionSection}>
                      <Text style={styles.inspectionSectionTitle}>{section.title}</Text>
                      <View style={styles.inspectionSectionItems}>
                        {section.items.map((item) => renderInspectionItem(item))}
                      </View>
                    </View>
                  ))}
                </View>

                <TextInput
                  multiline
                  onChangeText={(value) => {
                    setInspectionForm((current) => current
                      ? { ...current, issue_note: value }
                      : current);
                    setInspectionError('');
                  }}
                  placeholder="Notes for any issue or inspection detail"
                  placeholderTextColor={appTheme.colors.textMuted}
                  style={styles.inspectionNoteInput}
                  textAlignVertical="top"
                  value={inspectionForm?.issue_note || ''}
                />
                {inspectionRangeHint && !inspectionError ? <Text style={styles.odometerError}>{inspectionRangeHint}</Text> : null}
                {inspectionError ? <Text style={styles.odometerError}>{inspectionError}</Text> : null}
                <Pressable
                  accessibilityLabel="Complete vehicle inspection"
                  disabled={isSubmittingInspection || !isInspectionSubmittable}
                  onPress={handleSubmitInspection}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.startRouteButton,
                    (isSubmittingInspection || !isInspectionSubmittable) && styles.buttonDisabled,
                    pressed && !isSubmittingInspection && isInspectionSubmittable ? styles.buttonPressed : null
                  ]}
                >
                  {isSubmittingInspection ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Complete Inspection</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {odometerRequirement && !isInspectionBlockingRoute && hasLocationAccess ? (
              <View style={styles.odometerCard}>
                <Text style={styles.odometerEyebrow}>Required before route start</Text>
                <Text style={styles.odometerTitle}>Enter truck odometer</Text>
                <Text style={styles.odometerBody}>
                  {odometerRequirement.vehicle_name || odometerRequirement.vehicle_id || 'Selected vehicle'}
                </Text>
                <View style={styles.odometerDetailGrid}>
                  <View style={styles.odometerDetail}>
                    <Text style={styles.odometerDetailLabel}>Last recorded</Text>
                    <Text style={styles.odometerDetailValue}>{formatMileage(odometerRequirement.last_recorded_odometer)}</Text>
                  </View>
                  <View style={styles.odometerDetail}>
                    <Text style={styles.odometerDetailLabel}>Acceptable range</Text>
                    <Text style={styles.odometerDetailValue}>
                      {formatMileage(odometerRequirement.minimum_odometer)} to {formatMileage(odometerRequirement.maximum_odometer)}
                    </Text>
                  </View>
                </View>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(value) => {
                    setOdometerInput(value.replace(/[^\d]/g, ''));
                    setOdometerError('');
                  }}
                  placeholder="Current odometer reading"
                  placeholderTextColor={appTheme.colors.textMuted}
                  style={styles.odometerInput}
                  value={odometerInput}
                />
                {odometerRangeHint && !odometerError ? <Text style={styles.odometerError}>{odometerRangeHint}</Text> : null}
                {odometerError ? <Text style={styles.odometerError}>{odometerError}</Text> : null}
                <Pressable
                  accessibilityLabel="Submit odometer reading"
                  disabled={isSubmittingOdometer || !isOdometerSubmittable}
                  onPress={handleSubmitOdometer}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.startRouteButton,
                    (isSubmittingOdometer || !isOdometerSubmittable) && styles.buttonDisabled,
                    pressed && !isSubmittingOdometer && isOdometerSubmittable ? styles.buttonPressed : null
                  ]}
                >
                  {isSubmittingOdometer ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Continue</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {routePresentation?.actionLabel && !odometerRequirement && !isInspectionBlockingRoute ? (
              <Pressable
                disabled={isStartingRoute || !hasLocationAccess}
                onPress={handleRouteAction}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.startRouteButton,
                  (isStartingRoute || !hasLocationAccess) && styles.buttonDisabled,
                  pressed && !isStartingRoute && hasLocationAccess ? styles.buttonPressed : null
                ]}
              >
                {isStartingRoute ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{routePresentation.actionLabel}</Text>
                )}
              </Pressable>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              accessibilityLabel={clockedInAt ? 'Clock Out' : 'Clock In'}
              disabled={isUpdatingClock || (!route && !clockedInAt) || (!hasLocationAccess && !clockedInAt)}
              onPress={handleClockToggle}
              style={({ pressed }) => [
                styles.clockButton,
                clockedInAt ? styles.clockButtonActive : styles.clockButtonIdle,
                styles.actionButton,
                (isUpdatingClock || (!route && !clockedInAt) || (!hasLocationAccess && !clockedInAt)) && styles.buttonDisabled,
                pressed && !isUpdatingClock && (hasLocationAccess || clockedInAt) ? styles.clockButtonPressed : null
              ]}
            >
              {isUpdatingClock ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={[styles.clockButtonText, clockedInAt ? styles.clockButtonTextActive : styles.clockButtonTextIdle]}>
                  {clockedInAt ? 'Clock Out' : 'Clock In'}
                </Text>
              )}
            </Pressable>

            <Pressable
              accessibilityLabel={breakButtonLabel}
              disabled={isUpdatingBreak || !clockedInAt}
              onPress={handleBreakToggle}
              style={({ pressed }) => [
                styles.breakButton,
                activeBreak ? styles.breakButtonActive : styles.breakButtonIdle,
                styles.actionButton,
                (isUpdatingBreak || !clockedInAt) && styles.buttonDisabled,
                pressed && !isUpdatingBreak ? styles.breakButtonPressed : null
              ]}
            >
              {isUpdatingBreak ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={[styles.breakButtonText, activeBreak ? styles.breakButtonTextActive : styles.breakButtonTextIdle]}>
                  {breakButtonLabel}
                </Text>
              )}
            </Pressable>
          </View>

          {clockedInAt || activeBreak ? (
            <View style={styles.timeStatusCard}>
              {clockedInAt ? <Text style={styles.timeStatusText}>Clocked in: {formatLaborTime(clockedInAt)}</Text> : null}
              {activeBreak ? (
                <Text style={styles.timeStatusSubtext}>
                  {`${formatBreakLabel(activeBreak.break_type)} started at ${formatLaborTime(activeBreak.started_at)}`}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: appTheme.colors.backgroundWarm
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: appTheme.spacing.lg
  },
  container: {
    flex: 1,
    paddingHorizontal: appTheme.spacing.lg,
    paddingTop: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.lg
  },
  mainContent: {
    gap: appTheme.spacing.md
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  centeredState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32
  },
  emptyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.sm
  },
  emptyText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body,
    textAlign: 'center'
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.xs,
    marginTop: 56
  },
  topRowText: {
    flex: 1,
    flexShrink: 1,
    paddingRight: appTheme.spacing.sm
  },
  dateText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.bold,
    lineHeight: appTheme.typography.lineHeights.body
  },
  logoutButton: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.xs
  },
  logoutText: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  locationGateCard: {
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    padding: appTheme.spacing.lg
  },
  locationGateTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xs
  },
  locationGateBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  locationGateBullets: {
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.sm
  },
  locationGateBulletRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  locationGateBulletDot: {
    color: appTheme.colors.orange,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  locationGateBulletText: {
    color: appTheme.colors.textSecondary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  locationGateSecondary: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    lineHeight: 18,
    marginTop: appTheme.spacing.sm
  },
  locationGateButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.buttons.radius,
    justifyContent: 'center',
    marginTop: appTheme.spacing.md,
    minHeight: appTheme.buttons.height,
    paddingHorizontal: appTheme.buttons.horizontalPadding
  },
  locationGateButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  odometerCard: {
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.xl,
    borderWidth: 1,
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.lg
  },
  odometerEyebrow: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.eyebrow,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  odometerTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  odometerBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  odometerDetailGrid: {
    gap: appTheme.spacing.sm
  },
  odometerDetail: {
    backgroundColor: appTheme.colors.backgroundWarm,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    padding: appTheme.spacing.sm
  },
  odometerDetailLabel: {
    color: appTheme.colors.textMuted,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold,
    marginBottom: 2,
    textTransform: 'uppercase'
  },
  odometerDetailValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  odometerInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.bold,
    minHeight: 52,
    paddingHorizontal: appTheme.spacing.md
  },
  odometerError: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  inspectionCard: {
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.purple,
    borderRadius: appTheme.radius.xl,
    borderWidth: 1,
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.lg
  },
  inspectionEyebrow: {
    color: appTheme.colors.purple,
    fontSize: appTheme.typography.eyebrow,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  inspectionTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  inspectionBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  inspectionProgressPanel: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.md
  },
  inspectionProgressValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  inspectionProgressLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginTop: 2
  },
  inspectionIssueCountPill: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    flexShrink: 0,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs
  },
  inspectionIssueCountText: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  inspectionChecklist: {
    gap: appTheme.spacing.md
  },
  inspectionSection: {
    gap: appTheme.spacing.xs
  },
  inspectionSectionTitle: {
    color: appTheme.colors.textMuted,
    fontSize: appTheme.typography.eyebrow,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  inspectionSectionItems: {
    gap: appTheme.spacing.sm
  },
  inspectionChecklistRow: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.md
  },
  inspectionChecklistRowNeutral: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border
  },
  inspectionChecklistRowPass: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: '#aee8c9'
  },
  inspectionChecklistRowIssue: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: appTheme.colors.orangeBorder
  },
  inspectionChecklistHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'space-between'
  },
  inspectionChecklistHeaderStacked: {
    alignItems: 'stretch',
    flexDirection: 'column'
  },
  inspectionChecklistCopy: {
    flex: 1,
    minWidth: 0
  },
  inspectionChecklistText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.bold,
    lineHeight: appTheme.typography.lineHeights.body
  },
  inspectionChecklistStatus: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold,
    marginTop: 2,
    textTransform: 'uppercase'
  },
  inspectionStatusActions: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: appTheme.spacing.xs
  },
  inspectionChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  inspectionChipWrapCompact: {
    flexDirection: 'row',
    flexShrink: 1,
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs,
    justifyContent: 'flex-end',
    maxWidth: 220
  },
  inspectionChipWrapFull: {
    justifyContent: 'flex-start',
    maxWidth: '100%'
  },
  inspectionChip: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs
  },
  inspectionChipSelected: {
    borderColor: appTheme.colors.orangeBorder
  },
  inspectionChipPass: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: '#aee8c9'
  },
  inspectionChipIssue: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder
  },
  inspectionChipUnsafe: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#f5b2a8'
  },
  inspectionChipText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  inspectionChipTextSelected: {
    color: appTheme.colors.orangeDeep
  },
  inspectionChipTextPass: {
    color: appTheme.colors.greenText
  },
  inspectionChipTextIssue: {
    color: appTheme.colors.orangeDeep
  },
  inspectionChipTextUnsafe: {
    color: appTheme.colors.dangerText
  },
  inspectionIssuePanel: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.md
  },
  inspectionIssueGroup: {
    gap: appTheme.spacing.xs
  },
  inspectionIssueLabel: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  inspectionPhotoList: {
    gap: appTheme.spacing.xs
  },
  inspectionPhotoPill: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.infoSoft,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: appTheme.spacing.sm,
    minHeight: 38,
    paddingHorizontal: appTheme.spacing.sm
  },
  inspectionPhotoText: {
    color: appTheme.colors.infoText,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  inspectionPhotoRemove: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  inspectionPhotoButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: appTheme.spacing.md
  },
  inspectionPhotoButtonText: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  inspectionStatusButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 72,
    paddingHorizontal: appTheme.spacing.sm
  },
  inspectionStatusButtonPass: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: '#aee8c9'
  },
  inspectionStatusButtonFail: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#f5b2a8'
  },
  inspectionStatusButtonText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  inspectionStatusButtonTextPass: {
    color: appTheme.colors.greenText
  },
  inspectionStatusButtonTextFail: {
    color: appTheme.colors.dangerText
  },
  inspectionItemNoteInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold,
    minHeight: 74,
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.sm
  },
  inspectionNoteInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.bold,
    minHeight: 92,
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.sm
  },
  safetyCard: {
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.xl,
    borderWidth: 1,
    borderLeftColor: appTheme.colors.orange,
    borderLeftWidth: 4,
    minHeight: 0,
    padding: appTheme.spacing.lg
  },
  safetyCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: appTheme.spacing.sm
  },
  safetyEyebrow: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.eyebrow,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  safetyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 26,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: 32,
    marginBottom: appTheme.spacing.sm
  },
  safetySource: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginBottom: appTheme.spacing.md
  },
  safetyBulletList: {
    gap: appTheme.spacing.sm
  },
  safetyBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: appTheme.spacing.sm
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    marginTop: appTheme.spacing.lg,
    minHeight: 48,
    minWidth: 140,
    paddingHorizontal: appTheme.spacing.lg
  },
  retryButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  safetyBulletDot: {
    color: appTheme.colors.orange,
    fontSize: 18,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: 22
  },
  safetyBullet: {
    color: appTheme.colors.textSecondary,
    flex: 1,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  safetyTakeaway: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderRadius: appTheme.radius.md,
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginTop: appTheme.spacing.md,
    padding: appTheme.spacing.md
  },
  badgeBase: {
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  badgeTextBase: {
    fontSize: appTheme.typography.label,
    fontWeight: appTheme.typography.weights.bold
  },
  badgeReady: {
    backgroundColor: appTheme.colors.greenSoft
  },
  badgeReadyText: {
    color: appTheme.colors.greenText
  },
  badgeInProgress: {
    backgroundColor: appTheme.colors.orangeSoft
  },
  badgeInProgressText: {
    color: appTheme.colors.orangeDeep
  },
  badgeComplete: {
    backgroundColor: appTheme.colors.grayBadge
  },
  badgeCompleteText: {
    color: appTheme.colors.grayBadgeText
  },
  routeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.md
  },
  routeMetaChip: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  routeMetaSecondary: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  inlineEmptyState: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    marginTop: appTheme.spacing.lg,
    padding: appTheme.spacing.md
  },
  inlineEmptyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.bold,
    marginBottom: appTheme.spacing.xxs
  },
  inlineEmptyBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  inlineNoticeState: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    padding: appTheme.spacing.md
  },
  inlineNoticeTitle: {
    color: appTheme.colors.warningText,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.bold,
    marginBottom: appTheme.spacing.xxs
  },
  inlineNoticeBody: {
    color: appTheme.colors.infoText,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  primaryButton: {
    ...appTheme.shadows.card,
    alignItems: 'center',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: appTheme.spacing.md
  },
  startRouteButton: {
    marginTop: appTheme.spacing.xxs
  },
  primaryButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.bold
  },
  actionRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.xs
  },
  actionButton: {
    flex: 1
  },
  clockButton: {
    alignItems: 'center',
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: appTheme.spacing.md
  },
  clockButtonIdle: {
    backgroundColor: appTheme.colors.charcoal
  },
  clockButtonActive: {
    backgroundColor: appTheme.colors.charcoal
  },
  clockButtonPressed: {
    opacity: 0.9
  },
  clockButtonText: {
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.bold
  },
  clockButtonTextIdle: {
    color: appTheme.colors.textInverse
  },
  clockButtonTextActive: {
    color: appTheme.colors.textInverse
  },
  breakButton: {
    alignItems: 'center',
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: appTheme.spacing.md
  },
  breakButtonIdle: {
    backgroundColor: appTheme.colors.purple
  },
  breakButtonActive: {
    backgroundColor: '#5838bf'
  },
  breakButtonPressed: {
    opacity: 0.9
  },
  breakButtonText: {
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.bold
  },
  breakButtonTextIdle: {
    color: appTheme.colors.textInverse
  },
  breakButtonTextActive: {
    color: appTheme.colors.textInverse
  },
  timeStatusCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    marginTop: appTheme.spacing.sm,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  timeStatusText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  timeStatusSubtext: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    marginTop: appTheme.spacing.xxs
  },
  buttonDisabled: {
    opacity: 0.65
  },
  buttonPressed: {
    opacity: 0.92
  }
});
