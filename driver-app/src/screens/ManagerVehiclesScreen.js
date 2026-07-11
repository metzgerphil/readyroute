import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import ManagerSectionLayout from '../components/ManagerSectionLayout';
import AppButton from '../components/ui/AppButton';
import AppCard from '../components/ui/AppCard';
import ErrorState from '../components/ui/ErrorState';
import KeyboardAwareModal from '../components/ui/KeyboardAwareModal';
import RouteMetricIcon from '../components/RouteMetricIcon';
import api from '../services/api';
import appTheme from '../theme/appTheme';
import {
  INSPECTION_SEVERITY_OPTIONS,
  getInspectionFormValidationError,
  getInspectionItemDefinition,
  normalizeInspectionItemKey,
  serializeInspectionItems
} from '../utils/vehicleInspection';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'ready', label: 'Ready' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'maintenance_soon', label: 'Due Soon' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'missing info', label: 'Missing Info' }
];

const VEHICLE_MANAGER_TABS = ['Fleet', 'Maintenance', 'Inspections', 'Settings'];

const WEEKLY_INSPECTION_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DEFAULT_MAINTENANCE_REQUIREMENTS = {
  maintenance_requirement_mode: 'option_1',
  weekly_inspection_day: 'Monday',
  maintenance_warning_miles: 1000,
  maintenance_warning_days: 14,
  document_warning_days: 30,
  custom_daily_requirements: {
    require_truck_confirmation: true,
    require_odometer_entry: true,
    show_issue_note_box: true,
    require_full_checklist_daily: false
  },
  custom_weekly_requirements: {
    require_full_checklist_weekly: true,
    require_manager_review_for_reported_issues: true
  }
};

const MAINTENANCE_REQUIREMENT_OPTIONS = [
  {
    id: 'option_1',
    optionLabel: 'Weekly Full Inspection',
    title: 'Daily Odometer + Issue Note',
    badge: 'Recommended',
    badgeTone: 'recommended',
    description: 'Drivers confirm their truck, enter the odometer, and can report vehicle issues noticed that day.',
    dailyRequirements: ['Confirm truck', 'Enter odometer', 'Report any noticed issue'],
    weeklyRequirements: ['Full vehicle inspection on selected weekday']
  },
  {
    id: 'option_2',
    optionLabel: 'Daily Full Inspection',
    title: 'Daily Odometer + Full Inspection',
    badge: 'Stricter',
    badgeTone: 'stricter',
    description: 'Drivers confirm their truck, enter the odometer, and complete the full vehicle inspection every day.',
    dailyRequirements: ['Confirm truck', 'Enter odometer', 'Complete full vehicle inspection'],
    weeklyRequirements: ['No separate weekly inspection required']
  },
  {
    id: 'custom',
    optionLabel: 'Custom Requirements',
    title: 'Custom',
    description: 'Managers choose the exact daily and weekly vehicle check requirements.',
    dailyRequirements: ['Choose daily truck checks below'],
    weeklyRequirements: ['Choose weekly vehicle check requirements below']
  }
];

const SERVICE_TYPE_OPTIONS = [
  'Inspection',
  'Oil Change',
  'Air Filter',
  'Brake Pads',
  'General Repair',
  'Other'
];

const VEHICLE_TYPE_OPTIONS = [
  'P700',
  'P900',
  'P1000',
  'P1100',
  'P1200',
  'Box Truck',
  'Step Van',
  'Transit',
  'Cargo Van',
  'Cutaway',
  'Other'
];

const FUEL_TYPE_OPTIONS = ['Gas', 'Diesel', 'EV'];

const VEHICLE_STATUS_REVIEW_OPTIONS = [
  { value: 'active', label: 'Return to Service' },
  { value: 'needs_repair', label: 'Needs Repair' },
  { value: 'at_the_shop', label: 'At the Shop' },
  { value: 'out_of_service', label: 'Out of Service' }
];

const DEFAULT_CHECKLIST_TEMPLATE_FIELDS = [
  { id: 'date', label: 'Date', detail: 'Inspection date', enabled: true },
  { id: 'company_name', label: 'Company name', detail: 'CSA or company name', enabled: true },
  { id: 'truck_number', label: 'Vehicle ID', detail: 'Vehicle identifier for the inspection', enabled: true },
  { id: 'driver_name', label: 'Driver first and last name', detail: 'Driver completing the inspection', enabled: true },
  { id: 'tires', label: 'Tires', detail: 'Front left, front right, back left, and back right tire condition', enabled: true },
  { id: 'check_engine_light', label: 'Check engine light', detail: 'Dashboard warning state and driving symptoms', enabled: true },
  { id: 'lights', label: 'Lights', detail: 'Marker, turn signal, headlight, cargo, and license plate lights', enabled: true },
  { id: 'brake_fluid', label: 'Brake fluid', detail: 'Brake fluid level, warning light, leaks, or pedal concerns', enabled: true },
  { id: 'vedr', label: 'VEDR', detail: 'Video event data recorder condition', enabled: true },
  { id: 'back_up_camera', label: 'Back up camera', detail: 'Rear camera image and operation', enabled: true },
  { id: 'turn_cameras', label: 'Turn cameras', detail: 'Side turn camera image and operation', enabled: true },
  { id: 'parking_sensors', label: 'Parking sensors', detail: 'Parking sensor operation', enabled: true },
  { id: 'horn', label: 'Horn', detail: 'Horn operation', enabled: true },
  { id: 'coolant', label: 'Coolant', detail: 'Coolant level, leak, warning light, or overheating', enabled: true },
  { id: 'engine_oil', label: 'Engine oil', detail: 'Engine oil level, leak, oil light, or service due', enabled: true },
  { id: 'windshield_fluid', label: 'Windshield fluid', detail: 'Washer fluid level or leak', enabled: true },
  { id: 'wipers', label: 'Wipers', detail: 'Left, right, or both wiper condition', enabled: true },
  { id: 'truck_cleanliness', label: 'Truck cleanliness', detail: 'Clean, dirty, or needs attention', enabled: true },
  { id: 'driver_notes', label: 'Driver notes', detail: 'Free-text notes from the driver', enabled: true }
];

function getTodayDateParam() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function formatDate(value) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return 'Not recorded';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function formatMileage(value) {
  return `${new Intl.NumberFormat('en-US').format(Number(value || 0))} miles`;
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

function getVehicleDescription(vehicle) {
  const description = [vehicle?.make, vehicle?.model, vehicle?.year].filter(Boolean).join(' ') || 'Description not recorded';
  const vehicleType = [
    vehicle?.custom_truck_type,
    vehicle?.truck_type,
    vehicle?.vehicle_type,
    vehicle?.body_type,
    vehicle?.type
  ].find((value) => typeof value === 'string' && value.trim());

  return vehicleType ? `${description} • ${vehicleType.trim()}` : description;
}

function getRecordedLicensePlate(vehicle) {
  const plate = String(vehicle?.plate || '').trim();
  const vehicleId = String(vehicle?.name || '').trim();

  if (!plate || plate.toLowerCase() === vehicleId.toLowerCase()) {
    return '';
  }

  return plate;
}

function getRegistrationSummary(vehicle) {
  const plate = getRecordedLicensePlate(vehicle) || 'License plate not recorded';
  return `${plate} • ${getRegistrationStatus(vehicle)}`;
}

function formatInterval(setting) {
  const parts = [];

  if (setting?.default_interval_miles) {
    parts.push(`${new Intl.NumberFormat('en-US').format(Number(setting.default_interval_miles))} mi`);
  }

  if (setting?.default_interval_days) {
    parts.push(`${Number(setting.default_interval_days)} days`);
  }

  return parts.join(' / ') || setting?.notes || 'As needed';
}

function getMaintenanceModeLabel(setting) {
  const mode = setting?.maintenance_requirement_mode || DEFAULT_MAINTENANCE_REQUIREMENTS.maintenance_requirement_mode;
  return MAINTENANCE_REQUIREMENT_OPTIONS.find((option) => option.id === mode)?.title || MAINTENANCE_REQUIREMENT_OPTIONS[0].title;
}

function getRegistrationStatus(vehicle) {
  if (!vehicle?.registration_expiration) {
    return 'Registration not recorded';
  }

  const expirationDate = new Date(`${vehicle.registration_expiration}T12:00:00`);
  if (Number.isNaN(expirationDate.getTime())) {
    return 'Registration not recorded';
  }

  const daysRemaining = Math.ceil((expirationDate.getTime() - Date.now()) / 86400000);

  if (daysRemaining < 0) {
    return `Expired ${formatDate(vehicle.registration_expiration)}`;
  }

  if (daysRemaining <= 30) {
    return `Expires ${formatDate(vehicle.registration_expiration)}`;
  }

  return formatDate(vehicle.registration_expiration);
}

function getStatusMeta(vehicle) {
  const missingInfo = !vehicle?.registration_expiration || !vehicle?.make || !vehicle?.model || !vehicle?.year || !getRecordedLicensePlate(vehicle);

  if (vehicle?.readiness_status === 'blocked' || vehicle?.readiness?.status === 'blocked') {
    return { filterKey: 'blocked', label: 'Blocked', tone: 'danger' };
  }

  if (vehicle?.readiness_status === 'maintenance_soon' || vehicle?.readiness?.status === 'maintenance_soon') {
    return { filterKey: 'maintenance_soon', label: 'Maintenance Soon', tone: 'warning' };
  }

  if (vehicle?.readiness_status === 'assigned' || vehicle?.readiness?.status === 'assigned') {
    return { filterKey: 'assigned', label: 'Assigned', tone: 'complete' };
  }

  if (vehicle?.service_due) {
    return { filterKey: 'maintenance_soon', label: 'Maintenance Soon', tone: 'warning' };
  }

  if (vehicle?.today_assignment?.route_status === 'in_progress') {
    return { filterKey: 'assigned', label: 'On road', tone: 'warning' };
  }

  if (vehicle?.today_assignment) {
    return { filterKey: 'assigned', label: 'Assigned', tone: 'complete' };
  }

  if (missingInfo) {
    return { filterKey: 'missing info', label: 'Missing info', tone: 'neutral' };
  }

  return { filterKey: 'ready', label: 'Ready', tone: 'active' };
}

function getReadinessReasons(vehicle, severity = null) {
  const reasons = Array.isArray(vehicle?.readiness?.reasons) ? vehicle.readiness.reasons : [];
  return severity ? reasons.filter((reason) => reason.severity === severity) : reasons;
}

function getBlockerSummary(vehicle) {
  const blockers = getReadinessReasons(vehicle, 'blocked');
  if (!blockers.length) {
    return '';
  }

  return blockers.length === 1 ? blockers[0].label : `${blockers[0].label} + ${blockers.length - 1} more`;
}

function getLastServiceSummary(vehicle) {
  const latest = vehicle?.latest_maintenance || null;
  const date = latest?.service_date || vehicle?.last_service_date || '';
  const detail = latest?.service_type || latest?.condition_notes || latest?.description || vehicle?.notes || '';

  return {
    dateLabel: date ? formatDate(date) : 'Not recorded',
    detailLabel: detail || 'No notes'
  };
}

function getAssignedDriverLabel(vehicle) {
  if (!vehicle?.today_assignment) {
    return 'Not assigned';
  }

  return vehicle.today_assignment.driver_name || 'Assigned';
}

function filterVehicles(vehicles = [], searchTerm = '', statusFilter = 'all') {
  const query = searchTerm.trim().toLowerCase();
  const normalizedStatusFilter = {
    available: 'ready',
    maintenance: 'maintenance_soon'
  }[statusFilter] || statusFilter;

  return vehicles.filter((vehicle) => {
    const statusMeta = getStatusMeta(vehicle);
    const statusMatches = normalizedStatusFilter === 'all' || statusMeta.filterKey === normalizedStatusFilter;
    const text = [
      vehicle?.name,
      getVehicleDescription(vehicle),
      vehicle?.plate,
      getAssignedDriverLabel(vehicle)
    ].filter(Boolean).join(' ').toLowerCase();

    return statusMatches && (!query || text.includes(query));
  });
}

function getVehicleForm(vehicle) {
  return {
    name: vehicle?.name || '',
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    year: vehicle?.year ? String(vehicle.year) : '',
    truck_type: vehicle?.truck_type || '',
    custom_truck_type: vehicle?.custom_truck_type || '',
    fuel_type: vehicle?.fuel_type || '',
    plate: getRecordedLicensePlate(vehicle),
    registration_expiration: vehicle?.registration_expiration || '',
    insurance_expiration: vehicle?.insurance_expiration || '',
    current_mileage: String(vehicle?.current_mileage || 0),
    notes: vehicle?.notes || ''
  };
}

function buildVehiclePayload(form) {
  return {
    ...form,
    name: String(form.name || '').trim().toUpperCase(),
    plate: String(form.plate || '').trim().toUpperCase(),
    current_mileage: Number(form.current_mileage || 0),
    year: Number(form.year)
  };
}

function getDriverDisplayName(driver) {
  return [driver?.name, driver?.fedex_driver_id ? `#${driver.fedex_driver_id}` : null]
    .filter(Boolean)
    .join(' • ') || driver?.email || 'Driver';
}

function getInspectionAssignmentForm(vehicle = null, driver = null) {
  return {
    vehicle_id: vehicle?.id || '',
    driver_id: driver?.id || '',
    due_date: getTodayDateParam(),
    priority: 'normal',
    require_before_route_start: false,
    note: ''
  };
}

function normalizeMaintenanceSettings(settings = []) {
  return (Array.isArray(settings) ? settings : [])
    .filter((setting) => setting?.is_enabled !== false)
    .map((setting) => ({
      ...setting,
      service_type: setting.service_type || 'Maintenance'
    }));
}

function normalizeMaintenanceSettingsDraft(settings = []) {
  return (Array.isArray(settings) ? settings : []).map((setting) => ({
    ...setting,
    service_type: setting.service_type || 'Maintenance',
    is_enabled: typeof setting.is_enabled === 'boolean' ? setting.is_enabled : true,
    default_interval_miles: setting.default_interval_miles ?? '',
    default_interval_days: setting.default_interval_days ?? '',
    notes: setting.notes || ''
  }));
}

function normalizeChecklistFields(template) {
  return (template?.fields || [])
    .filter((field) => field?.enabled !== false)
    .map((field) => field.label || field.id)
    .filter(Boolean);
}

function normalizeChecklistTemplateFields(template) {
  const submittedById = new Map(
    (Array.isArray(template?.fields) ? template.fields : [])
      .filter((field) => field && typeof field === 'object')
      .map((field) => [String(field.id || '').trim(), field])
      .filter(([id]) => Boolean(id))
  );

  return DEFAULT_CHECKLIST_TEMPLATE_FIELDS.map((defaultField) => {
    const submitted = submittedById.get(defaultField.id);
    return {
      ...defaultField,
      ...(submitted || {}),
      label: submitted?.label || defaultField.label,
      detail: submitted?.detail || defaultField.detail,
      enabled: typeof submitted?.enabled === 'boolean' ? submitted.enabled : defaultField.enabled
    };
  });
}

function normalizeMaintenanceRequirementSetting(setting) {
  return {
    ...DEFAULT_MAINTENANCE_REQUIREMENTS,
    ...(setting || {}),
    maintenance_requirement_mode: setting?.maintenance_requirement_mode || DEFAULT_MAINTENANCE_REQUIREMENTS.maintenance_requirement_mode,
    weekly_inspection_day: setting?.weekly_inspection_day || DEFAULT_MAINTENANCE_REQUIREMENTS.weekly_inspection_day,
    custom_daily_requirements: {
      ...DEFAULT_MAINTENANCE_REQUIREMENTS.custom_daily_requirements,
      ...(setting?.custom_daily_requirements || {})
    },
    custom_weekly_requirements: {
      ...DEFAULT_MAINTENANCE_REQUIREMENTS.custom_weekly_requirements,
      ...(setting?.custom_weekly_requirements || {})
    }
  };
}

function getMaintenanceForm(vehicle) {
  return {
    condition_notes: '',
    cost: '',
    description: '',
    mileage_at_service: String(vehicle?.current_mileage || ''),
    next_service_date: '',
    next_service_mileage: '',
    service_date: getTodayDateParam(),
    service_type: 'Oil Change',
    vendor_name: ''
  };
}

function formatInspectionStatus(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Not recorded';
}

function isInspectionIssueItem(item) {
  return item?.status === 'issue' || item?.status === 'fail';
}

function getInspectionIssueItems(inspection) {
  if (Array.isArray(inspection?.issue_items) && inspection.issue_items.length) {
    return inspection.issue_items;
  }

  if (Array.isArray(inspection?.failed_items) && inspection.failed_items.length) {
    return inspection.failed_items;
  }

  return (inspection?.items || []).filter(isInspectionIssueItem);
}

function formatIssueDetailKey(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatIssueDetailValue(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${formatIssueDetailKey(key)}: ${formatIssueDetailValue(nestedValue)}`)
      .join(', ');
  }

  return String(value || '').trim();
}

function getInspectionIssueDetailLines(item = {}) {
  const details = item.issue_details && typeof item.issue_details === 'object' && !Array.isArray(item.issue_details)
    ? item.issue_details
    : {};

  return Object.entries(details)
    .map(([key, value]) => [formatIssueDetailKey(key), formatIssueDetailValue(value)])
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${value}`);
}

function getInspectionItemSummary(item = {}) {
  return getInspectionItemSummaryLines(item).join(' • ');
}

function getInspectionItemSummaryLines(item = {}) {
  const parts = [
    item.severity ? `Severity: ${formatInspectionStatus(item.severity)}` : null,
    ...getInspectionIssueDetailLines(item),
    item.value ? `Value: ${item.value}` : null,
    item.note ? `Note: ${item.note}` : null,
    Array.isArray(item.photos) && item.photos.length ? `${item.photos.length} photo${item.photos.length === 1 ? '' : 's'}` : null
  ].filter(Boolean);

  return parts.length ? parts : [isInspectionIssueItem(item) ? 'Issue details not recorded' : 'Passed'];
}

function getInspectionReviewStatusLabel(inspection = {}) {
  if (inspection.urgent_review) {
    return 'Urgent Manager Review';
  }

  if (inspection.manager_review_required) {
    return 'Manager Review Required';
  }

  return inspection.status_label || formatInspectionStatus(inspection.status || 'submitted');
}

function getInspectionVehicleLabel(inspection = {}) {
  return inspection.vehicle_name || inspection.vehicle?.name || 'Vehicle not recorded';
}

function getInspectionDriverLabel(inspection = {}) {
  return inspection.driver?.name
    || inspection.submitted_by_driver?.name
    || inspection.submitted_by_name
    || inspection.driver_name
    || 'Driver not recorded';
}

function buildInspectionSummary(inspection = {}) {
  const issueItems = getInspectionIssueItems(inspection);
  const issueLines = issueItems.length
    ? issueItems.flatMap((item, index) => [
        `${index + 1}. ${item.label || item.checklist_item_key || 'Inspection item'}`,
        ...getInspectionItemSummaryLines(item).map((line) => `   ${line}`)
      ])
    : ['No inspection issues recorded.'];
  const headerLines = [
    'Inspection Summary',
    `Vehicle: ${getInspectionVehicleLabel(inspection)}`,
    `Inspection date: ${inspection.inspection_date ? formatDate(inspection.inspection_date) : 'Not recorded'}`,
    `Submitted by: ${getInspectionDriverLabel(inspection)}`,
    `Odometer: ${inspection.odometer ? formatMileage(inspection.odometer) : 'Not recorded'}`,
    `Status: ${getInspectionReviewStatusLabel(inspection)}`,
    inspection.issue_note ? `Driver note: ${inspection.issue_note}` : null
  ].filter(Boolean);

  return [
    ...headerLines,
    '',
    'Issues:',
    ...issueLines
  ].join('\n');
}

function getInspectionMaintenanceForm(vehicle, inspection) {
  const issueItems = getInspectionIssueItems(inspection)
    .map((item) => `${item.label || item.checklist_item_key}: ${getInspectionItemSummary(item)}`);
  const notes = [
    inspection?.issue_note ? `Driver issue note: ${inspection.issue_note}` : null,
    issueItems.length ? `Inspection issues: ${issueItems.join('; ')}` : null,
    inspection?.id ? `Source inspection: ${inspection.id}` : null
  ].filter(Boolean);

  return {
    ...getMaintenanceForm(vehicle),
    condition_notes: issueItems.join('\n'),
    description: notes.join('\n'),
    mileage_at_service: inspection?.odometer ? String(inspection.odometer) : String(vehicle?.current_mileage || ''),
    service_type: issueItems.length || inspection?.issue_note ? 'General Repair' : 'Inspection'
  };
}

function getOdometerForm(vehicle) {
  return {
    odometer_reading: vehicle?.current_mileage === null || vehicle?.current_mileage === undefined
      ? ''
      : String(vehicle.current_mileage),
    notes: '',
    confirmedLower: false
  };
}

function getInspectionChecklistFields(template) {
  return normalizeChecklistTemplateFields(template)
    .filter((field) => field.enabled !== false)
    .filter((field) => !['date', 'company_name', 'truck_number', 'driver_name', 'driver_notes'].includes(field.id));
}

function getInspectionForm(vehicle, template) {
  return {
    inspection_date: getTodayDateParam(),
    odometer: vehicle?.current_mileage === null || vehicle?.current_mileage === undefined
      ? ''
      : String(vehicle.current_mileage),
    issue_note: '',
    items: getInspectionChecklistFields(template).map((field) => {
      const checklistItemKey = normalizeInspectionItemKey(field.id || field.label);
      const definition = getInspectionItemDefinition({
        ...field,
        checklist_item_key: checklistItemKey
      });

      return {
        checklist_item_key: checklistItemKey,
        label: definition.label || field.label,
        category: definition.category || field.category || 'other',
        status: 'pass',
        severity: null,
        issue_details: {},
        note: '',
        photos: []
      };
    })
  };
}

function Field({ attention = '', keyboardType, label, multiline = false, onChangeText, placeholder, value }) {
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {attention ? <Text style={styles.fieldAttention}>{attention}</Text> : null}
      </View>
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={appTheme.colors.textTertiary}
        style={[styles.textInput, attention ? styles.textInputAttention : null, multiline ? styles.textArea : null]}
        value={value}
      />
    </View>
  );
}

function OptionPicker({ attention = '', label, onChange, options, value }) {
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {attention ? <Text style={styles.fieldAttention}>{attention}</Text> : null}
      </View>
      <View style={styles.optionPicker}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <Pressable
              accessibilityRole="button"
              key={option}
              onPress={() => onChange(option)}
              style={({ pressed }) => [
                styles.optionChip,
                selected ? styles.optionChipSelected : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={[styles.optionChipText, selected ? styles.optionChipTextSelected : null]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function VehicleFormSectionTitle({ children }) {
  return (
    <View style={styles.vehicleFormSectionHeader}>
      <Text style={styles.vehicleFormSectionTitle}>{children}</Text>
    </View>
  );
}

function VehicleCard({ onEditActions, onOpenProfile, vehicle }) {
  const assignedDriver = getAssignedDriverLabel(vehicle);
  const routeNumber = vehicle.today_assignment?.work_area_name;
  const statusMeta = getStatusMeta(vehicle);
  const lastService = getLastServiceSummary(vehicle);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpenProfile(vehicle)}
      style={({ pressed }) => [styles.vehicleRow, pressed ? styles.pressed : null]}
    >
      <View style={styles.vehicleCardHeader}>
        <View style={styles.vehicleRowMain}>
          <Text numberOfLines={1} style={styles.vehicleName}>{vehicle.name || 'Truck not recorded'}</Text>
          <Text numberOfLines={1} style={styles.vehicleDescription}>{getVehicleDescription(vehicle)}</Text>
        </View>
        <View style={styles.vehicleCardHeaderActions}>
          <View style={[styles.statusBadge, styles[`statusBadge${statusMeta.tone}`]]}>
            <Text style={[styles.statusBadgeText, styles[`statusBadgeText${statusMeta.tone}`]]}>{statusMeta.label}</Text>
          </View>
          <Pressable
            accessibilityLabel={`Actions for vehicle ${vehicle.name}`}
            accessibilityRole="button"
            onPress={(event) => {
              event?.stopPropagation?.();
              onEditActions(vehicle);
            }}
            style={({ pressed }) => [styles.vehicleMoreButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.vehicleMoreButtonText}>•••</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.vehicleListMeta}>
        <Text numberOfLines={1} style={styles.vehicleMetaText}>{formatMileage(vehicle.current_mileage)}</Text>
        <Text style={styles.vehicleMetaDot}>•</Text>
        <Text numberOfLines={1} style={styles.vehicleMetaText}>{routeNumber || assignedDriver}</Text>
      </View>

      {getBlockerSummary(vehicle) ? (
        <View style={styles.readinessAlert}>
          <Text style={styles.readinessAlertLabel}>Blocked</Text>
          <Text style={styles.readinessAlertText}>{getBlockerSummary(vehicle)}</Text>
          <Text style={styles.readinessAlertLink}>View reasons</Text>
        </View>
      ) : null}
      <View style={styles.vehicleListMeta}>
        <Text numberOfLines={1} style={styles.vehicleMetaText}>{lastService.detailLabel}</Text>
        <Text style={styles.vehicleMetaDot}>•</Text>
        <Text numberOfLines={1} style={styles.vehicleMetaText}>{getRegistrationSummary(vehicle)}</Text>
      </View>

    </Pressable>
  );
}

function VehicleProfileModal({
  onClose,
  onAssignInspection,
  onEditInfo,
  onEditOdometer,
  onLogMaintenance,
  onOpenReadinessReason,
  onRunInspection,
  onViewAssignmentHistory,
  onViewInspectionHistory,
  onViewOdometerHistory,
  onViewServiceHistory,
  vehicle
}) {
  const statusMeta = getStatusMeta(vehicle);
  const lastService = getLastServiceSummary(vehicle);

  return (
    <KeyboardAwareModal animationType="slide" onClose={onClose} visible={Boolean(vehicle)}>
          <View style={styles.modalHeader}>
            <View style={styles.profileTitleBlock}>
              <Text style={styles.modalTitle}>Vehicle {vehicle?.name || ''}</Text>
              <Text style={styles.modalSubtitle}>{getVehicleDescription(vehicle)}</Text>
            </View>
            <Pressable accessibilityLabel="Close vehicle profile" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false} style={styles.modalScroll}>
            <View style={styles.profileStatusRow}>
              <View style={[styles.statusBadge, styles[`statusBadge${statusMeta.tone}`]]}>
                <Text style={[styles.statusBadgeText, styles[`statusBadgeText${statusMeta.tone}`]]}>{statusMeta.label}</Text>
              </View>
              <Text style={styles.profileStatusText}>{vehicle?.today_assignment?.work_area_name ? `Route ${vehicle.today_assignment.work_area_name}` : getAssignedDriverLabel(vehicle)}</Text>
            </View>

            <View style={styles.profileGrid}>
              <View style={styles.profileTile}>
                <Text style={styles.summaryLabel}>Odometer</Text>
                <Text style={styles.summaryValue}>{formatMileage(vehicle?.current_mileage)}</Text>
              </View>
              <View style={styles.profileTile}>
                <Text style={styles.summaryLabel}>Registration</Text>
                <Text style={styles.summaryValue}>{getRegistrationSummary(vehicle)}</Text>
              </View>
              <View style={styles.profileTile}>
                <Text style={styles.summaryLabel}>Assigned</Text>
                <Text style={styles.summaryValue}>{getAssignedDriverLabel(vehicle)}</Text>
              </View>
              <View style={styles.profileTile}>
                <Text style={styles.summaryLabel}>Last service</Text>
                <Text style={styles.summaryValue}>{lastService.detailLabel}</Text>
              </View>
            </View>

            {getReadinessReasons(vehicle).length ? (
              <>
                <Text style={styles.profileSectionLabel}>Readiness Details</Text>
                <View style={styles.readinessReasonList}>
                  {getReadinessReasons(vehicle).map((reason) => (
                    <Pressable
                      accessibilityRole="button"
                      key={`${reason.type}-${reason.source_id || reason.label}`}
                      onPress={() => onOpenReadinessReason(reason)}
                      style={({ pressed }) => [
                        styles.readinessReasonRow,
                        reason.severity === 'blocked' ? styles.readinessReasonRowBlocked : styles.readinessReasonRowWarning,
                        pressed ? styles.pressed : null
                      ]}
                    >
                      <View style={styles.readinessReasonCopy}>
                        <Text style={[
                          styles.readinessReasonTitle,
                          reason.severity === 'blocked' ? styles.readinessReasonTitleBlocked : styles.readinessReasonTitleWarning
                        ]}>{reason.label}</Text>
                        {reason.detail ? <Text style={styles.readinessReasonDetail}>{reason.detail}</Text> : null}
                      </View>
                      <Text style={styles.readinessReasonAction}>{reason.action_label || 'View'}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.profileSectionLabel}>Manager Actions</Text>
            <View style={styles.profileActionGrid}>
              <TruckActionRow label="Update Odometer" onPress={onEditOdometer} primary />
              <TruckActionRow label="Assign Inspection" onPress={onAssignInspection} />
              <TruckActionRow label="Run Inspection" onPress={onRunInspection} />
              <TruckActionRow label="Log Maintenance" onPress={onLogMaintenance} />
              <TruckActionRow label="Edit Vehicle Info" onPress={onEditInfo} />
            </View>

            <Text style={styles.profileSectionLabel}>Records</Text>
            <View style={styles.profileActionGrid}>
              <TruckActionRow label="Maintenance History" onPress={onViewServiceHistory} />
              <TruckActionRow label="Inspection History" onPress={onViewInspectionHistory} />
              <TruckActionRow label="Odometer History" onPress={onViewOdometerHistory} />
              <TruckActionRow label="Assignment History" onPress={onViewAssignmentHistory} />
            </View>
          </ScrollView>
    </KeyboardAwareModal>
  );
}

function SectionTabs({ activeTab, onChange }) {
  return (
    <View style={styles.sectionTabs}>
      {VEHICLE_MANAGER_TABS.map((tab) => (
        <Pressable
          accessibilityRole="button"
          key={tab}
          onPress={() => onChange(tab)}
          style={({ pressed }) => [
            styles.sectionTab,
            activeTab === tab ? styles.sectionTabActive : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={[styles.sectionTabText, activeTab === tab ? styles.sectionTabTextActive : null]}>{tab}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function MaintenanceProgramPanel({
  isLoading,
  isSaving,
  onChangeSetting,
  onSave,
  settings,
  settingsErrorMessage
}) {
  const draftSettings = normalizeMaintenanceSettingsDraft(settings);

  if (isLoading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={appTheme.colors.orange} size="large" />
        <Text style={styles.loadingText}>Loading maintenance</Text>
      </View>
    );
  }

  return (
    <View style={styles.panelStack}>
      <AppCard style={styles.managerMaintenanceCard}>
        <Text style={styles.panelTitle}>Maintenance Program</Text>
        <Text style={styles.panelBody}>Service categories this CSA tracks and the default reminder intervals.</Text>
        {draftSettings.length ? (
          <View style={styles.settingsList}>
            {draftSettings.map((setting, index) => (
              <View key={`${setting.service_type}-${index}`} style={styles.settingRow}>
                <View style={styles.settingRowHeader}>
                  <View style={styles.settingTitleBlock}>
                    <Text style={styles.settingName}>{setting.service_type}</Text>
                    <Text style={styles.settingMeta}>{setting.is_enabled ? formatInterval(setting) : 'Not tracked'}</Text>
                  </View>
                  <CheckToggle
                    checked={setting.is_enabled}
                    compact
                    label={setting.is_enabled ? 'On' : 'Off'}
                    onPress={() => onChangeSetting(index, 'is_enabled', !setting.is_enabled)}
                  />
                </View>
                <View style={styles.inlineFieldRow}>
                  <View style={styles.inlineField}>
                    <Text style={styles.summaryLabel}>Miles</Text>
                    <TextInput
                      keyboardType="number-pad"
                      onChangeText={(value) => onChangeSetting(index, 'default_interval_miles', value.replace(/\D/g, ''))}
                      placeholder="As needed"
                      placeholderTextColor={appTheme.colors.textTertiary}
                      style={styles.inlineInput}
                      value={String(setting.default_interval_miles ?? '')}
                    />
                  </View>
                  <View style={styles.inlineField}>
                    <Text style={styles.summaryLabel}>Days</Text>
                    <TextInput
                      keyboardType="number-pad"
                      onChangeText={(value) => onChangeSetting(index, 'default_interval_days', value.replace(/\D/g, ''))}
                      placeholder="As needed"
                      placeholderTextColor={appTheme.colors.textTertiary}
                      style={styles.inlineInput}
                      value={String(setting.default_interval_days ?? '')}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyBody}>No maintenance categories are enabled yet.</Text>
        )}
        {settingsErrorMessage ? <Text style={styles.modalError}>{settingsErrorMessage}</Text> : null}
        <Pressable disabled={isSaving} onPress={onSave} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
          {isSaving ? (
            <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save Maintenance Program</Text>
          )}
        </Pressable>
      </AppCard>
    </View>
  );
}

function MaintenanceRecordsPanel({ isLoading, records }) {
  const recentRecords = Array.isArray(records) ? records.slice(0, 25) : [];

  if (isLoading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={appTheme.colors.orange} size="large" />
        <Text style={styles.loadingText}>Loading maintenance</Text>
      </View>
    );
  }

  return (
    <AppCard style={styles.managerMaintenanceCard}>
      <Text style={styles.panelTitle}>Maintenance Records</Text>
      <Text style={styles.panelBody}>Completed oil changes, tires, brakes, filters, inspections, and repair records.</Text>
      {recentRecords.length ? (
        <View style={styles.recordsList}>
          {recentRecords.map((record) => (
            <View key={record.id || `${record.vehicle_id}-${record.service_date}-${record.service_type}`} style={styles.recordRow}>
              <View style={styles.recordRowHeader}>
                <Text style={styles.recordTitle}>Vehicle {record.vehicle_name || record.vehicle?.name || 'Not recorded'}</Text>
                <Text style={styles.recordDate}>{formatDate(record.service_date)}</Text>
              </View>
              <Text style={styles.recordService}>{record.service_type || 'Maintenance'}</Text>
              <Text style={styles.recordMeta}>
                {[record.vendor_name, record.mileage_at_service ? formatMileage(record.mileage_at_service) : null]
                  .filter(Boolean)
                  .join(' • ') || 'No vendor or mileage recorded'}
              </Text>
              {record.description || record.condition_notes ? (
                <Text style={styles.recordNotes}>{record.description || record.condition_notes}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyBody}>No fleet maintenance records yet.</Text>
      )}
    </AppCard>
  );
}

function InspectionRecordsPanel({ inspections, isLoading, onOpenInspection }) {
  const recentInspections = Array.isArray(inspections) ? inspections.slice(0, 25) : [];

  if (isLoading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={appTheme.colors.orange} size="large" />
        <Text style={styles.loadingText}>Loading inspections</Text>
      </View>
    );
  }

  return (
    <AppCard style={styles.managerMaintenanceCard}>
      <Text style={styles.panelTitle}>Inspection Records</Text>
      <Text style={styles.panelBody}>Driver and manager vehicle inspections saved for this CSA.</Text>
      {recentInspections.length ? (
        <View style={styles.recordsList}>
          {recentInspections.map((inspection) => {
            const issueCount = inspection.issue_count ?? inspection.failed_items_count ?? getInspectionIssueItems(inspection).length;
            const vehicleName = inspection.vehicle_name || inspection.vehicle?.name || 'Not recorded';
            return (
              <Pressable
                accessibilityRole="button"
                key={inspection.id || `${inspection.vehicle_id}-${inspection.inspection_date}-${inspection.submitted_at}`}
                onPress={() => onOpenInspection(inspection)}
                style={({ pressed }) => [styles.recordRow, pressed ? styles.pressed : null]}
              >
                <View style={styles.recordRowHeader}>
                  <Text style={styles.recordTitle}>Vehicle {vehicleName}</Text>
                  <Text style={styles.recordDate}>{formatDate(inspection.inspection_date)}</Text>
                </View>
                <Text style={styles.recordService}>{inspection.inspection_type_label || 'Inspection'}</Text>
                <Text style={styles.recordMeta}>
                  {[inspection.status_label || inspection.status, inspection.driver?.name || inspection.submitted_by_name]
                    .filter(Boolean)
                    .join(' • ') || 'Submitted inspection'}
                </Text>
                {issueCount ? <Text style={styles.recordNotes}>{issueCount} issue{issueCount === 1 ? '' : 's'} need review</Text> : null}
                {inspection.issue_note ? <Text style={styles.recordNotes}>{inspection.issue_note}</Text> : null}
                <Text style={styles.historyLink}>Review inspection</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.emptyBody}>No inspection records yet.</Text>
      )}
    </AppCard>
  );
}

function SettingsOverviewPanel({ checklistTemplate, maintenanceSettings, onOpen, reminderSchedule, requirements }) {
  const checklistFields = normalizeChecklistTemplateFields(checklistTemplate);
  const enabledMaintenance = normalizeMaintenanceSettings(maintenanceSettings);
  const draft = normalizeMaintenanceRequirementSetting(requirements);
  const scheduleDay = reminderSchedule?.weekly_inspection_day || draft.weekly_inspection_day;

  return (
    <View style={styles.panelStack}>
      <AppCard style={styles.managerMaintenanceCard}>
        <Text style={styles.panelTitle}>Vehicle Settings</Text>
        <Text style={styles.panelBody}>Manage the same maintenance program, inspection requirements, reminders, and checklist template used on the portal.</Text>
        <View style={styles.settingsOverviewList}>
          <SettingsOverviewRow
            detail={`${enabledMaintenance.length} tracked categories`}
            label="Maintenance Program"
            onPress={() => onOpen('program')}
          />
          <SettingsOverviewRow
            detail={getMaintenanceModeLabel(draft)}
            label="Maintenance Requirements"
            onPress={() => onOpen('requirements')}
          />
          <SettingsOverviewRow
            detail={`Weekly inspection: ${scheduleDay}`}
            label="Reminder Schedule"
            onPress={() => onOpen('reminders')}
          />
          <SettingsOverviewRow
            detail={`${checklistFields.filter((field) => field.enabled).length} checklist fields enabled`}
            label="Checklist Template"
            onPress={() => onOpen('checklist')}
          />
        </View>
      </AppCard>
    </View>
  );
}

function SettingsOverviewRow({ detail, label, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.settingsOverviewRow, pressed ? styles.pressed : null]}>
      <View style={styles.settingTitleBlock}>
        <Text style={styles.settingName}>{label}</Text>
        <Text style={styles.settingMeta}>{detail}</Text>
      </View>
      <Text style={styles.settingsOverviewArrow}>›</Text>
    </Pressable>
  );
}

function SettingsBackButton({ label = 'Back to Settings', onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.settingsBackButton, pressed ? styles.pressed : null]}>
      <Text style={styles.settingsBackButtonText}>‹ {label}</Text>
    </Pressable>
  );
}

function InspectionsPanel({ checklistTemplate, isLoading, requirements }) {
  const checklistFields = normalizeChecklistFields(checklistTemplate);

  if (isLoading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={appTheme.colors.orange} size="large" />
        <Text style={styles.loadingText}>Loading inspections</Text>
      </View>
    );
  }

  return (
    <View style={styles.panelStack}>
      <AppCard style={styles.managerMaintenanceCard}>
        <Text style={styles.panelTitle}>Vehicle Check Requirements</Text>
        <Text style={styles.panelBody}>{getMaintenanceModeLabel(requirements)}</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Weekly day</Text>
            <Text style={styles.summaryValue}>{requirements?.weekly_inspection_day || 'Monday'}</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Reported issues</Text>
            <Text style={styles.summaryValue}>
              {requirements?.custom_weekly_requirements?.require_manager_review_for_reported_issues ? 'Manager review required' : 'Manager review optional'}
            </Text>
          </View>
        </View>
        <Text style={styles.panelCaption}>Changes apply to the next workday so today’s driver checks are not interrupted.</Text>
      </AppCard>

      <AppCard style={styles.managerMaintenanceCard}>
        <Text style={styles.panelTitle}>Checklist Template</Text>
        <Text style={styles.panelBody}>Used for weekly full inspections in Weekly Full Inspection and daily full inspections in Daily Full Inspection.</Text>
        {checklistFields.length ? (
          <View style={styles.checklistList}>
            {checklistFields.map((field) => (
              <View key={field} style={styles.checklistRow}>
                <Text style={styles.checklistDot}>✓</Text>
                <Text style={styles.checklistText}>{field}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyBody}>No checklist fields are enabled yet.</Text>
        )}
      </AppCard>
    </View>
  );
}

function CheckToggle({ checked, compact = false, label, onPress }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => [styles.checkToggleRow, compact ? styles.checkToggleRowCompact : null, pressed ? styles.pressed : null]}
    >
      <View style={[styles.checkboxMark, checked ? styles.checkboxMarkActive : null]}>
        {checked ? <Text style={styles.checkboxMarkText}>✓</Text> : null}
      </View>
      <Text style={[styles.checkToggleText, compact ? styles.checkToggleTextCompact : null]}>{label}</Text>
    </Pressable>
  );
}

function RequirementOptionCard({ draft, option, onSelect }) {
  const selected = draft.maintenance_requirement_mode === option.id;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSelect(option.id)}
      style={({ pressed }) => [
        styles.requirementOptionCard,
        selected ? styles.requirementOptionCardSelected : null,
        pressed ? styles.pressed : null
      ]}
    >
      <View style={styles.requirementOptionTopline}>
        <Text style={styles.requirementOptionLabel}>{option.optionLabel}</Text>
        {option.badge ? (
          <Text style={[styles.requirementBadge, option.badgeTone === 'recommended' ? styles.requirementBadgeRecommended : styles.requirementBadgeStricter]}>
            {option.badge}
          </Text>
        ) : null}
      </View>
      <Text style={styles.requirementOptionTitle}>{option.title}</Text>
      <Text style={styles.requirementOptionDescription}>{option.description}</Text>
      <View style={styles.requirementListBlock}>
        <Text style={styles.summaryLabel}>Daily</Text>
        {option.dailyRequirements.map((item) => (
          <Text key={item} style={styles.requirementListItem}>• {item}</Text>
        ))}
      </View>
      <View style={styles.requirementListBlock}>
        <Text style={styles.summaryLabel}>Weekly</Text>
        {option.weeklyRequirements.map((item) => (
          <Text key={item} style={styles.requirementListItem}>• {item}</Text>
        ))}
      </View>
    </Pressable>
  );
}

function MaintenanceRequirementsEditor({
  draft,
  errorMessage,
  isSaving,
  onChangeCustomDaily,
  onChangeCustomWeekly,
  onChangeMode,
  onChangeWeeklyDay,
  onSave
}) {
  return (
    <AppCard style={styles.managerMaintenanceCard}>
      <Text style={styles.panelTitle}>Maintenance Requirements</Text>
      <Text style={styles.panelBody}>Choose what drivers must complete for vehicle checks.</Text>

      <View style={styles.requirementOptionsList}>
        {MAINTENANCE_REQUIREMENT_OPTIONS.map((option) => (
          <RequirementOptionCard
            draft={draft}
            key={option.id}
            onSelect={onChangeMode}
            option={option}
          />
        ))}
      </View>

      <View style={styles.weekdaySelector}>
        <Text style={styles.summaryLabel}>Weekly inspection day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.weekdayChips}>
            {WEEKLY_INSPECTION_DAYS.map((day) => (
              <Pressable
                key={day}
                onPress={() => onChangeWeeklyDay(day)}
                style={({ pressed }) => [
                  styles.weekdayChip,
                  draft.weekly_inspection_day === day ? styles.weekdayChipActive : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text style={[styles.weekdayChipText, draft.weekly_inspection_day === day ? styles.weekdayChipTextActive : null]}>{day}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {draft.maintenance_requirement_mode === 'custom' ? (
        <View style={styles.customRequirements}>
          <Text style={styles.settingName}>Custom Daily Requirements</Text>
          <CheckToggle
            checked={draft.custom_daily_requirements.require_truck_confirmation}
            label="Require daily truck confirmation"
            onPress={() => onChangeCustomDaily('require_truck_confirmation', !draft.custom_daily_requirements.require_truck_confirmation)}
          />
          <CheckToggle
            checked={draft.custom_daily_requirements.require_odometer_entry}
            label="Require daily odometer entry"
            onPress={() => onChangeCustomDaily('require_odometer_entry', !draft.custom_daily_requirements.require_odometer_entry)}
          />
          <CheckToggle
            checked={draft.custom_daily_requirements.show_issue_note_box}
            label="Show daily issue note box"
            onPress={() => onChangeCustomDaily('show_issue_note_box', !draft.custom_daily_requirements.show_issue_note_box)}
          />
          <CheckToggle
            checked={draft.custom_daily_requirements.require_full_checklist_daily}
            label="Require full checklist daily"
            onPress={() => onChangeCustomDaily('require_full_checklist_daily', !draft.custom_daily_requirements.require_full_checklist_daily)}
          />
          <Text style={[styles.settingName, styles.customRequirementsHeading]}>Custom Weekly Requirements</Text>
          <CheckToggle
            checked={draft.custom_weekly_requirements.require_full_checklist_weekly}
            label="Require full checklist weekly"
            onPress={() => onChangeCustomWeekly('require_full_checklist_weekly', !draft.custom_weekly_requirements.require_full_checklist_weekly)}
          />
          <CheckToggle
            checked={draft.custom_weekly_requirements.require_manager_review_for_reported_issues}
            label="Require manager review for reported issues"
            onPress={() => onChangeCustomWeekly(
              'require_manager_review_for_reported_issues',
              !draft.custom_weekly_requirements.require_manager_review_for_reported_issues
            )}
          />
        </View>
      ) : null}

      <Text style={styles.panelCaption}>Changes apply to the next workday so today’s driver checks are not interrupted.</Text>
      {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}
      <Pressable disabled={isSaving} onPress={onSave} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
        {isSaving ? (
          <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
        ) : (
          <Text style={styles.saveButtonText}>Save Requirements</Text>
        )}
      </Pressable>
    </AppCard>
  );
}

function ReminderScheduleEditor({ draft, errorMessage, isSaving, onChange, onSave }) {
  return (
    <AppCard style={styles.managerMaintenanceCard}>
      <Text style={styles.panelTitle}>Reminder Schedule</Text>
      <Text style={styles.panelBody}>Set weekly inspection day and warning windows for vehicle readiness.</Text>
      <View style={styles.weekdaySelector}>
        <Text style={styles.summaryLabel}>Weekly inspection day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.weekdayChips}>
            {WEEKLY_INSPECTION_DAYS.map((day) => (
              <Pressable
                key={day}
                onPress={() => onChange('weekly_inspection_day', day)}
                style={({ pressed }) => [
                  styles.weekdayChip,
                  draft.weekly_inspection_day === day ? styles.weekdayChipActive : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text style={[styles.weekdayChipText, draft.weekly_inspection_day === day ? styles.weekdayChipTextActive : null]}>{day}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={styles.inlineFieldRow}>
        <View style={styles.inlineField}>
          <Text style={styles.summaryLabel}>Maintenance miles</Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={(value) => onChange('maintenance_warning_miles', value.replace(/\D/g, ''))}
            placeholder="1000"
            placeholderTextColor={appTheme.colors.textTertiary}
            style={styles.inlineInput}
            value={String(draft.maintenance_warning_miles ?? '')}
          />
        </View>
        <View style={styles.inlineField}>
          <Text style={styles.summaryLabel}>Maintenance days</Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={(value) => onChange('maintenance_warning_days', value.replace(/\D/g, ''))}
            placeholder="14"
            placeholderTextColor={appTheme.colors.textTertiary}
            style={styles.inlineInput}
            value={String(draft.maintenance_warning_days ?? '')}
          />
        </View>
      </View>
      <View style={styles.inlineField}>
        <Text style={styles.summaryLabel}>Document expiration warning</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={(value) => onChange('document_warning_days', value.replace(/\D/g, ''))}
          placeholder="30"
          placeholderTextColor={appTheme.colors.textTertiary}
          style={styles.inlineInput}
          value={String(draft.document_warning_days ?? '')}
        />
      </View>
      <Text style={styles.panelCaption}>Expired documents and overdue maintenance still block vehicles automatically.</Text>
      {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}
      <Pressable disabled={isSaving} onPress={onSave} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
        {isSaving ? (
          <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
        ) : (
          <Text style={styles.saveButtonText}>Save Schedule</Text>
        )}
      </Pressable>
    </AppCard>
  );
}

function ChecklistTemplateEditor({ errorMessage, fields, isSaving, onSave, onToggleField }) {
  return (
    <AppCard style={styles.managerMaintenanceCard}>
      <Text style={styles.panelTitle}>Checklist Template</Text>
      <Text style={styles.panelBody}>Enable or disable fields for full vehicle inspections.</Text>
      <Text style={styles.panelCaption}>This checklist is used for weekly full inspections in Weekly Full Inspection and daily full inspections in Daily Full Inspection.</Text>
      {fields.length ? (
        <View style={styles.checklistList}>
          {fields.map((field, index) => (
            <View key={field.id} style={[styles.checklistRow, field.enabled ? null : styles.checklistRowDisabled]}>
              <Text style={styles.checklistNumber}>{index + 1}</Text>
              <View style={styles.checklistCopy}>
                <Text style={styles.checklistText}>{field.label}</Text>
                {field.detail ? <Text style={styles.settingMeta}>{field.detail}</Text> : null}
              </View>
              <CheckToggle
                checked={field.enabled}
                compact
                label={field.enabled ? 'On' : 'Off'}
                onPress={() => onToggleField(field.id, !field.enabled)}
              />
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyBody}>No checklist fields are available yet.</Text>
      )}
      {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}
      <Pressable disabled={isSaving} onPress={onSave} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
        {isSaving ? (
          <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
        ) : (
          <Text style={styles.saveButtonText}>Save Template</Text>
        )}
      </Pressable>
    </AppCard>
  );
}

function MaintenanceSettingsPanel({
  checklistTemplate,
  checklistTemplateErrorMessage,
  isLoading,
  isSavingChecklistTemplate,
  isSavingRequirements,
  isSavingReminderSchedule,
  onChangeCustomDaily,
  onChangeCustomWeekly,
  onChangeReminderSchedule,
  onChangeRequirementMode,
  onChangeWeeklyDay,
  onSaveChecklistTemplate,
  onSaveRequirements,
  onSaveReminderSchedule,
  onToggleChecklistField,
  reminderSchedule,
  reminderScheduleErrorMessage,
  requirementErrorMessage,
  requirements,
  settings
}) {
  const enabledSettings = normalizeMaintenanceSettings(settings);
  const checklistFields = normalizeChecklistTemplateFields(checklistTemplate);
  const draft = normalizeMaintenanceRequirementSetting(requirements);
  const scheduleDraft = {
    weekly_inspection_day: reminderSchedule?.weekly_inspection_day || draft.weekly_inspection_day,
    maintenance_warning_miles: reminderSchedule?.maintenance_warning_miles ?? draft.maintenance_warning_miles,
    maintenance_warning_days: reminderSchedule?.maintenance_warning_days ?? draft.maintenance_warning_days,
    document_warning_days: reminderSchedule?.document_warning_days ?? draft.document_warning_days
  };

  if (isLoading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={appTheme.colors.orange} size="large" />
        <Text style={styles.loadingText}>Loading settings</Text>
      </View>
    );
  }

  return (
    <View style={styles.panelStack}>
      <MaintenanceRequirementsEditor
        draft={draft}
        errorMessage={requirementErrorMessage}
        isSaving={isSavingRequirements}
        onChangeCustomDaily={onChangeCustomDaily}
        onChangeCustomWeekly={onChangeCustomWeekly}
        onChangeMode={onChangeRequirementMode}
        onChangeWeeklyDay={onChangeWeeklyDay}
        onSave={onSaveRequirements}
      />

      <ReminderScheduleEditor
        draft={scheduleDraft}
        errorMessage={reminderScheduleErrorMessage}
        isSaving={isSavingReminderSchedule}
        onChange={onChangeReminderSchedule}
        onSave={onSaveReminderSchedule}
      />

      <ChecklistTemplateEditor
        errorMessage={checklistTemplateErrorMessage}
        fields={checklistFields}
        isSaving={isSavingChecklistTemplate}
        onSave={onSaveChecklistTemplate}
        onToggleField={onToggleChecklistField}
      />

      <Text style={styles.panelCaption}>
        {checklistFields.filter((field) => field.enabled).length} checklist fields enabled • {enabledSettings.length} maintenance categories tracked
      </Text>
    </View>
  );
}

function EditVehicleModal({ errorMessage, form, isSaving, mode = 'edit', onChange, onClose, onSubmit, vehicle, visible }) {
  const isEdit = mode === 'edit';
  const missingDetails = [
    !form.plate ? 'License plate' : null,
    !form.truck_type ? 'Vehicle type' : null,
    !form.registration_expiration ? 'Registration expiration' : null,
    !form.insurance_expiration ? 'Insurance expiration' : null,
    !Number(form.current_mileage) ? 'Current mileage' : null
  ].filter(Boolean);

  return (
    <KeyboardAwareModal onClose={onClose} visible={visible}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{isEdit ? `Edit ${vehicle?.name || 'Vehicle'}` : 'Add Vehicle'}</Text>
              <Text style={styles.modalSubtitle}>{isEdit ? vehicle?.name || 'Vehicle details' : 'Create one fleet vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close edit vehicle" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.modalScrollContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            {isEdit && missingDetails.length ? (
              <View style={styles.vehicleMissingSummary}>
                <Text style={styles.vehicleMissingTitle}>
                  {missingDetails.length} vehicle detail{missingDetails.length === 1 ? '' : 's'} need attention
                </Text>
                <Text style={styles.vehicleMissingText}>{missingDetails.join(', ')}</Text>
              </View>
            ) : null}
            <VehicleFormSectionTitle>Vehicle Details</VehicleFormSectionTitle>
            <Field label="Vehicle ID" onChangeText={(value) => onChange('name', value.toUpperCase())} placeholder="Vehicle ID" value={form.name} />
            <Field attention={isEdit && !form.plate ? 'Required' : ''} label="License Plate" onChangeText={(value) => onChange('plate', value.toUpperCase())} placeholder="License Plate" value={form.plate} />
            <Field label="Make" onChangeText={(value) => onChange('make', value)} placeholder="Make" value={form.make} />
            <Field label="Model" onChangeText={(value) => onChange('model', value)} placeholder="Model" value={form.model} />
            <Field keyboardType="number-pad" label="Year" onChangeText={(value) => onChange('year', value.replace(/\D/g, '').slice(0, 4))} placeholder="Year" value={form.year} />
            <OptionPicker attention={isEdit && !form.truck_type ? 'Required' : ''} label="Vehicle Type" onChange={(value) => onChange('truck_type', value)} options={VEHICLE_TYPE_OPTIONS} value={form.truck_type} />
            {form.truck_type === 'Other' ? (
              <Field label="Custom Vehicle Type" onChangeText={(value) => onChange('custom_truck_type', value)} placeholder="Custom vehicle type" value={form.custom_truck_type} />
            ) : null}
            <OptionPicker label="Fuel Type" onChange={(value) => onChange('fuel_type', value)} options={FUEL_TYPE_OPTIONS} value={form.fuel_type} />
            <VehicleFormSectionTitle>Documents</VehicleFormSectionTitle>
            <Field attention={isEdit && !form.registration_expiration ? 'Not recorded' : ''} label="Registration Expiration" onChangeText={(value) => onChange('registration_expiration', value)} placeholder="YYYY-MM-DD" value={form.registration_expiration} />
            <Field attention={isEdit && !form.insurance_expiration ? 'Not recorded' : ''} label="Insurance Expiration" onChangeText={(value) => onChange('insurance_expiration', value)} placeholder="YYYY-MM-DD" value={form.insurance_expiration} />
            <VehicleFormSectionTitle>Usage</VehicleFormSectionTitle>
            <Field attention={isEdit && !Number(form.current_mileage) ? 'Not recorded' : ''} keyboardType="number-pad" label="Current Mileage" onChangeText={(value) => onChange('current_mileage', value.replace(/\D/g, ''))} placeholder="Current mileage" value={form.current_mileage} />
            <VehicleFormSectionTitle>Notes</VehicleFormSectionTitle>
            <Field label="Vehicle Notes" multiline onChangeText={(value) => onChange('notes', value)} placeholder="Internal notes" value={form.notes} />
          </ScrollView>

          {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}

          <View style={styles.modalActions}>
            <AppButton label="Cancel" onPress={onClose} style={styles.modalActionButton} variant="outline" />
            <Pressable
              accessibilityLabel={isEdit ? 'Save vehicle changes' : 'Confirm add vehicle'}
              disabled={isSaving}
              onPress={onSubmit}
              style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}
            >
              {isSaving ? (
                <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>{isEdit ? 'Save Changes' : 'Add Vehicle'}</Text>
              )}
            </Pressable>
          </View>
    </KeyboardAwareModal>
  );
}

function TruckActionRow({ disabled = false, disabledHint = 'Coming soon', label, onPress, primary = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.truckActionRow,
        primary ? styles.truckActionRowPrimary : null,
        disabled ? styles.truckActionRowDisabled : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Text style={[
        styles.truckActionRowText,
        primary ? styles.truckActionRowTextPrimary : null,
        disabled ? styles.truckActionRowTextDisabled : null
      ]}>
        {label}
      </Text>
      {disabled && disabledHint ? <Text style={styles.truckActionRowMeta}>{disabledHint}</Text> : null}
    </Pressable>
  );
}

function AssignInspectionModal({
  drivers,
  errorMessage,
  form,
  isLoadingDrivers,
  isSaving,
  onChange,
  onClose,
  onSubmit,
  vehicles,
  visible
}) {
  const selectableDrivers = (drivers || []).filter((driver) => driver?.is_active !== false);
  const selectedVehicle = (vehicles || []).find((vehicle) => vehicle.id === form.vehicle_id);
  const selectedDriver = selectableDrivers.find((driver) => driver.id === form.driver_id);
  const canSubmit = Boolean(form.vehicle_id && form.driver_id && form.due_date && !isSaving);

  return (
    <KeyboardAwareModal onClose={onClose} visible={visible}>
      <View style={styles.modalHeader}>
        <View>
          <Text style={styles.modalTitle}>Assign Inspection</Text>
          <Text style={styles.modalSubtitle}>
            {[selectedVehicle?.name, selectedDriver?.name].filter(Boolean).join(' to ') || 'Choose a truck and driver'}
          </Text>
        </View>
        <Pressable accessibilityLabel="Close assign inspection" onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>×</Text>
        </Pressable>
      </View>

      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.modalScrollContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.modalScroll}
      >
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Vehicle</Text>
          <View style={styles.assignmentOptionList}>
            {(vehicles || []).map((vehicle) => {
              const selected = vehicle.id === form.vehicle_id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={vehicle.id || vehicle.name}
                  onPress={() => onChange('vehicle_id', vehicle.id)}
                  style={({ pressed }) => [
                    styles.assignmentOption,
                    selected ? styles.assignmentOptionSelected : null,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Text numberOfLines={1} style={[styles.assignmentOptionTitle, selected ? styles.assignmentOptionTitleSelected : null]}>
                    {vehicle.name || 'Truck not recorded'}
                  </Text>
                  <Text numberOfLines={1} style={styles.assignmentOptionMeta}>
                    {[getVehicleDescription(vehicle), formatMileage(vehicle.current_mileage)].filter(Boolean).join(' • ')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Driver</Text>
          {isLoadingDrivers ? (
            <View style={styles.assignmentLoadingRow}>
              <ActivityIndicator color={appTheme.colors.orange} size="small" />
              <Text style={styles.assignmentLoadingText}>Loading drivers</Text>
            </View>
          ) : (
            <View style={styles.assignmentOptionList}>
              {selectableDrivers.map((driver) => {
                const selected = driver.id === form.driver_id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={driver.id}
                    onPress={() => onChange('driver_id', driver.id)}
                    style={({ pressed }) => [
                      styles.assignmentOption,
                      selected ? styles.assignmentOptionSelected : null,
                      pressed ? styles.pressed : null
                    ]}
                  >
                    <Text numberOfLines={1} style={[styles.assignmentOptionTitle, selected ? styles.assignmentOptionTitleSelected : null]}>
                      {getDriverDisplayName(driver)}
                    </Text>
                    <Text numberOfLines={1} style={styles.assignmentOptionMeta}>{driver.email || 'Driver app user'}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {!isLoadingDrivers && !selectableDrivers.length ? (
            <Text style={styles.panelCaption}>No active drivers are available to assign.</Text>
          ) : null}
        </View>

        <Field label="Due date" onChangeText={(value) => onChange('due_date', value)} placeholder="YYYY-MM-DD" value={form.due_date} />

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Priority</Text>
          <View style={styles.optionPicker}>
            {[
              { label: 'Normal', value: 'normal' },
              { label: 'Urgent', value: 'urgent' }
            ].map((option) => {
              const selected = form.priority === option.value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.value}
                  onPress={() => onChange('priority', option.value)}
                  style={({ pressed }) => [
                    styles.optionChip,
                    selected ? styles.optionChipSelected : null,
                    pressed ? styles.pressed : null
                  ]}
                >
                  <Text style={[styles.optionChipText, selected ? styles.optionChipTextSelected : null]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <CheckToggle
          checked={form.require_before_route_start}
          label="Require completion before route start"
          onPress={() => onChange('require_before_route_start', !form.require_before_route_start)}
        />
        <Field label="Note" multiline onChangeText={(value) => onChange('note', value)} placeholder="Optional driver note" value={form.note} />
      </ScrollView>

      {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}

      <View style={styles.modalActions}>
        <AppButton label="Cancel" onPress={onClose} style={styles.modalActionButton} variant="outline" />
        <Pressable
          disabled={!canSubmit}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.saveButton,
            !canSubmit ? styles.saveButtonDisabled : null,
            pressed && canSubmit ? styles.pressed : null
          ]}
        >
          {isSaving ? (
            <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Send Assignment</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAwareModal>
  );
}

function VehicleActionsModal({
  onAssignInspection,
  onClose,
  onLogMaintenance,
  onOpenDetails,
  onRunInspection,
  onUpdateOdometer,
  onViewHistory,
  vehicle
}) {
  return (
    <KeyboardAwareModal cardStyle={styles.smallModalCard} onClose={onClose} visible={Boolean(vehicle)}>
      <View style={styles.modalHeader}>
        <View>
          <Text style={styles.modalTitle}>Vehicle Actions</Text>
          <Text style={styles.modalSubtitle}>{vehicle?.name || 'Vehicle'}</Text>
        </View>
        <Pressable accessibilityLabel="Close vehicle actions" onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>×</Text>
        </Pressable>
      </View>
      <View style={styles.truckActionList}>
        <TruckActionRow label="Open Vehicle Details" onPress={onOpenDetails} primary />
        <TruckActionRow label="Update Odometer" onPress={onUpdateOdometer} />
        <TruckActionRow label="Run Inspection" onPress={onRunInspection} />
        <TruckActionRow label="Assign Inspection" onPress={onAssignInspection} />
        <TruckActionRow label="Log Maintenance" onPress={onLogMaintenance} />
        <TruckActionRow label="View History" onPress={onViewHistory} />
      </View>
    </KeyboardAwareModal>
  );
}

function OdometerModal({ errorMessage, form, isSaving, onChange, onClose, onConfirmLower, onSubmit, vehicle }) {
  const currentMileage = Number(vehicle?.current_mileage || 0);
  const nextMileage = Number(form.odometer_reading || 0);
  const showLowerWarning = form.odometer_reading !== '' && nextMileage < currentMileage;
  const canSave = !showLowerWarning || form.confirmedLower;

  return (
    <KeyboardAwareModal onClose={onClose} visible={Boolean(vehicle)}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Edit Odometer</Text>
              <Text style={styles.modalSubtitle}>{vehicle?.name || 'Vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close odometer editor" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.odometerSummary}>
            <View>
              <Text style={styles.summaryLabel}>Vehicle ID</Text>
              <Text style={styles.summaryValue}>{vehicle?.name || 'Not recorded'}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Description</Text>
              <Text style={styles.summaryValue}>{getVehicleDescription(vehicle)}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Current odometer</Text>
              <Text style={styles.summaryValue}>{formatMileage(currentMileage)}</Text>
            </View>
          </View>

          <Field
            keyboardType="number-pad"
            label="New odometer reading"
            onChangeText={(value) => onChange('odometer_reading', value.replace(/\D/g, ''))}
            placeholder="Current mileage"
            value={form.odometer_reading}
          />
          <Field
            label="Optional notes"
            multiline
            onChangeText={(value) => onChange('notes', value)}
            placeholder="Reason for manager override"
            value={form.notes}
          />

          {showLowerWarning ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                This is lower than the current odometer reading. Only continue if you are correcting an error.
              </Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.confirmedLower }}
                onPress={() => onConfirmLower(!form.confirmedLower)}
                style={({ pressed }) => [styles.confirmRow, pressed ? styles.pressed : null]}
              >
                <View style={[styles.checkboxMark, form.confirmedLower ? styles.checkboxMarkActive : null]}>
                  {form.confirmedLower ? <Text style={styles.checkboxMarkText}>✓</Text> : null}
                </View>
                <Text style={styles.confirmText}>I understand and want to save this correction.</Text>
              </Pressable>
            </View>
          ) : null}

          {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}

          <View style={styles.modalActions}>
            <AppButton label="Cancel" onPress={onClose} style={styles.modalActionButton} variant="outline" />
            <Pressable disabled={isSaving || !canSave} onPress={onSubmit} style={({ pressed }) => [styles.saveButton, isSaving || !canSave ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
              {isSaving ? (
                <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </Pressable>
          </View>
    </KeyboardAwareModal>
  );
}

function ServiceRecordModal({ errorMessage, form, isSaving, onChange, onClose, onSubmit, vehicle }) {
  return (
    <KeyboardAwareModal onClose={onClose} visible={Boolean(vehicle)}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Log Completed Maintenance</Text>
              <Text style={styles.modalSubtitle}>{vehicle?.name || 'Vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close service record" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.odometerSummary}>
            <View>
              <Text style={styles.summaryLabel}>Vehicle ID</Text>
              <Text style={styles.summaryValue}>{vehicle?.name || 'Not recorded'}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Current odometer</Text>
              <Text style={styles.summaryValue}>{formatMileage(vehicle?.current_mileage)}</Text>
            </View>
          </View>
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.modalScrollContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <Field label="Maintenance item completed" onChangeText={(value) => onChange('service_type', value)} placeholder={SERVICE_TYPE_OPTIONS.join(', ')} value={form.service_type} />
            <Field keyboardType="number-pad" label="Service odometer reading" onChangeText={(value) => onChange('mileage_at_service', value.replace(/\D/g, ''))} placeholder="Mileage at service" value={form.mileage_at_service} />
            <Field label="Service date" onChangeText={(value) => onChange('service_date', value)} placeholder="YYYY-MM-DD" value={form.service_date} />
            <Field label="Vendor or shop name" onChangeText={(value) => onChange('vendor_name', value)} placeholder="Optional" value={form.vendor_name} />
            <Field keyboardType="numeric" label="Cost" onChangeText={(value) => onChange('cost', value)} placeholder="Optional" value={form.cost} />
            <Field label="Notes" multiline onChangeText={(value) => onChange('description', value)} placeholder="Optional notes" value={form.description} />
          </ScrollView>
          {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}
          <View style={styles.modalActions}>
            <AppButton label="Cancel" onPress={onClose} style={styles.modalActionButton} variant="outline" />
            <Pressable disabled={isSaving} onPress={onSubmit} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
              {isSaving ? (
                <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Log Maintenance</Text>
              )}
            </Pressable>
          </View>
    </KeyboardAwareModal>
  );
}

function ServiceHistoryModal({ history, isLoading, onClose, vehicle }) {
  return (
    <KeyboardAwareModal onClose={onClose} visible={Boolean(vehicle)}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Service History</Text>
              <Text style={styles.modalSubtitle}>{vehicle?.name || 'Vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close service history" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
          {isLoading ? (
            <ActivityIndicator color={appTheme.colors.orange} size="large" />
          ) : history.length ? (
            <ScrollView contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={false}>
              {history.map((row) => (
                <View key={row.id || `${row.service_date}-${row.service_type}`} style={styles.historyRow}>
                  <Text style={styles.historyTitle}>{formatDate(row.service_date)} • {row.service_type || 'Service'}</Text>
                  <Text style={styles.historyMeta}>{row.description || 'No description'}</Text>
                  {row.vendor_name ? <Text style={styles.historyMeta}>{row.vendor_name}</Text> : null}
                  <Text style={styles.historyMeta}>{row.mileage_at_service ? formatMileage(row.mileage_at_service) : 'Mileage not recorded'}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.emptyBody}>No service records yet.</Text>
          )}
    </KeyboardAwareModal>
  );
}

function InspectionChoiceChip({
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
      style={[
        styles.inspectionStatusButton,
        selected && variant === 'pass' ? styles.inspectionStatusButtonPass : null,
        selected && variant === 'issue' ? styles.inspectionStatusButtonFail : null,
        selected && variant === 'unsafe' ? styles.inspectionStatusButtonUnsafe : null
      ]}
    >
      <Text
        style={[
          styles.inspectionStatusButtonText,
          selected && variant === 'pass' ? styles.inspectionStatusButtonTextActive : null,
          selected && variant === 'issue' ? styles.inspectionStatusButtonTextFail : null,
          selected && variant === 'unsafe' ? styles.inspectionStatusButtonTextUnsafe : null
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function InspectionIssueField({ field, item, onChangeIssueDetail }) {
  const currentValue = item.issue_details?.[field.key];

  return (
    <View style={styles.inspectionIssueGroup}>
      <Text style={styles.inspectionIssueLabel}>{field.label}</Text>
      <View style={styles.inspectionChipWrap}>
        {field.options.map((option) => {
          const selected = field.type === 'multi'
            ? Array.isArray(currentValue) && currentValue.includes(option)
            : currentValue === option;

          return (
            <InspectionChoiceChip
              key={option}
              label={option}
              onPress={() => onChangeIssueDetail(item.checklist_item_key, field, option)}
              selected={selected}
              variant="issue"
            />
          );
        })}
      </View>
    </View>
  );
}

function InspectionSeveritySelector({ item, onChangeSeverity }) {
  return (
    <View style={styles.inspectionIssueGroup}>
      <Text style={styles.inspectionIssueLabel}>Severity</Text>
      <View style={styles.inspectionChipWrap}>
        {INSPECTION_SEVERITY_OPTIONS.map((option) => (
          <InspectionChoiceChip
            key={option.value}
            label={option.label}
            onPress={() => onChangeSeverity(item.checklist_item_key, option.value)}
            selected={item.severity === option.value}
            variant={option.value === 'unsafe' ? 'unsafe' : 'issue'}
          />
        ))}
      </View>
    </View>
  );
}

function InspectionPhotoSection({
  isUploading,
  item,
  onAttachPhoto,
  onRemovePhoto
}) {
  const photos = item.photos || [];

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
                onPress={() => onRemovePhoto(item.checklist_item_key, index)}
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
        onPress={() => onAttachPhoto(item.checklist_item_key)}
        style={({ pressed }) => [
          styles.inspectionPhotoButton,
          isUploading ? styles.saveButtonDisabled : null,
          pressed && !isUploading ? styles.pressed : null
        ]}
      >
        {isUploading ? (
          <ActivityIndicator color={appTheme.colors.orangeDeep} size="small" />
        ) : (
          <Text style={styles.inspectionPhotoButtonText}>{photos.length ? 'Add Another Photo' : 'Attach Photo'}</Text>
        )}
      </Pressable>
    </View>
  );
}

function InspectionPhotoPreview({ photo, index }) {
  const photoUrl = photo?.url || null;
  const fallbackLabel = photo?.storage_path || 'attached';

  return (
    <View style={styles.inspectionPhotoPreview}>
      {photoUrl ? (
        <Image
          accessibilityLabel={`Inspection photo ${index + 1}`}
          resizeMode="cover"
          source={{ uri: photoUrl }}
          style={styles.inspectionPhotoThumbnail}
        />
      ) : null}
      <View style={styles.inspectionPhotoPreviewText}>
        <Text style={styles.historyMeta}>Photo {index + 1}</Text>
        {photoUrl ? (
          <Pressable onPress={() => Linking.openURL(photoUrl).catch(() => {})}>
            <Text style={styles.historyLink}>Open photo</Text>
          </Pressable>
        ) : (
          <Text style={styles.historyMeta}>{fallbackLabel}</Text>
        )}
      </View>
    </View>
  );
}

function InspectionStatusRow({
  isUploadingPhoto,
  item,
  onAttachPhoto,
  onChangeIssueDetail,
  onChangeNote,
  onChangeSeverity,
  onChangeStatus,
  onChangeTruckCleanliness,
  onRemovePhoto
}) {
  const definition = getInspectionItemDefinition(item);
  const isFail = isInspectionIssueItem(item);
  const selectedCleanlinessCondition = item.status === 'pass'
    ? 'clean'
    : normalizeInspectionItemKey(item.issue_details?.condition);

  return (
    <View style={styles.inspectionChecklistRow}>
      <View style={styles.inspectionChecklistHeader}>
        <View style={styles.inspectionChecklistText}>
          <Text style={styles.historyTitle}>{item.label}</Text>
          <Text style={styles.historyMeta}>{isFail ? 'Issue marked' : 'Passed'}</Text>
        </View>
        {item.checklist_item_key === 'truck_cleanliness' ? (
          <View style={[styles.inspectionStatusActions, styles.inspectionChipWrapFull]}>
            {definition.conditionOptions.map((option) => (
              <InspectionChoiceChip
                key={option.value}
                accessibilityLabel={`Mark truck cleanliness ${option.label}`}
                label={option.label}
                onPress={() => onChangeTruckCleanliness(item.checklist_item_key, option.value)}
                selected={selectedCleanlinessCondition === option.value}
                variant={option.status === 'pass' ? 'pass' : 'issue'}
              />
            ))}
          </View>
        ) : (
          <View style={styles.inspectionStatusActions}>
            <InspectionChoiceChip
              accessibilityLabel={`Mark ${item.label} passed`}
              label="Pass"
              onPress={() => onChangeStatus(item.checklist_item_key, 'pass')}
              selected={item.status === 'pass'}
              variant="pass"
            />
            <InspectionChoiceChip
              accessibilityLabel={`Mark ${item.label} has an issue`}
              label="Issue"
              onPress={() => onChangeStatus(item.checklist_item_key, 'issue')}
              selected={isFail}
              variant="issue"
            />
          </View>
        )}
      </View>
      {isFail ? (
        <View style={styles.inspectionIssuePanel}>
          {(definition.issueFields || []).map((field) => (
            <InspectionIssueField
              field={field}
              item={item}
              key={field.key}
              onChangeIssueDetail={onChangeIssueDetail}
            />
          ))}
          {definition.hideSeveritySelector ? null : (
            <InspectionSeveritySelector item={item} onChangeSeverity={onChangeSeverity} />
          )}
          <InspectionPhotoSection
            isUploading={isUploadingPhoto}
            item={item}
            onAttachPhoto={onAttachPhoto}
            onRemovePhoto={onRemovePhoto}
          />
          <TextInput
            multiline
            onChangeText={(value) => onChangeNote(item.checklist_item_key, value)}
            placeholder="Optional notes"
            placeholderTextColor={appTheme.colors.textTertiary}
            style={styles.inspectionItemNoteInput}
            textAlignVertical="top"
            value={item.note || ''}
          />
        </View>
      ) : null}
    </View>
  );
}

function InspectionModal({
  errorMessage,
  form,
  isSaving,
  isUploadingPhotoKey,
  onAttachPhoto,
  onChangeField,
  onChangeIssueDetail,
  onChangeNote,
  onChangeSeverity,
  onChangeStatus,
  onChangeTruckCleanliness,
  onClose,
  onRemovePhoto,
  onSubmit,
  vehicle
}) {
  const failedCount = (form.items || []).filter(isInspectionIssueItem).length;

  return (
    <KeyboardAwareModal onClose={onClose} visible={Boolean(vehicle)}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Run Inspection</Text>
              <Text style={styles.modalSubtitle}>{vehicle?.name || 'Vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close inspection" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.odometerSummary}>
            <View>
              <Text style={styles.summaryLabel}>Vehicle ID</Text>
              <Text style={styles.summaryValue}>{vehicle?.name || 'Not recorded'}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Current odometer</Text>
              <Text style={styles.summaryValue}>{formatMileage(vehicle?.current_mileage)}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Issues marked</Text>
              <Text style={styles.summaryValue}>{failedCount}</Text>
            </View>
          </View>

          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.modalScrollContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <Field label="Inspection date" onChangeText={(value) => onChangeField('inspection_date', value)} placeholder="YYYY-MM-DD" value={form.inspection_date} />
            <Field keyboardType="number-pad" label="Odometer" onChangeText={(value) => onChangeField('odometer', value.replace(/\D/g, ''))} placeholder="Current odometer" value={form.odometer} />
            {(form.items || []).map((item) => (
              <InspectionStatusRow
                isUploadingPhoto={isUploadingPhotoKey === item.checklist_item_key}
                item={item}
                key={item.checklist_item_key}
                onAttachPhoto={onAttachPhoto}
                onChangeIssueDetail={onChangeIssueDetail}
                onChangeNote={onChangeNote}
                onChangeSeverity={onChangeSeverity}
                onChangeStatus={onChangeStatus}
                onChangeTruckCleanliness={onChangeTruckCleanliness}
                onRemovePhoto={onRemovePhoto}
              />
            ))}
            <Field label="Inspection notes" multiline onChangeText={(value) => onChangeField('issue_note', value)} placeholder="Optional notes or issue details" value={form.issue_note} />
          </ScrollView>

          {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}

          <View style={styles.modalActions}>
            <AppButton label="Cancel" onPress={onClose} style={styles.modalActionButton} variant="outline" />
            <Pressable disabled={isSaving} onPress={onSubmit} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
              {isSaving ? (
                <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save Inspection</Text>
              )}
            </Pressable>
          </View>
    </KeyboardAwareModal>
  );
}

function InspectionHistoryModal({ history, isLoading, onClose, onOpenInspection, vehicle }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(vehicle)}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Inspection History</Text>
              <Text style={styles.modalSubtitle}>{vehicle?.name || 'Vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close inspection history" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
          {isLoading ? (
            <ActivityIndicator color={appTheme.colors.orange} size="large" />
          ) : history.length ? (
            <ScrollView contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={false}>
              {history.map((row) => (
                <Pressable
                  accessibilityRole="button"
                  key={row.id || `${row.inspection_date}-${row.submitted_at}`}
                  onPress={() => onOpenInspection(row)}
                  style={({ pressed }) => [styles.historyRow, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.historyTitle}>{formatDate(row.inspection_date)} • {row.inspection_type_label || 'Inspection'}</Text>
                  <Text style={styles.historyMeta}>{row.status_label || row.status || 'Submitted'} • {row.odometer ? formatMileage(row.odometer) : 'Mileage not recorded'}</Text>
                  <Text style={styles.historyMeta}>
                    {Number(row.issue_count || row.failed_items_count || 0)} issue{Number(row.issue_count || row.failed_items_count || 0) === 1 ? '' : 's'} marked
                  </Text>
                  {row.issue_note ? <Text style={styles.historyMeta}>{row.issue_note}</Text> : null}
                  <Text style={styles.historyLink}>Open inspection</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.emptyBody}>No inspection records yet.</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OdometerHistoryModal({ history, isLoading, onClose, vehicle }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(vehicle)}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Odometer History</Text>
              <Text style={styles.modalSubtitle}>{vehicle?.name || 'Vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close odometer history" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
          {isLoading ? (
            <ActivityIndicator color={appTheme.colors.orange} size="large" />
          ) : history.length ? (
            <ScrollView contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={false}>
              {history.map((entry) => (
                <View key={entry.id || `${entry.recorded_at}-${entry.odometer_reading}`} style={styles.historyRow}>
                  <Text style={styles.historyTitle}>{entry.odometer_reading ? formatMileage(entry.odometer_reading) : 'No reading'}</Text>
                  <Text style={styles.historyMeta}>
                    {[entry.recorded_at ? formatDate(entry.recorded_at.slice(0, 10)) : null, entry.source, entry.driver?.name, entry.route?.work_area_name ? `Route ${entry.route.work_area_name}` : null]
                      .filter(Boolean)
                      .join(' • ') || 'Odometer entry'}
                  </Text>
                  {entry.notes ? <Text style={styles.historyMeta}>{entry.notes}</Text> : null}
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.emptyBody}>No odometer history yet.</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AssignmentHistoryModal({ history, isLoading, onClose, vehicle }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(vehicle)}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Assignment History</Text>
              <Text style={styles.modalSubtitle}>{vehicle?.name || 'Vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close assignment history" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
          {isLoading ? (
            <ActivityIndicator color={appTheme.colors.orange} size="large" />
          ) : history.length ? (
            <ScrollView contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={false}>
              {history.map((assignment) => (
                <View key={assignment.id || `${assignment.date}-${assignment.work_area_name}`} style={styles.historyRow}>
                  <Text style={styles.historyTitle}>{formatDate(assignment.date)} • Route {assignment.work_area_name || '—'}</Text>
                  <Text style={styles.historyMeta}>
                    {[assignment.driver?.name, assignment.status].filter(Boolean).join(' • ') || 'No driver recorded'}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {Number.isFinite(Number(assignment.completed_stops)) && Number.isFinite(Number(assignment.total_stops))
                      ? `${assignment.completed_stops}/${assignment.total_stops} stops`
                      : 'Progress not recorded'}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.emptyBody}>No assignment history yet.</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function InspectionDetailModal({
  copySummaryMessage,
  errorMessage,
  fleetVehicle,
  inspection,
  isLoading,
  isReviewing,
  onChangeReviewNote,
  onClose,
  onCopyInspectionSummary,
  onLogMaintenance,
  onReview,
  reviewNote
}) {
  const [vehicleStatusDecision, setVehicleStatusDecision] = useState('');

  if (!inspection && !isLoading) {
    return null;
  }

  const issueItems = getInspectionIssueItems(inspection);
  const currentVehicleStatus = inspection?.vehicle?.vehicle_status || fleetVehicle?.vehicle_status || 'active';
  const isUnresolvedUnsafeReview = inspection?.status !== 'reviewed' && inspection?.urgent_review;
  const readinessStatus = isUnresolvedUnsafeReview
    ? 'blocked'
    : fleetVehicle?.readiness_status || fleetVehicle?.readiness?.status || 'ready';
  const readinessLabel = readinessStatus === 'blocked'
    ? 'Blocked'
    : readinessStatus === 'maintenance_soon'
      ? 'Maintenance Soon'
      : readinessStatus === 'assigned'
        ? 'Assigned'
        : 'Ready';
  const unsafeIssueLabels = issueItems
    .filter((item) => item.severity === 'unsafe' || item.urgent_review)
    .map((item) => item.label || item.checklist_item_key)
    .filter(Boolean);
  const readinessReason = isUnresolvedUnsafeReview
    ? `Unsafe inspection: ${unsafeIssueLabels.join(', ') || 'manager review required'}`
    : fleetVehicle?.readiness?.primary_reason?.label || 'No active readiness blocker';
  const requiresDecision = inspection?.status !== 'reviewed' && inspection?.urgent_review;

  return (
    <KeyboardAwareModal onClose={onClose} visible={Boolean(inspection) || isLoading}>
          <View style={styles.modalHeader}>
            <View style={styles.profileTitleBlock}>
              <Text style={styles.modalTitle}>{inspection?.vehicle_name || inspection?.vehicle?.name || 'Vehicle'} Inspection</Text>
              <Text style={styles.modalSubtitle}>
                {[inspection?.inspection_type_label, inspection?.inspection_date ? formatDate(inspection.inspection_date) : null, inspection?.driver?.name || inspection?.submitted_by_name]
                  .filter(Boolean)
                  .join(' • ') || 'Inspection detail'}
              </Text>
            </View>
            <Pressable accessibilityLabel="Close inspection detail" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          {isLoading ? (
            <ActivityIndicator color={appTheme.colors.orange} size="large" />
          ) : (
            <ScrollView
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={styles.modalScrollContent}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.modalScroll}
            >
              <View style={styles.profileGrid}>
                <View style={styles.profileTile}>
                  <Text style={styles.summaryLabel}>Review Status</Text>
                  <Text style={styles.summaryValue}>{getInspectionReviewStatusLabel(inspection)}</Text>
                </View>
                <View style={styles.profileTile}>
                  <Text style={styles.summaryLabel}>Odometer</Text>
                  <Text style={styles.summaryValue}>{inspection.odometer ? formatMileage(inspection.odometer) : 'Not recorded'}</Text>
                </View>
                <View style={styles.profileTile}>
                  <Text style={styles.summaryLabel}>Issues</Text>
                  <Text style={styles.summaryValue}>{issueItems.length}</Text>
                </View>
              </View>

              {isUnresolvedUnsafeReview ? (
                <View style={styles.inspectionUrgentBox}>
                  <Text style={styles.settingName}>Urgent manager review</Text>
                  <Text style={styles.historyMeta}>
                    The driver marked at least one issue unsafe. Review the details and choose the vehicle status before dispatch decisions continue.
                  </Text>
                </View>
              ) : null}

              {inspection.issue_note ? (
                <View style={styles.issueNoteBox}>
                  <Text style={styles.settingName}>Issue note</Text>
                  <Text style={styles.historyMeta}>{inspection.issue_note}</Text>
                </View>
              ) : null}

              <View style={styles.inspectionVehicleStateGrid}>
                <View style={[styles.inspectionVehicleStateCard, readinessStatus === 'blocked' ? styles.inspectionVehicleStateCardBlocked : null]}>
                  <Text style={styles.summaryLabel}>Readiness</Text>
                  <Text style={[styles.summaryValue, readinessStatus === 'blocked' ? styles.inspectionVehicleStateBlockedText : null]}>{readinessLabel}</Text>
                  <Text style={styles.historyMeta}>{readinessReason}</Text>
                </View>
                <View style={styles.inspectionVehicleStateCard}>
                  <Text style={styles.summaryLabel}>Operational Status</Text>
                  <Text style={styles.summaryValue}>{formatInspectionStatus(currentVehicleStatus)}</Text>
                  <Text style={styles.historyMeta}>
                    {currentVehicleStatus === 'active'
                      ? 'Active administratively; dispatch still follows readiness.'
                      : 'This operating status prevents dispatch.'}
                  </Text>
                </View>
              </View>

              {inspection.status !== 'reviewed' ? (
                <View style={styles.inspectionDecisionPanel}>
                  <Text style={styles.profileSectionLabel}>Manager Decision</Text>
                  <Text style={styles.historyMeta}>
                    {requiresDecision
                      ? 'Choose what happens to this vehicle before completing the urgent review.'
                      : 'Optionally update the vehicle operating status while completing this review.'}
                  </Text>
                  <View style={styles.inspectionDecisionGrid}>
                    {VEHICLE_STATUS_REVIEW_OPTIONS.map((option) => (
                      <Pressable
                        accessibilityRole="button"
                        disabled={isReviewing}
                        key={option.value}
                        onPress={() => setVehicleStatusDecision(option.value)}
                        style={({ pressed }) => [
                          styles.inspectionDecisionButton,
                          vehicleStatusDecision === option.value ? styles.inspectionDecisionButtonActive : null,
                          isReviewing ? styles.truckActionRowDisabled : null,
                          pressed && !isReviewing ? styles.pressed : null
                        ]}
                      >
                        <Text style={[
                          styles.inspectionDecisionButtonText,
                          vehicleStatusDecision === option.value ? styles.inspectionDecisionButtonTextActive : null
                        ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {requiresDecision && !vehicleStatusDecision ? (
                    <Text style={styles.modalError}>Select a manager decision to complete this urgent review.</Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.recordsList}>
                {(inspection.items || []).length ? inspection.items.map((item) => {
                  const isIssue = isInspectionIssueItem(item);
                  const photos = Array.isArray(item.photos) ? item.photos : [];

                  return (
                    <View key={item.id || item.checklist_item_key || item.label} style={[styles.inspectionDetailItem, isIssue ? styles.inspectionDetailItemIssue : null]}>
                      <View style={styles.inspectionChecklistText}>
                        <Text style={styles.historyTitle}>{item.label || item.checklist_item_key}</Text>
                        <Text style={styles.historyMeta}>{getInspectionItemSummary(item)}</Text>
                        {photos.length ? (
                          <View style={styles.inspectionPhotoLinks}>
                            {photos.map((photo, index) => (
                              <InspectionPhotoPreview
                                index={index}
                                key={photo.storage_path || photo.url || `${item.checklist_item_key}-${index}`}
                                photo={photo}
                              />
                            ))}
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.inspectionDetailStatus, isIssue ? styles.inspectionDetailStatusIssue : null]}>
                        {formatInspectionStatus(item.status || 'pass')}
                      </Text>
                    </View>
                  );
                }) : (
                  <Text style={styles.emptyBody}>No checklist item answers were saved.</Text>
                )}
              </View>

              {inspection.status !== 'reviewed' ? (
                <Field
                  label="Manager review note"
                  multiline
                  onChangeText={onChangeReviewNote}
                  placeholder="Optional review note"
                  value={reviewNote}
                />
              ) : inspection.manager_review_note ? (
                <View style={styles.issueNoteBox}>
                  <Text style={styles.settingName}>Manager review note</Text>
                  <Text style={styles.historyMeta}>{inspection.manager_review_note}</Text>
                </View>
              ) : null}

              <View style={styles.profileActionGrid}>
                <TruckActionRow label="Copy Inspection Summary" onPress={onCopyInspectionSummary} />
                <TruckActionRow label="Log Maintenance from Issue" onPress={onLogMaintenance} />
                {inspection.status !== 'reviewed' ? (
                  <TruckActionRow
                    disabled={isReviewing || (requiresDecision && !vehicleStatusDecision)}
                    disabledHint={requiresDecision && !vehicleStatusDecision ? 'Decision required' : null}
                    label={isReviewing
                      ? 'Saving Review'
                      : requiresDecision
                        ? 'Save Decision & Complete Review'
                        : 'Mark Reviewed'}
                    onPress={() => onReview(vehicleStatusDecision || null)}
                    primary
                  />
                ) : null}
              </View>
              {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}
              {copySummaryMessage ? <Text style={styles.historyMeta}>{copySummaryMessage}</Text> : null}
            </ScrollView>
          )}
    </KeyboardAwareModal>
  );
}

export default function ManagerVehiclesScreen({ csaWorkspaceVersion = 0, identity, navigation, route }) {
  const [vehicles, setVehicles] = useState([]);
  const [activeTab, setActiveTab] = useState('Fleet');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [maintenanceSettings, setMaintenanceSettings] = useState([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [maintenanceRequirements, setMaintenanceRequirements] = useState(null);
  const [reminderSchedule, setReminderSchedule] = useState(null);
  const [checklistTemplate, setChecklistTemplate] = useState(null);
  const [inspectionRecords, setInspectionRecords] = useState([]);
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(false);
  const [isSavingMaintenanceSettings, setIsSavingMaintenanceSettings] = useState(false);
  const [isSavingChecklistTemplate, setIsSavingChecklistTemplate] = useState(false);
  const [isSavingRequirements, setIsSavingRequirements] = useState(false);
  const [isSavingReminderSchedule, setIsSavingReminderSchedule] = useState(false);
  const [maintenanceErrorMessage, setMaintenanceErrorMessage] = useState('');
  const [maintenanceSettingsErrorMessage, setMaintenanceSettingsErrorMessage] = useState('');
  const [checklistTemplateErrorMessage, setChecklistTemplateErrorMessage] = useState('');
  const [requirementErrorMessage, setRequirementErrorMessage] = useState('');
  const [reminderScheduleErrorMessage, setReminderScheduleErrorMessage] = useState('');
  const [hasLoadedMaintenanceOverview, setHasLoadedMaintenanceOverview] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [settingsView, setSettingsView] = useState('overview');
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [vehicleModalMode, setVehicleModalMode] = useState('edit');
  const [vehicleForm, setVehicleForm] = useState(getVehicleForm(null));
  const [vehicleError, setVehicleError] = useState('');
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [isImportingVehicles, setIsImportingVehicles] = useState(false);
  const [vehicleImportMessage, setVehicleImportMessage] = useState('');
  const [assignmentModalVisible, setAssignmentModalVisible] = useState(false);
  const [assignmentDrivers, setAssignmentDrivers] = useState([]);
  const [assignmentForm, setAssignmentForm] = useState(getInspectionAssignmentForm(null, null));
  const [assignmentError, setAssignmentError] = useState('');
  const [isLoadingAssignmentDrivers, setIsLoadingAssignmentDrivers] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [serviceMenuVehicle, setServiceMenuVehicle] = useState(null);
  const [profileVehicle, setProfileVehicle] = useState(null);
  const [serviceVehicle, setServiceVehicle] = useState(null);
  const [serviceForm, setServiceForm] = useState(getMaintenanceForm(null));
  const [serviceError, setServiceError] = useState('');
  const [isSavingService, setIsSavingService] = useState(false);
  const [historyVehicle, setHistoryVehicle] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [odometerVehicle, setOdometerVehicle] = useState(null);
  const [odometerForm, setOdometerForm] = useState(getOdometerForm(null));
  const [odometerError, setOdometerError] = useState('');
  const [isSavingOdometer, setIsSavingOdometer] = useState(false);
  const [inspectionVehicle, setInspectionVehicle] = useState(null);
  const [inspectionForm, setInspectionForm] = useState(getInspectionForm(null, null));
  const [inspectionError, setInspectionError] = useState('');
  const [isSavingInspection, setIsSavingInspection] = useState(false);
  const [isUploadingInspectionPhotoKey, setIsUploadingInspectionPhotoKey] = useState(null);
  const [inspectionHistoryVehicle, setInspectionHistoryVehicle] = useState(null);
  const [inspectionHistory, setInspectionHistory] = useState([]);
  const [isLoadingInspectionHistory, setIsLoadingInspectionHistory] = useState(false);
  const [odometerHistoryVehicle, setOdometerHistoryVehicle] = useState(null);
  const [odometerHistory, setOdometerHistory] = useState([]);
  const [isLoadingOdometerHistory, setIsLoadingOdometerHistory] = useState(false);
  const [assignmentHistoryVehicle, setAssignmentHistoryVehicle] = useState(null);
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [isLoadingAssignmentHistory, setIsLoadingAssignmentHistory] = useState(false);
  const [inspectionDetail, setInspectionDetail] = useState(null);
  const [isLoadingInspectionDetail, setIsLoadingInspectionDetail] = useState(false);
  const [inspectionReviewNote, setInspectionReviewNote] = useState('');
  const [inspectionReviewError, setInspectionReviewError] = useState('');
  const [inspectionSummaryCopyMessage, setInspectionSummaryCopyMessage] = useState('');
  const [isReviewingInspection, setIsReviewingInspection] = useState(false);
  const linkedInspectionKeyRef = useRef(null);

  async function loadVehicles() {
    setIsLoading(true);
    try {
      const response = await api.get('/vehicles', { authMode: 'manager' });
      setVehicles(response.data?.vehicles || []);
      setErrorMessage('');
    } catch (_error) {
      setErrorMessage('Unable to load vehicles right now.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMaintenanceOverview() {
    setIsLoadingMaintenance(true);
    const [
      settingsResponse,
      recordsResponse,
      requirementsResponse,
      reminderResponse,
      checklistResponse,
      inspectionsResponse
    ] = await Promise.allSettled([
      api.get('/vehicles/settings/maintenance', { authMode: 'manager' }),
      api.get('/vehicles/maintenance-records', { authMode: 'manager' }),
      api.get('/vehicles/settings/maintenance-requirements', { authMode: 'manager' }),
      api.get('/vehicles/settings/reminder-schedule', { authMode: 'manager' }),
      api.get('/vehicles/settings/checklist-template', { authMode: 'manager' }),
      api.get('/vehicles/inspections', { authMode: 'manager' })
    ]);

    const fulfilled = [settingsResponse, recordsResponse, requirementsResponse, reminderResponse, checklistResponse, inspectionsResponse]
      .filter((response) => response.status === 'fulfilled');

    const nextOverview = {};

    if (settingsResponse.status === 'fulfilled') {
      nextOverview.maintenanceSettings = normalizeMaintenanceSettingsDraft(settingsResponse.value.data?.settings || []);
      setMaintenanceSettings(nextOverview.maintenanceSettings);
    }
    if (recordsResponse.status === 'fulfilled') {
      nextOverview.maintenanceRecords = recordsResponse.value.data?.maintenance || [];
      setMaintenanceRecords(nextOverview.maintenanceRecords);
    }
    if (requirementsResponse.status === 'fulfilled') {
      nextOverview.maintenanceRequirements = normalizeMaintenanceRequirementSetting(requirementsResponse.value.data?.setting);
      setMaintenanceRequirements(nextOverview.maintenanceRequirements);
    }
    if (reminderResponse.status === 'fulfilled') {
      nextOverview.reminderSchedule = reminderResponse.value.data?.schedule || null;
      setReminderSchedule(nextOverview.reminderSchedule);
    }
    if (checklistResponse.status === 'fulfilled') {
      nextOverview.checklistTemplate = {
        ...(checklistResponse.value.data?.template || {}),
        fields: normalizeChecklistTemplateFields(checklistResponse.value.data?.template)
      };
      setChecklistTemplate(nextOverview.checklistTemplate);
    }
    if (inspectionsResponse.status === 'fulfilled') {
      nextOverview.inspectionRecords = inspectionsResponse.value?.data?.inspections || [];
      setInspectionRecords(nextOverview.inspectionRecords);
    }

    if (fulfilled.length) {
      setMaintenanceErrorMessage('');
    } else {
      setMaintenanceErrorMessage('Unable to load vehicle maintenance settings right now.');
    }
    setHasLoadedMaintenanceOverview(true);
    setIsLoadingMaintenance(false);
    return nextOverview;
  }

  useEffect(() => {
    loadVehicles();
  }, [csaWorkspaceVersion]);

  useEffect(() => {
    if (activeTab !== 'Fleet' && !hasLoadedMaintenanceOverview && !isLoadingMaintenance) {
      loadMaintenanceOverview();
    }
  }, [activeTab, hasLoadedMaintenanceOverview, isLoadingMaintenance]);

  useEffect(() => {
    const inspectionId = route?.params?.inspectionId;

    if (!inspectionId) {
      return;
    }

    const linkedKey = `${inspectionId}:${route?.params?.notificationId || ''}`;
    if (linkedInspectionKeyRef.current === linkedKey) {
      return;
    }

    linkedInspectionKeyRef.current = linkedKey;
    setActiveTab('Inspections');
    openInspectionDetail({
      id: inspectionId,
      vehicle_id: route?.params?.vehicleId || null
    });
  }, [route?.params?.inspectionId, route?.params?.notificationId, route?.params?.vehicleId]);

  const filteredVehicles = useMemo(() => filterVehicles(vehicles, searchTerm, statusFilter), [searchTerm, statusFilter, vehicles]);
  const blockedVehicles = useMemo(
    () => vehicles.filter((vehicle) => getStatusMeta(vehicle).filterKey === 'blocked'),
    [vehicles]
  );

  function openEditVehicle(vehicle) {
    setServiceMenuVehicle(null);
    setProfileVehicle(null);
    setEditingVehicle(vehicle);
    setVehicleModalMode('edit');
    setVehicleForm(getVehicleForm(vehicle));
    setVehicleError('');
  }

  function openAddVehicle() {
    setEditingVehicle({});
    setVehicleModalMode('add');
    setVehicleForm(getVehicleForm(null));
    setVehicleError('');
  }

  function closeEditVehicle() {
    setEditingVehicle(null);
    setVehicleForm(getVehicleForm(null));
    setVehicleError('');
  }

  function updateVehicleField(field, value) {
    setVehicleForm((current) => ({ ...current, [field]: value }));
  }

  async function submitVehicleEdit() {
    setVehicleError('');

    if (!vehicleForm.name || !vehicleForm.plate || !vehicleForm.make || !vehicleForm.model || !vehicleForm.year) {
      setVehicleError('Vehicle ID, license plate, make, model, and year are required.');
      return;
    }

    if (vehicleForm.truck_type === 'Other' && !vehicleForm.custom_truck_type.trim()) {
      setVehicleError('Add a custom vehicle type when selecting Other.');
      return;
    }

    setIsSavingVehicle(true);
    try {
      if (vehicleModalMode === 'add') {
        await api.post('/vehicles', buildVehiclePayload(vehicleForm), {
          authMode: 'manager'
        });
      } else {
        await api.put(`/vehicles/${editingVehicle.id}`, buildVehiclePayload(vehicleForm), {
          authMode: 'manager'
        });
      }
      await loadVehicles();
      closeEditVehicle();
    } catch (error) {
      setVehicleError(getApiErrorMessage(error, vehicleModalMode === 'add' ? 'Unable to create vehicle.' : 'Unable to update vehicle.'));
    } finally {
      setIsSavingVehicle(false);
    }
  }

  async function importVehicles() {
    setVehicleImportMessage('');
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ]
    });

    if (result.canceled) {
      return;
    }

    const file = result.assets?.[0];
    if (!file) {
      return;
    }

    setIsImportingVehicles(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'vehicles.csv',
        type: file.mimeType || 'text/csv'
      });
      const response = await api.post('/vehicles/import', formData, {
        authMode: 'manager',
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      const summary = response.data || {};
      setVehicleImportMessage(`${summary.created || 0} vehicles imported. ${summary.skipped || 0} skipped.`);
      await loadVehicles();
    } catch (_error) {
      setVehicleImportMessage('Could not import vehicles. Check the file and try again.');
    } finally {
      setIsImportingVehicles(false);
    }
  }

  async function loadAssignmentDrivers() {
    setIsLoadingAssignmentDrivers(true);
    try {
      const response = await api.get('/manager/drivers', { authMode: 'manager' });
      const nextDrivers = response.data?.drivers || [];
      setAssignmentDrivers(nextDrivers);
      setAssignmentError('');
      return nextDrivers;
    } catch (error) {
      setAssignmentError(getApiErrorMessage(error, 'Unable to load drivers for assignment.'));
      return [];
    } finally {
      setIsLoadingAssignmentDrivers(false);
    }
  }

  function openAssignInspection(vehicle = null) {
    setServiceMenuVehicle(null);
    setProfileVehicle(null);
    setAssignmentModalVisible(true);
    setAssignmentForm(getInspectionAssignmentForm(vehicle, null));
    setAssignmentError('');
    if (!assignmentDrivers.length) {
      loadAssignmentDrivers();
    }
  }

  function closeAssignInspection() {
    setAssignmentModalVisible(false);
    setAssignmentForm(getInspectionAssignmentForm(null, null));
    setAssignmentError('');
    setIsSavingAssignment(false);
  }

  function updateAssignmentField(field, value) {
    setAssignmentForm((current) => ({
      ...current,
      [field]: value
    }));
    setAssignmentError('');
  }

  async function submitInspectionAssignment() {
    setAssignmentError('');

    if (!assignmentForm.vehicle_id || !assignmentForm.driver_id || !assignmentForm.due_date) {
      setAssignmentError('Choose a vehicle, driver, and due date.');
      return;
    }

    setIsSavingAssignment(true);
    try {
      await api.post('/vehicles/inspection-assignments', {
        vehicle_id: assignmentForm.vehicle_id,
        driver_id: assignmentForm.driver_id,
        due_date: assignmentForm.due_date,
        priority: assignmentForm.priority,
        note: assignmentForm.note?.trim() || undefined,
        require_before_route_start: assignmentForm.require_before_route_start
      }, {
        authMode: 'manager'
      });
      closeAssignInspection();
    } catch (error) {
      setAssignmentError(getApiErrorMessage(error, 'Unable to assign inspection.'));
    } finally {
      setIsSavingAssignment(false);
    }
  }

  function openServiceRecord(vehicle) {
    setServiceMenuVehicle(null);
    setProfileVehicle(null);
    setServiceVehicle(vehicle);
    setServiceForm(getMaintenanceForm(vehicle));
    setServiceError('');
  }

  function closeServiceRecord() {
    setServiceVehicle(null);
    setServiceForm(getMaintenanceForm(null));
    setServiceError('');
  }

  function updateServiceField(field, value) {
    setServiceForm((current) => ({ ...current, [field]: value }));
  }

  function updateMaintenanceSetting(index, field, value) {
    setMaintenanceSettings((current) => normalizeMaintenanceSettingsDraft(current).map((setting, settingIndex) => (
      settingIndex === index ? { ...setting, [field]: value } : setting
    )));
    setMaintenanceSettingsErrorMessage('');
  }

  async function saveMaintenanceSettings() {
    setIsSavingMaintenanceSettings(true);
    setMaintenanceSettingsErrorMessage('');
    try {
      const settings = normalizeMaintenanceSettingsDraft(maintenanceSettings).map((setting) => ({
        ...setting,
        default_interval_miles: setting.default_interval_miles === '' ? null : Number(setting.default_interval_miles),
        default_interval_days: setting.default_interval_days === '' ? null : Number(setting.default_interval_days),
        notes: setting.notes?.trim() || null
      }));
      const response = await api.put('/vehicles/settings/maintenance', { settings }, { authMode: 'manager' });
      setMaintenanceSettings(normalizeMaintenanceSettingsDraft(response.data?.settings || settings));
    } catch (error) {
      setMaintenanceSettingsErrorMessage(getApiErrorMessage(error, 'Unable to save maintenance program.'));
    } finally {
      setIsSavingMaintenanceSettings(false);
    }
  }

  function updateRequirementDraft(updater) {
    setMaintenanceRequirements((current) => normalizeMaintenanceRequirementSetting(
      typeof updater === 'function' ? updater(normalizeMaintenanceRequirementSetting(current)) : updater
    ));
    setRequirementErrorMessage('');
  }

  function updateRequirementMode(mode) {
    updateRequirementDraft((current) => ({
      ...current,
      maintenance_requirement_mode: mode
    }));
  }

  function updateRequirementWeeklyDay(day) {
    updateRequirementDraft((current) => ({
      ...current,
      weekly_inspection_day: day
    }));
  }

  function updateCustomDailyRequirement(key, value) {
    updateRequirementDraft((current) => ({
      ...current,
      custom_daily_requirements: {
        ...current.custom_daily_requirements,
        [key]: value
      }
    }));
  }

  function updateCustomWeeklyRequirement(key, value) {
    updateRequirementDraft((current) => ({
      ...current,
      custom_weekly_requirements: {
        ...current.custom_weekly_requirements,
        [key]: value
      }
    }));
  }

  async function saveMaintenanceRequirements() {
    setIsSavingRequirements(true);
    setRequirementErrorMessage('');
    try {
      const draft = normalizeMaintenanceRequirementSetting(maintenanceRequirements);
      const response = await api.put('/vehicles/settings/maintenance-requirements', draft, { authMode: 'manager' });
      const savedSetting = normalizeMaintenanceRequirementSetting(response.data?.setting);
      setMaintenanceRequirements(savedSetting);
      setReminderSchedule((current) => ({
        ...(current || {}),
        weekly_inspection_day: savedSetting.weekly_inspection_day,
        maintenance_warning_miles: savedSetting.maintenance_warning_miles,
        maintenance_warning_days: savedSetting.maintenance_warning_days,
        document_warning_days: savedSetting.document_warning_days
      }));
    } catch (error) {
      setRequirementErrorMessage(getApiErrorMessage(error, 'Unable to save maintenance requirements.'));
    } finally {
      setIsSavingRequirements(false);
    }
  }

  function updateReminderSchedule(field, value) {
    setReminderSchedule((current) => {
      const base = {
        weekly_inspection_day: current?.weekly_inspection_day || maintenanceRequirements?.weekly_inspection_day || 'Monday',
        maintenance_warning_miles: current?.maintenance_warning_miles ?? maintenanceRequirements?.maintenance_warning_miles ?? 1000,
        maintenance_warning_days: current?.maintenance_warning_days ?? maintenanceRequirements?.maintenance_warning_days ?? 14,
        document_warning_days: current?.document_warning_days ?? maintenanceRequirements?.document_warning_days ?? 30
      };
      return { ...base, [field]: value };
    });

    if (field === 'weekly_inspection_day') {
      updateRequirementWeeklyDay(value);
    }

    setReminderScheduleErrorMessage('');
  }

  async function saveReminderSchedule() {
    setIsSavingReminderSchedule(true);
    setReminderScheduleErrorMessage('');
    try {
      const schedule = {
        weekly_inspection_day: reminderSchedule?.weekly_inspection_day || maintenanceRequirements?.weekly_inspection_day || 'Monday',
        maintenance_warning_miles: Number(reminderSchedule?.maintenance_warning_miles ?? maintenanceRequirements?.maintenance_warning_miles ?? 1000),
        maintenance_warning_days: Number(reminderSchedule?.maintenance_warning_days ?? maintenanceRequirements?.maintenance_warning_days ?? 14),
        document_warning_days: Number(reminderSchedule?.document_warning_days ?? maintenanceRequirements?.document_warning_days ?? 30)
      };
      const response = await api.put('/vehicles/settings/reminder-schedule', schedule, { authMode: 'manager' });
      setReminderSchedule(response.data?.schedule || schedule);
      setMaintenanceRequirements((current) => normalizeMaintenanceRequirementSetting({
        ...(current || {}),
        ...schedule
      }));
    } catch (error) {
      setReminderScheduleErrorMessage(getApiErrorMessage(error, 'Unable to save reminder schedule.'));
    } finally {
      setIsSavingReminderSchedule(false);
    }
  }

  function toggleChecklistField(fieldId, enabled) {
    setChecklistTemplate((current) => ({
      ...(current || {}),
      fields: normalizeChecklistTemplateFields(current).map((field) => (
        field.id === fieldId ? { ...field, enabled } : field
      ))
    }));
    setChecklistTemplateErrorMessage('');
  }

  async function saveChecklistTemplate() {
    setIsSavingChecklistTemplate(true);
    setChecklistTemplateErrorMessage('');
    try {
      const fields = normalizeChecklistTemplateFields(checklistTemplate);
      const response = await api.put('/vehicles/settings/checklist-template', { fields }, { authMode: 'manager' });
      setChecklistTemplate({
        ...(response.data?.template || {}),
        fields: normalizeChecklistTemplateFields(response.data?.template || { fields })
      });
    } catch (error) {
      setChecklistTemplateErrorMessage(getApiErrorMessage(error, 'Unable to save checklist template.'));
    } finally {
      setIsSavingChecklistTemplate(false);
    }
  }

  async function submitServiceRecord() {
    setServiceError('');

    if (!serviceForm.service_date || !serviceForm.service_type || !serviceForm.mileage_at_service) {
      setServiceError('Service date, maintenance item, and service odometer reading are required.');
      return;
    }

    setIsSavingService(true);
    try {
      await api.post(`/vehicles/${serviceVehicle.id}/maintenance`, {
        service_date: serviceForm.service_date,
        service_type: serviceForm.service_type,
        description: serviceForm.description || undefined,
        condition_notes: serviceForm.condition_notes || undefined,
        vendor_name: serviceForm.vendor_name || undefined,
        cost: serviceForm.cost ? Number(serviceForm.cost) : undefined,
        mileage_at_service: Number(serviceForm.mileage_at_service),
        next_service_mileage: serviceForm.next_service_mileage ? Number(serviceForm.next_service_mileage) : undefined,
        next_service_date: serviceForm.next_service_date || undefined
      }, {
        authMode: 'manager'
      });
      await loadVehicles();
      if (hasLoadedMaintenanceOverview) {
        await loadMaintenanceOverview();
      }
      closeServiceRecord();
    } catch (_error) {
      setServiceError('Unable to save service record.');
    } finally {
      setIsSavingService(false);
    }
  }

  async function openServiceHistory(vehicle) {
    setServiceMenuVehicle(null);
    setProfileVehicle(null);
    setHistoryVehicle(vehicle);
    setIsLoadingHistory(true);
    try {
      const response = await api.get(`/vehicles/${vehicle.id}/maintenance`, { authMode: 'manager' });
      setHistory(response.data?.maintenance || []);
    } catch (_error) {
      setHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  function openOdometerEditor(vehicle) {
    setServiceMenuVehicle(null);
    setProfileVehicle(null);
    setOdometerVehicle(vehicle);
    setOdometerForm(getOdometerForm(vehicle));
    setOdometerError('');
  }

  function closeOdometerEditor() {
    setOdometerVehicle(null);
    setOdometerForm(getOdometerForm(null));
    setOdometerError('');
  }

  function updateOdometerField(field, value) {
    setOdometerForm((current) => ({
      ...current,
      [field]: value,
      confirmedLower: field === 'odometer_reading' ? false : current.confirmedLower
    }));
  }

  async function submitOdometerUpdate() {
    setOdometerError('');

    if (!odometerVehicle) {
      return;
    }

    if (odometerForm.odometer_reading === '') {
      setOdometerError('New odometer reading is required.');
      return;
    }

    const nextMileage = Number(odometerForm.odometer_reading);
    if (!Number.isInteger(nextMileage) || nextMileage < 0) {
      setOdometerError('Enter a valid odometer reading.');
      return;
    }

    const currentMileage = Number(odometerVehicle.current_mileage || 0);
    if (nextMileage < currentMileage && !odometerForm.confirmedLower) {
      setOdometerError('Confirm the lower odometer correction before saving.');
      return;
    }

    setIsSavingOdometer(true);
    try {
      await api.post(`/vehicles/${odometerVehicle.id}/odometer`, {
        odometer_reading: nextMileage,
        notes: odometerForm.notes || undefined
      }, {
        authMode: 'manager'
      });
      await loadVehicles();
      closeOdometerEditor();
    } catch (_error) {
      setOdometerError('Unable to update odometer.');
    } finally {
      setIsSavingOdometer(false);
    }
  }

  async function ensureMaintenanceOverviewLoaded() {
    if (!hasLoadedMaintenanceOverview && !isLoadingMaintenance) {
      return loadMaintenanceOverview();
    }

    return {
      checklistTemplate
    };
  }

  async function openInspectionRunner(vehicle) {
    setServiceMenuVehicle(null);
    setProfileVehicle(null);
    const overview = await ensureMaintenanceOverviewLoaded();
    const activeChecklistTemplate = overview?.checklistTemplate || checklistTemplate;
    setInspectionVehicle(vehicle);
    setInspectionForm(getInspectionForm(vehicle, activeChecklistTemplate));
    setInspectionError('');
  }

  function closeInspectionRunner() {
    setInspectionVehicle(null);
    setInspectionForm(getInspectionForm(null, checklistTemplate));
    setInspectionError('');
    setIsUploadingInspectionPhotoKey(null);
  }

  function updateInspectionField(field, value) {
    setInspectionForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function patchInspectionItem(itemKey, updater) {
    setInspectionForm((current) => ({
      ...current,
      items: (current.items || []).map((item) => (
        item.checklist_item_key === itemKey ? updater(item) : item
      ))
    }));
    setInspectionError('');
  }

  function updateInspectionItemStatus(itemKey, status) {
    patchInspectionItem(itemKey, (item) => {
      const definition = getInspectionItemDefinition(item);

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
        severity: item.severity || definition.defaultIssueSeverity || null,
        issue_details: item.issue_details || {},
        photos: item.photos || []
      };
    });
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

  function updateTruckCleanliness(itemKey, condition) {
    const definition = getInspectionItemDefinition({ checklist_item_key: itemKey });
    const option = (definition.conditionOptions || []).find((candidate) => candidate.value === condition);

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

  function removeInspectionPhoto(itemKey, photoIndex) {
    patchInspectionItem(itemKey, (item) => ({
      ...item,
      photos: (item.photos || []).filter((_photo, index) => index !== photoIndex)
    }));
  }

  async function handleAttachInspectionPhoto(itemKey) {
    if (!inspectionVehicle?.id) {
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

      const response = await api.post(`/vehicles/${inspectionVehicle.id}/inspection-photo`, {
        checklist_item_key: itemKey,
        image_base64: asset.base64,
        mime_type: asset.mimeType || 'image/jpeg',
        file_name: asset.fileName || `${itemKey}.jpg`
      }, {
        authMode: 'manager'
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

  async function submitInspection() {
    setInspectionError('');

    if (!inspectionVehicle) {
      return;
    }

    if (!inspectionForm.inspection_date || !inspectionForm.odometer) {
      setInspectionError('Inspection date and odometer are required.');
      return;
    }

    if (!inspectionForm.items?.length) {
      setInspectionError('No inspection checklist items are enabled.');
      return;
    }

    const validationError = getInspectionFormValidationError(inspectionForm);

    if (validationError) {
      setInspectionError(validationError);
      return;
    }

    setIsSavingInspection(true);
    try {
      await api.post(`/vehicles/${inspectionVehicle.id}/inspections`, {
        inspection_date: inspectionForm.inspection_date,
        odometer: Number(inspectionForm.odometer),
        issue_note: inspectionForm.issue_note || undefined,
        items: serializeInspectionItems(inspectionForm.items)
      }, {
        authMode: 'manager'
      });
      await loadVehicles();
      if (hasLoadedMaintenanceOverview) {
        await loadMaintenanceOverview();
      }
      closeInspectionRunner();
    } catch (error) {
      setInspectionError(getApiErrorMessage(error, 'Unable to save inspection.'));
    } finally {
      setIsSavingInspection(false);
    }
  }

  async function openInspectionHistory(vehicle) {
    setServiceMenuVehicle(null);
    setProfileVehicle(null);
    setInspectionHistoryVehicle(vehicle);
    setIsLoadingInspectionHistory(true);
    try {
      const response = await api.get(`/vehicles/${vehicle.id}/inspection-history`, { authMode: 'manager' });
      setInspectionHistory(response.data?.inspections || []);
    } catch (_error) {
      setInspectionHistory([]);
    } finally {
      setIsLoadingInspectionHistory(false);
    }
  }

  async function openOdometerHistory(vehicle) {
    setProfileVehicle(null);
    setOdometerHistoryVehicle(vehicle);
    setIsLoadingOdometerHistory(true);
    try {
      const response = await api.get(`/vehicles/${vehicle.id}/odometer-history`, { authMode: 'manager' });
      setOdometerHistory(response.data?.odometer_entries || []);
    } catch (_error) {
      setOdometerHistory([]);
    } finally {
      setIsLoadingOdometerHistory(false);
    }
  }

  async function openAssignmentHistory(vehicle) {
    setProfileVehicle(null);
    setAssignmentHistoryVehicle(vehicle);
    setIsLoadingAssignmentHistory(true);
    try {
      const response = await api.get(`/vehicles/${vehicle.id}/assignment-history`, { authMode: 'manager' });
      setAssignmentHistory(response.data?.assignments || []);
    } catch (_error) {
      setAssignmentHistory([]);
    } finally {
      setIsLoadingAssignmentHistory(false);
    }
  }

  async function openInspectionDetail(inspection) {
    if (!inspection?.id) {
      return;
    }

    setInspectionHistoryVehicle(null);
    setInspectionDetail(inspection);
    setInspectionReviewNote(inspection.manager_review_note || '');
    setInspectionReviewError('');
    setInspectionSummaryCopyMessage('');
    setIsLoadingInspectionDetail(true);
    try {
      const response = await api.get(`/vehicles/inspections/${inspection.id}`, { authMode: 'manager' });
      const nextInspection = response.data?.inspection || inspection;
      setInspectionDetail(nextInspection);
      setInspectionReviewNote(nextInspection.manager_review_note || '');
    } catch (_error) {
      setInspectionDetail(inspection);
    } finally {
      setIsLoadingInspectionDetail(false);
    }
  }

  function openReadinessReasonFromProfile(reason) {
    const vehicle = profileVehicle;
    setProfileVehicle(null);

    if (reason?.source_type === 'inspection' && reason.source_id) {
      openInspectionDetail({
        id: reason.source_id,
        vehicle_id: vehicle?.id,
        vehicle_name: vehicle?.name
      });
      return;
    }

    if (reason?.source_type === 'maintenance') {
      openServiceHistory(vehicle);
      return;
    }

    openEditVehicle(vehicle);
  }

  async function copyInspectionSummaryFromInspection() {
    if (!inspectionDetail?.id) {
      return;
    }

    try {
      await Clipboard.setStringAsync(buildInspectionSummary(inspectionDetail));
      setInspectionSummaryCopyMessage('Inspection summary copied');
    } catch (_error) {
      setInspectionSummaryCopyMessage('Unable to copy inspection summary');
    }
  }

  function closeInspectionDetail() {
    setInspectionDetail(null);
    setInspectionReviewNote('');
    setInspectionReviewError('');
    setInspectionSummaryCopyMessage('');
    setIsLoadingInspectionDetail(false);
    if (route?.params?.inspectionId) {
      linkedInspectionKeyRef.current = null;
      navigation?.setParams?.({
        inspectionId: undefined,
        notificationId: undefined,
        source: undefined,
        vehicleId: undefined
      });
    }
  }

  async function reviewInspectionDetail(vehicleStatusDecision = null) {
    if (!inspectionDetail?.id || isReviewingInspection) {
      return;
    }

    setIsReviewingInspection(true);
    setInspectionReviewError('');
    try {
      const response = await api.put(`/vehicles/inspections/${inspectionDetail.id}/review`, {
        manager_review_note: inspectionReviewNote || undefined,
        vehicle_status_decision: vehicleStatusDecision || undefined
      }, { authMode: 'manager' });
      const reviewedInspection = response.data?.inspection || {
        ...inspectionDetail,
        status: 'reviewed',
        status_label: 'Reviewed',
        manager_review_note: inspectionReviewNote
      };
      setInspectionDetail(reviewedInspection);
      setInspectionRecords((current) => current.map((inspection) => (
        inspection.id === reviewedInspection.id ? { ...inspection, ...reviewedInspection } : inspection
      )));
      setInspectionHistory((current) => current.map((inspection) => (
        inspection.id === reviewedInspection.id ? { ...inspection, ...reviewedInspection } : inspection
      )));
      await loadVehicles();
    } catch (error) {
      setInspectionReviewError(getApiErrorMessage(error, 'Unable to complete the inspection review.'));
    } finally {
      setIsReviewingInspection(false);
    }
  }

  function logMaintenanceFromInspection() {
    if (!inspectionDetail) {
      return;
    }

    const vehicle = inspectionDetail.vehicle || vehicles.find((row) => row.id === inspectionDetail.vehicle_id) || {
      id: inspectionDetail.vehicle_id,
      name: inspectionDetail.vehicle_name
    };
    setServiceVehicle(vehicle);
    setServiceForm(getInspectionMaintenanceForm(vehicle, inspectionDetail));
    setServiceError('');
    closeInspectionDetail();
  }

  const fleetHeader = (
    <View style={styles.headerStack}>
      <View style={styles.actionRow}>
        <AppButton label="Add Vehicle" onPress={openAddVehicle} style={styles.actionButton} />
        <AppButton
          label={isImportingVehicles ? 'Importing' : 'Import Vehicles'}
          onPress={importVehicles}
          style={styles.actionButton}
          variant="outline"
        />
      </View>
      <AppButton
        label="Assign Inspection"
        onPress={() => openAssignInspection(null)}
        style={styles.actionButtonFull}
        variant="outline"
      />
      {blockedVehicles.length ? (
        <View style={styles.blockedFleetBanner}>
          <Text style={styles.blockedFleetTitle}>{blockedVehicles.length} vehicle{blockedVehicles.length === 1 ? '' : 's'} blocked from readiness</Text>
          {blockedVehicles.map((vehicle) => (
            <Pressable
              key={vehicle.id}
              onPress={() => setProfileVehicle(vehicle)}
              style={({ pressed }) => [styles.blockedFleetRow, pressed ? styles.pressed : null]}
            >
              <Text style={styles.blockedFleetVehicle}>{vehicle.name}</Text>
              <Text style={styles.blockedFleetReason}>{getBlockerSummary(vehicle)}</Text>
              <Text style={styles.blockedFleetLink}>View</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {vehicleImportMessage ? <Text style={styles.importMessage}>{vehicleImportMessage}</Text> : null}
      <View style={styles.searchCard}>
        <RouteMetricIcon color={appTheme.colors.charcoalSoft} name="vehicles" size={appTheme.icons.sm} />
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearchTerm}
          placeholder="Search vehicles by ID or description"
          placeholderTextColor={appTheme.colors.textTertiary}
          style={styles.searchInput}
          value={searchTerm}
        />
      </View>
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setStatusFilter(item.key)}
            style={[styles.filterChip, statusFilter === item.key ? styles.filterChipActive : null]}
          >
            <Text style={[styles.filterChipText, statusFilter === item.key ? styles.filterChipTextActive : null]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.resultCount}>{filteredVehicles.length} of {vehicles.length} vehicles</Text>
      {errorMessage ? (
        <ErrorState body="Check your connection and try again." onAction={loadVehicles} title="Couldn’t load vehicles" />
      ) : null}
    </View>
  );

  const header = (
    <View style={styles.headerStack}>
      <SectionTabs
        activeTab={activeTab}
        onChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'Settings') {
            setSettingsView('overview');
          }
        }}
      />
      {activeTab === 'Fleet' ? fleetHeader : null}
    </View>
  );

  const settingsContent = (() => {
    if (settingsView === 'program') {
      return (
        <>
          <SettingsBackButton onPress={() => setSettingsView('overview')} />
          <MaintenanceProgramPanel
            isLoading={isLoadingMaintenance}
            isSaving={isSavingMaintenanceSettings}
            onChangeSetting={updateMaintenanceSetting}
            onSave={saveMaintenanceSettings}
            settings={maintenanceSettings}
            settingsErrorMessage={maintenanceSettingsErrorMessage}
          />
        </>
      );
    }

    if (settingsView === 'requirements') {
      return (
        <>
          <SettingsBackButton onPress={() => setSettingsView('overview')} />
          <MaintenanceRequirementsEditor
            draft={normalizeMaintenanceRequirementSetting(maintenanceRequirements)}
            errorMessage={requirementErrorMessage}
            isSaving={isSavingRequirements}
            onChangeCustomDaily={updateCustomDailyRequirement}
            onChangeCustomWeekly={updateCustomWeeklyRequirement}
            onChangeMode={updateRequirementMode}
            onChangeWeeklyDay={updateRequirementWeeklyDay}
            onSave={saveMaintenanceRequirements}
          />
        </>
      );
    }

    if (settingsView === 'reminders') {
      const draft = normalizeMaintenanceRequirementSetting(maintenanceRequirements);
      const scheduleDraft = {
        weekly_inspection_day: reminderSchedule?.weekly_inspection_day || draft.weekly_inspection_day,
        maintenance_warning_miles: reminderSchedule?.maintenance_warning_miles ?? draft.maintenance_warning_miles,
        maintenance_warning_days: reminderSchedule?.maintenance_warning_days ?? draft.maintenance_warning_days,
        document_warning_days: reminderSchedule?.document_warning_days ?? draft.document_warning_days
      };

      return (
        <>
          <SettingsBackButton onPress={() => setSettingsView('overview')} />
          <ReminderScheduleEditor
            draft={scheduleDraft}
            errorMessage={reminderScheduleErrorMessage}
            isSaving={isSavingReminderSchedule}
            onChange={updateReminderSchedule}
            onSave={saveReminderSchedule}
          />
        </>
      );
    }

    if (settingsView === 'checklist') {
      return (
        <>
          <SettingsBackButton onPress={() => setSettingsView('overview')} />
          <ChecklistTemplateEditor
            errorMessage={checklistTemplateErrorMessage}
            fields={normalizeChecklistTemplateFields(checklistTemplate)}
            isSaving={isSavingChecklistTemplate}
            onSave={saveChecklistTemplate}
            onToggleField={toggleChecklistField}
          />
        </>
      );
    }

    return (
      <>
        <SettingsOverviewPanel
          checklistTemplate={checklistTemplate}
          maintenanceSettings={maintenanceSettings}
          onOpen={setSettingsView}
          reminderSchedule={reminderSchedule}
          requirements={maintenanceRequirements}
        />
        <InspectionsPanel
          checklistTemplate={checklistTemplate}
          isLoading={isLoadingMaintenance}
          requirements={maintenanceRequirements}
        />
      </>
    );
  })();

  const maintenanceContent = (
    <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
      {header}
      {maintenanceErrorMessage ? (
        <ErrorState body="Check your connection and try again." onAction={loadMaintenanceOverview} title="Couldn’t load maintenance" />
      ) : null}
      {activeTab === 'Maintenance' ? (
        <MaintenanceRecordsPanel
          isLoading={isLoadingMaintenance}
          records={maintenanceRecords}
        />
      ) : null}
      {activeTab === 'Inspections' ? (
        <InspectionRecordsPanel
          inspections={inspectionRecords}
          isLoading={isLoadingMaintenance}
          onOpenInspection={openInspectionDetail}
        />
      ) : null}
      {activeTab === 'Settings' ? (
        <View style={styles.panelStack}>
          {settingsContent}
        </View>
      ) : null}
    </ScrollView>
  );

  return (
    <>
      <ManagerSectionLayout
        compact
        eyebrow="ReadyRoute"
        scrollEnabled={false}
        subtitle={identity?.companyName || 'Fleet inventory'}
        title="Vehicles"
        tone="light"
      >
        {activeTab === 'Fleet' ? (
          <FlatList
            ListEmptyComponent={!errorMessage ? (
              isLoading ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color={appTheme.colors.orange} size="large" />
                  <Text style={styles.loadingText}>Loading vehicles</Text>
                </View>
              ) : (
                <AppCard style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>{vehicles.length ? 'No matching vehicles' : 'No vehicles yet'}</Text>
                  <Text style={styles.emptyBody}>
                    {vehicles.length ? 'Try another vehicle search or status filter.' : 'Vehicles will appear here after they are added in ReadyRoute.'}
                  </Text>
                </AppCard>
              )
            ) : null}
            ListHeaderComponent={header}
            contentContainerStyle={styles.listContent}
            data={!isLoading && !errorMessage ? filteredVehicles : []}
            keyExtractor={(item, index) => String(item.id || item.name || index)}
            renderItem={({ item }) => (
              <VehicleCard
                onEditActions={setServiceMenuVehicle}
                onOpenProfile={setProfileVehicle}
                vehicle={item}
              />
            )}
            showsVerticalScrollIndicator={false}
          />
        ) : maintenanceContent}
      </ManagerSectionLayout>

      <EditVehicleModal
        errorMessage={vehicleError}
        form={vehicleForm}
        isSaving={isSavingVehicle}
        mode={vehicleModalMode}
        onChange={updateVehicleField}
        onClose={closeEditVehicle}
        onSubmit={submitVehicleEdit}
        vehicle={editingVehicle}
        visible={Boolean(editingVehicle)}
      />
      <VehicleActionsModal
        onAssignInspection={() => openAssignInspection(serviceMenuVehicle)}
        onClose={() => setServiceMenuVehicle(null)}
        onLogMaintenance={() => openServiceRecord(serviceMenuVehicle)}
        onOpenDetails={() => openEditVehicle(serviceMenuVehicle)}
        onRunInspection={() => openInspectionRunner(serviceMenuVehicle)}
        onUpdateOdometer={() => openOdometerEditor(serviceMenuVehicle)}
        onViewHistory={() => {
          setProfileVehicle(serviceMenuVehicle);
          setServiceMenuVehicle(null);
        }}
        vehicle={serviceMenuVehicle}
      />
      <VehicleProfileModal
        onClose={() => setProfileVehicle(null)}
        onAssignInspection={() => openAssignInspection(profileVehicle)}
        onEditInfo={() => openEditVehicle(profileVehicle)}
        onEditOdometer={() => openOdometerEditor(profileVehicle)}
        onLogMaintenance={() => openServiceRecord(profileVehicle)}
        onOpenReadinessReason={openReadinessReasonFromProfile}
        onRunInspection={() => openInspectionRunner(profileVehicle)}
        onViewAssignmentHistory={() => openAssignmentHistory(profileVehicle)}
        onViewInspectionHistory={() => openInspectionHistory(profileVehicle)}
        onViewOdometerHistory={() => openOdometerHistory(profileVehicle)}
        onViewServiceHistory={() => openServiceHistory(profileVehicle)}
        vehicle={profileVehicle}
      />
      <AssignInspectionModal
        drivers={assignmentDrivers}
        errorMessage={assignmentError}
        form={assignmentForm}
        isLoadingDrivers={isLoadingAssignmentDrivers}
        isSaving={isSavingAssignment}
        onChange={updateAssignmentField}
        onClose={closeAssignInspection}
        onSubmit={submitInspectionAssignment}
        vehicles={vehicles}
        visible={assignmentModalVisible}
      />
      <OdometerModal
        errorMessage={odometerError}
        form={odometerForm}
        isSaving={isSavingOdometer}
        onChange={updateOdometerField}
        onClose={closeOdometerEditor}
        onConfirmLower={(confirmedLower) => setOdometerForm((current) => ({ ...current, confirmedLower }))}
        onSubmit={submitOdometerUpdate}
        vehicle={odometerVehicle}
      />
      <ServiceRecordModal
        errorMessage={serviceError}
        form={serviceForm}
        isSaving={isSavingService}
        onChange={updateServiceField}
        onClose={closeServiceRecord}
        onSubmit={submitServiceRecord}
        vehicle={serviceVehicle}
      />
      <ServiceHistoryModal
        history={history}
        isLoading={isLoadingHistory}
        onClose={() => setHistoryVehicle(null)}
        vehicle={historyVehicle}
      />
      <InspectionModal
        errorMessage={inspectionError}
        form={inspectionForm}
        isSaving={isSavingInspection}
        isUploadingPhotoKey={isUploadingInspectionPhotoKey}
        onAttachPhoto={handleAttachInspectionPhoto}
        onChangeField={updateInspectionField}
        onChangeIssueDetail={updateInspectionIssueDetail}
        onChangeNote={updateInspectionItemNote}
        onChangeSeverity={updateInspectionItemSeverity}
        onChangeStatus={updateInspectionItemStatus}
        onChangeTruckCleanliness={updateTruckCleanliness}
        onClose={closeInspectionRunner}
        onRemovePhoto={removeInspectionPhoto}
        onSubmit={submitInspection}
        vehicle={inspectionVehicle}
      />
      <InspectionHistoryModal
        history={inspectionHistory}
        isLoading={isLoadingInspectionHistory}
        onClose={() => setInspectionHistoryVehicle(null)}
        onOpenInspection={openInspectionDetail}
        vehicle={inspectionHistoryVehicle}
      />
      <OdometerHistoryModal
        history={odometerHistory}
        isLoading={isLoadingOdometerHistory}
        onClose={() => setOdometerHistoryVehicle(null)}
        vehicle={odometerHistoryVehicle}
      />
      <AssignmentHistoryModal
        history={assignmentHistory}
        isLoading={isLoadingAssignmentHistory}
        onClose={() => setAssignmentHistoryVehicle(null)}
        vehicle={assignmentHistoryVehicle}
      />
      <InspectionDetailModal
        copySummaryMessage={inspectionSummaryCopyMessage}
        errorMessage={inspectionReviewError}
        fleetVehicle={vehicles.find((vehicle) => (
          vehicle.id === (inspectionDetail?.vehicle?.id || inspectionDetail?.vehicle_id)
        )) || null}
        inspection={inspectionDetail}
        isLoading={isLoadingInspectionDetail}
        isReviewing={isReviewingInspection}
        key={inspectionDetail?.id || 'closed-inspection'}
        onChangeReviewNote={setInspectionReviewNote}
        onClose={closeInspectionDetail}
        onCopyInspectionSummary={copyInspectionSummaryFromInspection}
        onLogMaintenance={logMaintenanceFromInspection}
        onReview={reviewInspectionDetail}
        reviewNote={inspectionReviewNote}
      />
    </>
  );
}

export {
  buildVehiclePayload,
  buildInspectionSummary,
  filterVehicles,
  formatDate,
  formatMileage,
  getAssignedDriverLabel,
  getDriverDisplayName,
  getInspectionAssignmentForm,
  getLastServiceSummary,
  getRecordedLicensePlate,
  getRegistrationStatus,
  getStatusMeta,
  getVehicleDescription,
  getVehicleForm,
  getTodayDateParam
};

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
    paddingBottom: appTheme.spacing.xl
  },
  headerStack: {
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs
  },
  sectionTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs
  },
  sectionTab: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: appTheme.spacing.sm
  },
  sectionTabActive: {
    backgroundColor: appTheme.colors.orange,
    borderColor: appTheme.colors.orange
  },
  sectionTabText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  sectionTabTextActive: {
    color: appTheme.colors.textInverse
  },
  actionRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  actionButton: {
    flex: 1
  },
  actionButtonFull: {
    alignSelf: 'stretch'
  },
  importMessage: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  searchCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    minHeight: 46,
    paddingHorizontal: appTheme.spacing.md
  },
  searchInput: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.semibold,
    minHeight: 44
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  filterChip: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 12
  },
  filterChipActive: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange
  },
  filterChipText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  filterChipTextActive: {
    color: appTheme.colors.orangeDeep
  },
  resultCount: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  loadingState: {
    alignItems: 'center',
    gap: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xl
  },
  loadingText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall
  },
  vehicleRow: {
    alignItems: 'stretch',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  blockedFleetBanner: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#efb2aa',
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  blockedFleetTitle: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  blockedFleetRow: {
    alignItems: 'center',
    borderTopColor: '#f3c8c2',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    minHeight: 38,
    paddingTop: appTheme.spacing.xs
  },
  blockedFleetVehicle: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  blockedFleetReason: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  blockedFleetLink: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  readinessAlert: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#efb2aa',
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    gap: 2,
    padding: appTheme.spacing.sm
  },
  readinessAlertLabel: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  readinessAlertText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  readinessAlertLink: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  panelStack: {
    gap: appTheme.spacing.sm
  },
  managerMaintenanceCard: {
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.lg
  },
  panelTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  panelBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  panelCaption: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.caption
  },
  settingsList: {
    gap: appTheme.spacing.xs
  },
  settingRow: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  settingsOverviewList: {
    gap: appTheme.spacing.xs
  },
  settingsOverviewRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'space-between',
    minHeight: 58,
    padding: appTheme.spacing.md
  },
  settingsOverviewArrow: {
    color: appTheme.colors.textTertiary,
    fontSize: 28,
    fontWeight: appTheme.typography.weights.heavy
  },
  settingsBackButton: {
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: appTheme.spacing.md
  },
  settingsBackButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  settingRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    justifyContent: 'space-between'
  },
  settingTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  settingName: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  settingMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold,
    marginTop: 3
  },
  inlineFieldRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  inlineField: {
    flex: 1,
    gap: appTheme.spacing.xxs
  },
  inlineInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    minHeight: 38,
    paddingHorizontal: appTheme.spacing.sm
  },
  recordsList: {
    gap: appTheme.spacing.xs
  },
  recordRow: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: 3,
    padding: appTheme.spacing.md
  },
  recordRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    justifyContent: 'space-between'
  },
  recordTitle: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  recordDate: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  recordService: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  recordMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  recordNotes: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold,
    marginTop: 2
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  profileTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  profileStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs
  },
  profileStatusText: {
    color: appTheme.colors.textSecondary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.sm
  },
  profileTile: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 70,
    padding: appTheme.spacing.md
  },
  profileSectionLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xs,
    marginTop: appTheme.spacing.sm,
    textTransform: 'uppercase'
  },
  profileActionGrid: {
    gap: appTheme.spacing.xs
  },
  readinessReasonList: {
    gap: appTheme.spacing.xs
  },
  readinessReasonRow: {
    alignItems: 'center',
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    minHeight: 60,
    padding: appTheme.spacing.md
  },
  readinessReasonRowBlocked: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#efb2aa'
  },
  readinessReasonRowWarning: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: '#ffd3a6'
  },
  readinessReasonCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  readinessReasonTitle: {
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  readinessReasonTitleBlocked: {
    color: appTheme.colors.dangerText
  },
  readinessReasonTitleWarning: {
    color: appTheme.colors.warningText
  },
  readinessReasonDetail: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  readinessReasonAction: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  summaryTile: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 132,
    padding: appTheme.spacing.md
  },
  vehicleRowMain: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0
  },
  vehicleCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'space-between'
  },
  vehicleCardHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  vehicleMoreButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 38
  },
  vehicleMoreButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  vehicleName: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  vehicleDescription: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    marginTop: 1
  },
  vehicleListMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  vehicleMetaText: {
    color: appTheme.colors.textSecondary,
    flexShrink: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  vehicleMetaDot: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: appTheme.spacing.sm
  },
  statusBadgeactive: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: '#a7e2c2'
  },
  statusBadgecomplete: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: '#a7e2c2'
  },
  statusBadgewarning: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: '#ffd3a6'
  },
  statusBadgeneutral: {
    backgroundColor: appTheme.colors.grayBadge,
    borderColor: appTheme.colors.borderStrong
  },
  statusBadgedanger: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#efb2aa'
  },
  statusBadgeText: {
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  statusBadgeTextactive: {
    color: appTheme.colors.greenText
  },
  statusBadgeTextcomplete: {
    color: appTheme.colors.greenText
  },
  statusBadgeTextwarning: {
    color: appTheme.colors.warningText
  },
  statusBadgeTextneutral: {
    color: appTheme.colors.grayBadgeText
  },
  statusBadgeTextdanger: {
    color: appTheme.colors.dangerText
  },
  odometerSummary: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  summaryLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  checklistList: {
    gap: appTheme.spacing.xs
  },
  checklistRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  checklistRowDisabled: {
    backgroundColor: appTheme.colors.surfaceMuted,
    opacity: 0.74
  },
  checklistNumber: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    minWidth: 22
  },
  checklistCopy: {
    flex: 1,
    minWidth: 0
  },
  checklistDot: {
    color: appTheme.colors.greenText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  checklistText: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  summaryValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginTop: 2
  },
  requirementOptionsList: {
    gap: appTheme.spacing.xs
  },
  requirementOptionCard: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  requirementOptionCardSelected: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange
  },
  requirementOptionTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  requirementOptionLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  requirementBadge: {
    borderRadius: appTheme.radius.pill,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    overflow: 'hidden',
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xxs
  },
  requirementBadgeRecommended: {
    backgroundColor: appTheme.colors.greenSoft,
    color: appTheme.colors.greenText
  },
  requirementBadgeStricter: {
    backgroundColor: appTheme.colors.purpleSoft,
    color: appTheme.colors.purple
  },
  requirementOptionTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.heavy
  },
  requirementOptionDescription: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  requirementListBlock: {
    gap: 2
  },
  requirementListItem: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.caption
  },
  weekdaySelector: {
    gap: appTheme.spacing.xs
  },
  weekdayChips: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    paddingRight: appTheme.spacing.md
  },
  weekdayChip: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: appTheme.spacing.md
  },
  weekdayChipActive: {
    backgroundColor: appTheme.colors.orange,
    borderColor: appTheme.colors.orange
  },
  weekdayChipText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  weekdayChipTextActive: {
    color: appTheme.colors.textInverse
  },
  customRequirements: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  customRequirementsHeading: {
    marginTop: appTheme.spacing.xs
  },
  checkToggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    minHeight: 32
  },
  checkToggleRowCompact: {
    flexShrink: 0,
    minHeight: 28
  },
  checkToggleText: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  checkToggleTextCompact: {
    flex: 0,
    fontSize: appTheme.typography.caption
  },
  warningBox: {
    backgroundColor: '#fffbeb',
    borderColor: '#f59e0b',
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  warningText: {
    color: '#92400e',
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: 20
  },
  confirmRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  checkboxMark: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: 5,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 22
  },
  checkboxMarkActive: {
    backgroundColor: appTheme.colors.orange,
    borderColor: appTheme.colors.orange
  },
  checkboxMarkText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  confirmText: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  emptyCard: {
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.lg
  },
  emptyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  emptyBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 23, 31, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: appTheme.spacing.lg
  },
  modalCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.lg,
    maxHeight: '88%',
    maxWidth: 560,
    padding: appTheme.spacing.lg,
    width: '100%'
  },
  smallModalCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.lg,
    maxWidth: 420,
    padding: appTheme.spacing.lg,
    width: '100%'
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: appTheme.spacing.sm
  },
  modalTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  modalSubtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    marginTop: 2
  },
  closeButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  closeButtonText: {
    color: appTheme.colors.textSecondary,
    fontSize: 24,
    fontWeight: appTheme.typography.weights.heavy
  },
  modalScroll: {
    flexShrink: 1
  },
  modalScrollContent: {
    paddingBottom: appTheme.spacing.lg
  },
  vehicleMissingSummary: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: '#e6b85f',
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    gap: 3,
    marginBottom: appTheme.spacing.sm,
    padding: appTheme.spacing.md
  },
  vehicleMissingTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  vehicleMissingText: {
    color: appTheme.colors.warningText,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  vehicleFormSectionHeader: {
    borderBottomColor: appTheme.colors.border,
    borderBottomWidth: 1,
    marginBottom: appTheme.spacing.sm,
    marginTop: appTheme.spacing.md,
    paddingBottom: appTheme.spacing.xs
  },
  vehicleFormSectionTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  fieldGroup: {
    gap: 5,
    marginBottom: appTheme.spacing.xs
  },
  fieldLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 17
  },
  fieldLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  fieldAttention: {
    color: appTheme.colors.warningText,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  optionPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  optionChip: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: appTheme.spacing.md,
    justifyContent: 'center'
  },
  optionChipSelected: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange
  },
  optionChipText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  optionChipTextSelected: {
    color: appTheme.colors.orangeDeep
  },
  assignmentOptionList: {
    gap: appTheme.spacing.xs
  },
  assignmentOption: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: 2,
    minHeight: 54,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  assignmentOptionSelected: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange
  },
  assignmentOptionTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  assignmentOptionTitleSelected: {
    color: appTheme.colors.orangeDeep
  },
  assignmentOptionMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  assignmentLoadingRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    minHeight: 48,
    paddingHorizontal: appTheme.spacing.md
  },
  assignmentLoadingText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  textInput: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    minHeight: 44,
    paddingHorizontal: appTheme.spacing.md
  },
  textInputAttention: {
    borderColor: '#e6b85f',
    borderLeftWidth: 3
  },
  textArea: {
    minHeight: 86,
    paddingTop: appTheme.spacing.sm,
    textAlignVertical: 'top'
  },
  modalError: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.sm
  },
  modalActions: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.sm
  },
  modalActionButton: {
    flex: 1
  },
  saveButton: {
    alignItems: 'center',
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.buttons.radius,
    flex: 1,
    justifyContent: 'center',
    minHeight: appTheme.buttons.height,
    paddingHorizontal: appTheme.buttons.horizontalPadding
  },
  saveButtonDisabled: {
    opacity: 0.7
  },
  saveButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  truckActionList: {
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.md
  },
  truckActionRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: appTheme.spacing.md
  },
  truckActionRowPrimary: {
    backgroundColor: appTheme.colors.orange,
    borderColor: appTheme.colors.orange
  },
  truckActionRowDisabled: {
    opacity: 0.65
  },
  truckActionRowText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  truckActionRowTextPrimary: {
    color: appTheme.colors.textInverse
  },
  truckActionRowTextDisabled: {
    color: appTheme.colors.textSecondary
  },
  truckActionRowMeta: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  menuActionButton: {
    marginTop: appTheme.spacing.sm
  },
  inspectionChecklistRow: {
    alignItems: 'stretch',
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  inspectionChecklistHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'space-between'
  },
  inspectionChecklistText: {
    flex: 1,
    minWidth: 0
  },
  inspectionStatusActions: {
    flexDirection: 'row',
    flexShrink: 1,
    flexWrap: 'wrap',
    gap: appTheme.spacing.xxs,
    justifyContent: 'flex-end'
  },
  inspectionChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xxs
  },
  inspectionChipWrapFull: {
    justifyContent: 'flex-start',
    maxWidth: '100%'
  },
  inspectionStatusButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: appTheme.spacing.sm
  },
  inspectionStatusButtonPass: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: '#a7e2c2'
  },
  inspectionStatusButtonFail: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#f5b7b1'
  },
  inspectionStatusButtonUnsafe: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#f5b7b1'
  },
  inspectionStatusButtonText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  inspectionStatusButtonTextActive: {
    color: appTheme.colors.greenText
  },
  inspectionStatusButtonTextFail: {
    color: appTheme.colors.dangerText
  },
  inspectionStatusButtonTextUnsafe: {
    color: appTheme.colors.dangerText
  },
  inspectionIssuePanel: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.sm
  },
  inspectionIssueGroup: {
    gap: appTheme.spacing.xxs
  },
  inspectionIssueLabel: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  inspectionItemNoteInput: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    minHeight: 76,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  inspectionPhotoList: {
    gap: appTheme.spacing.xxs
  },
  inspectionPhotoPill: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.infoSoft,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    justifyContent: 'space-between',
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs
  },
  inspectionPhotoText: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold
  },
  inspectionPhotoRemove: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.caption,
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
    minHeight: 34,
    paddingHorizontal: appTheme.spacing.md
  },
  inspectionPhotoButtonText: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  historyList: {
    gap: appTheme.spacing.xs
  },
  historyRow: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    padding: appTheme.spacing.md
  },
  historyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  historyMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    marginTop: 3
  },
  historyLink: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    marginTop: appTheme.spacing.xs
  },
  issueNoteBox: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: 3,
    marginBottom: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  inspectionUrgentBox: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#f5b7b1',
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: 3,
    marginBottom: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  inspectionVehicleStateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs
  },
  inspectionVehicleStateCard: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    gap: 3,
    minHeight: 96,
    padding: appTheme.spacing.md
  },
  inspectionVehicleStateCardBlocked: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#f5b7b1'
  },
  inspectionVehicleStateBlockedText: {
    color: appTheme.colors.danger
  },
  inspectionDecisionPanel: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  inspectionDecisionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  inspectionDecisionButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: appTheme.spacing.sm
  },
  inspectionDecisionButtonActive: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange
  },
  inspectionDecisionButtonText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  inspectionDecisionButtonTextActive: {
    color: appTheme.colors.orangeDeep
  },
  inspectionDetailItem: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.md
  },
  inspectionDetailItemFail: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#f5b7b1'
  },
  inspectionDetailItemIssue: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#f5b7b1'
  },
  inspectionDetailStatus: {
    color: appTheme.colors.greenText,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  inspectionDetailStatusFail: {
    color: appTheme.colors.dangerText
  },
  inspectionDetailStatusIssue: {
    color: appTheme.colors.dangerText
  },
  inspectionPhotoLinks: {
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.xs
  },
  inspectionPhotoPreview: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.xs
  },
  inspectionPhotoThumbnail: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderRadius: appTheme.radius.sm,
    height: 72,
    width: 72
  },
  inspectionPhotoPreviewText: {
    flex: 1,
    minWidth: 0
  },
  pressed: {
    opacity: 0.86
  }
});
