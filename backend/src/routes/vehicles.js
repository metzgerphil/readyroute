const express = require('express');

const defaultSupabase = require('../lib/supabase');
const { requireDriver, requireManager } = require('../middleware/auth');
const { parseMultipartForm } = require('../middleware/multipart');
const { parseVehicleImportRows } = require('../services/resourceImport');

const ALLOWED_TRUCK_TYPES = new Set([
  'P700',
  'P1000',
  'P1100',
  'P1200',
  'Box Truck',
  'Step Van',
  'Transit',
  'Cargo Van',
  'Cutaway',
  'Other'
]);

const ALLOWED_SERVICE_TYPES = new Set([
  'Inspection',
  'Oil Change',
  'Air Filter',
  'Brake Pads',
  'General Repair',
  'Other'
]);

const MAINTENANCE_REQUIREMENT_MODES = new Set(['option_1', 'option_2', 'custom']);
const WEEKLY_INSPECTION_DAYS = new Set([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
]);

const DEFAULT_CUSTOM_DAILY_REQUIREMENTS = {
  require_truck_confirmation: true,
  require_odometer_entry: true,
  show_issue_note_box: true,
  require_full_checklist_daily: false
};

const DEFAULT_CUSTOM_WEEKLY_REQUIREMENTS = {
  require_full_checklist_weekly: true,
  require_manager_review_for_reported_issues: true
};

const DEFAULT_REMINDER_SCHEDULE = {
  weekly_inspection_day: 'Monday',
  maintenance_warning_miles: 1000,
  maintenance_warning_days: 14,
  document_warning_days: 30
};

const VEHICLE_STATUS_OPTIONS = new Set([
  'active',
  'out_of_service',
  'at_the_shop',
  'not_on_schedule_b',
  'needs_repair'
]);

const VEHICLE_STATUS_LABELS = {
  active: 'Active',
  out_of_service: 'Out of Service',
  at_the_shop: 'At the shop',
  not_on_schedule_b: 'Not on Schedule B',
  needs_repair: 'Needs Repair'
};

const INSPECTION_TYPES = new Set(['daily_check', 'weekly_inspection', 'full_inspection']);
const INSPECTION_STATUSES = new Set(['submitted', 'needs_review', 'reviewed']);
const INSPECTION_ITEM_STATUSES = new Set(['pass', 'fail', 'note', 'not_applicable']);

const DEFAULT_CHECKLIST_TEMPLATE_FIELDS = [
  { id: 'date', label: 'Date', detail: 'Inspection date', enabled: true },
  { id: 'company_name', label: 'Company name', detail: 'CSA or company name', enabled: true },
  { id: 'truck_number', label: 'Truck Number', detail: 'Truck identifier for the inspection', enabled: true },
  { id: 'driver_name', label: 'Driver first and last name', detail: 'Driver completing the inspection', enabled: true },
  { id: 'tires', label: 'Tires, front, rear inner, rear outer', detail: 'Tire condition across front and rear positions', enabled: true },
  { id: 'check_engine_light', label: 'Check engine light', detail: 'On or Off', enabled: true },
  { id: 'coolant', label: 'Coolant', detail: 'Good or Needs Added', enabled: true },
  { id: 'engine_oil', label: 'Engine oil', detail: 'Good, Needs Added, or Needs Full Change', enabled: true },
  { id: 'brake_fluid', label: 'Brake fluid', detail: 'Good or Needs Added', enabled: true },
  { id: 'windshield_fluid', label: 'Windshield fluid', detail: 'Good or Needs Added', enabled: true },
  { id: 'wipers', label: 'Wipers', detail: 'Good, Left Bad, Right Bad, or Both Bad', enabled: true },
  { id: 'lights', label: 'Lights', detail: 'Headlights, stop lights, and turning signals', enabled: true },
  { id: 'truck_cleanliness', label: 'Truck cleanliness', detail: 'Good or Bad', enabled: true },
  { id: 'driver_notes', label: 'Driver notes', detail: 'Free-text notes from the driver', enabled: true }
];

function createDefaultMaintenanceSettings() {
  return [
    { service_type: 'Inspection', is_enabled: true, default_interval_miles: null, default_interval_days: 365, notes: null },
    { service_type: 'Oil Change', is_enabled: true, default_interval_miles: 5000, default_interval_days: 180, notes: null },
    { service_type: 'Air Filter', is_enabled: true, default_interval_miles: 10000, default_interval_days: 365, notes: null },
    { service_type: 'Brake Pads', is_enabled: true, default_interval_miles: null, default_interval_days: 180, notes: null },
    { service_type: 'General Repair', is_enabled: true, default_interval_miles: null, default_interval_days: null, notes: null },
    { service_type: 'Other', is_enabled: false, default_interval_miles: null, default_interval_days: null, notes: null }
  ];
}

function createDefaultMaintenanceRequirementSetting() {
  return {
    maintenance_requirement_mode: 'option_1',
    weekly_inspection_day: 'Monday',
    maintenance_warning_miles: DEFAULT_REMINDER_SCHEDULE.maintenance_warning_miles,
    maintenance_warning_days: DEFAULT_REMINDER_SCHEDULE.maintenance_warning_days,
    document_warning_days: DEFAULT_REMINDER_SCHEDULE.document_warning_days,
    custom_daily_requirements: { ...DEFAULT_CUSTOM_DAILY_REQUIREMENTS },
    custom_weekly_requirements: { ...DEFAULT_CUSTOM_WEEKLY_REQUIREMENTS },
    updated_by_manager_user_id: null,
    updated_at: null
  };
}

function normalizeBooleanMap(value, defaults) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  return Object.entries(defaults).reduce((normalized, [key, defaultValue]) => ({
    ...normalized,
    [key]: typeof source[key] === 'boolean' ? source[key] : defaultValue
  }), {});
}

function normalizeMaintenanceRequirementSetting(setting = {}) {
  const mode = String(setting.maintenance_requirement_mode || setting.mode || '').trim() || 'option_1';
  const weeklyInspectionDay = String(setting.weekly_inspection_day || '').trim() || 'Monday';
  const reminderSchedule = normalizeReminderSchedule(setting);

  if (!MAINTENANCE_REQUIREMENT_MODES.has(mode)) {
    return { error: 'maintenance_requirement_mode is not supported' };
  }

  if (!WEEKLY_INSPECTION_DAYS.has(weeklyInspectionDay)) {
    return { error: 'weekly_inspection_day is not supported' };
  }

  if (reminderSchedule.error) {
    return reminderSchedule;
  }

  return {
    maintenance_requirement_mode: mode,
    weekly_inspection_day: weeklyInspectionDay,
    maintenance_warning_miles: reminderSchedule.maintenance_warning_miles,
    maintenance_warning_days: reminderSchedule.maintenance_warning_days,
    document_warning_days: reminderSchedule.document_warning_days,
    custom_daily_requirements: normalizeBooleanMap(
      setting.custom_daily_requirements,
      DEFAULT_CUSTOM_DAILY_REQUIREMENTS
    ),
    custom_weekly_requirements: normalizeBooleanMap(
      setting.custom_weekly_requirements,
      DEFAULT_CUSTOM_WEEKLY_REQUIREMENTS
    )
  };
}

function normalizeNonnegativeInteger(value, defaultValue, fieldName) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { error: `${fieldName} must be a non-negative integer` };
  }

  return parsed;
}

function normalizeReminderSchedule(setting = {}) {
  const source = setting && typeof setting === 'object' ? setting : {};
  const weeklyInspectionDay = String(source.weekly_inspection_day || '').trim() || DEFAULT_REMINDER_SCHEDULE.weekly_inspection_day;

  if (!WEEKLY_INSPECTION_DAYS.has(weeklyInspectionDay)) {
    return { error: 'weekly_inspection_day is not supported' };
  }

  const maintenanceWarningMiles = normalizeNonnegativeInteger(
    source.maintenance_warning_miles,
    DEFAULT_REMINDER_SCHEDULE.maintenance_warning_miles,
    'maintenance_warning_miles'
  );
  const maintenanceWarningDays = normalizeNonnegativeInteger(
    source.maintenance_warning_days,
    DEFAULT_REMINDER_SCHEDULE.maintenance_warning_days,
    'maintenance_warning_days'
  );
  const documentWarningDays = normalizeNonnegativeInteger(
    source.document_warning_days,
    DEFAULT_REMINDER_SCHEDULE.document_warning_days,
    'document_warning_days'
  );

  for (const value of [maintenanceWarningMiles, maintenanceWarningDays, documentWarningDays]) {
    if (value?.error) {
      return value;
    }
  }

  return {
    weekly_inspection_day: weeklyInspectionDay,
    maintenance_warning_miles: maintenanceWarningMiles,
    maintenance_warning_days: maintenanceWarningDays,
    document_warning_days: documentWarningDays
  };
}

function presentReminderSchedule(setting = {}) {
  const normalized = normalizeReminderSchedule(setting);
  if (normalized.error) {
    return { ...DEFAULT_REMINDER_SCHEDULE };
  }

  return normalized;
}

function createDefaultChecklistTemplateSetting() {
  return {
    fields: DEFAULT_CHECKLIST_TEMPLATE_FIELDS.map((field) => ({ ...field })),
    updated_by_manager_user_id: null,
    updated_at: null
  };
}

function normalizeInspectionType(value) {
  const normalized = String(value || '').trim() || 'daily_check';
  return INSPECTION_TYPES.has(normalized) ? normalized : null;
}

function normalizeInspectionStatus(value, fallback = 'submitted') {
  const normalized = String(value || '').trim() || fallback;
  return INSPECTION_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeInspectionItemStatus(value) {
  const normalized = String(value || '').trim() || 'note';
  return INSPECTION_ITEM_STATUSES.has(normalized) ? normalized : 'note';
}

function formatInspectionTypeLabel(type) {
  if (type === 'weekly_inspection') {
    return 'Weekly Inspection';
  }

  if (type === 'full_inspection') {
    return 'Full Inspection';
  }

  return 'Daily Check';
}

function formatInspectionStatusLabel(status) {
  if (status === 'needs_review') {
    return 'Needs Review';
  }

  if (status === 'reviewed') {
    return 'Reviewed';
  }

  return 'Submitted';
}

function normalizeInspectionItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const key = String(item.checklist_item_key || item.key || item.id || '').trim() || `item_${index + 1}`;
      const label = String(item.label || item.name || key).trim();
      const value = item.value === undefined || item.value === null ? null : String(item.value).trim();
      const note = item.note === undefined || item.note === null ? null : String(item.note).trim();

      return {
        checklist_item_key: key,
        label,
        value,
        status: normalizeInspectionItemStatus(item.status),
        note,
        sort_order: index
      };
    });
}

function inspectionNeedsReview({ issueReported, issueNote, items }) {
  if (issueReported || String(issueNote || '').trim()) {
    return true;
  }

  return (items || []).some((item) => ['fail', 'note'].includes(item.status) && (item.status === 'fail' || item.note || item.value));
}

function presentVehicleSummary(vehicle) {
  if (!vehicle) {
    return null;
  }

  return {
    id: vehicle.id,
    name: vehicle.name,
    make: vehicle.make || null,
    model: vehicle.model || null,
    year: vehicle.year || null,
    truck_type: vehicle.truck_type || null,
    custom_truck_type: vehicle.custom_truck_type || null
  };
}

function presentDriverSummary(driver) {
  if (!driver) {
    return null;
  }

  return {
    id: driver.id,
    name: driver.name || null,
    phone: driver.phone || null
  };
}

function presentInspection(inspection, { vehicle = null, driver = null, items = [] } = {}) {
  const status = normalizeInspectionStatus(inspection.status);
  const type = normalizeInspectionType(inspection.inspection_type) || 'daily_check';
  const normalizedItems = (items || []).map((item) => ({
    id: item.id,
    checklist_item_key: item.checklist_item_key,
    label: item.label,
    value: item.value,
    status: normalizeInspectionItemStatus(item.status),
    note: item.note,
    sort_order: item.sort_order ?? 0
  }));
  const failedItems = normalizedItems.filter((item) => item.status === 'fail');

  return {
    ...inspection,
    inspection_type: type,
    inspection_type_label: formatInspectionTypeLabel(type),
    status,
    status_label: formatInspectionStatusLabel(status),
    issue_reported: Boolean(inspection.issue_reported),
    vehicle: presentVehicleSummary(vehicle),
    driver: presentDriverSummary(driver),
    failed_items_count: failedItems.length,
    failed_items: failedItems.map((item) => ({
      checklist_item_key: item.checklist_item_key,
      label: item.label,
      value: item.value,
      note: item.note
    })),
    items: normalizedItems
  };
}

function presentOdometerEntry(entry, { driver = null, route = null } = {}) {
  return {
    ...entry,
    driver: presentDriverSummary(driver),
    route: route ? {
      id: route.id,
      date: route.date || null,
      work_area_name: route.work_area_name || null,
      status: route.status || null
    } : null
  };
}

function presentAssignmentRoute(route, { driver = null } = {}) {
  return {
    id: route.id,
    date: route.date || null,
    work_area_name: route.work_area_name || null,
    status: route.status || null,
    total_stops: route.total_stops ?? null,
    completed_stops: route.completed_stops ?? null,
    driver_id: route.driver_id || null,
    driver: presentDriverSummary(driver),
    created_at: route.created_at || null,
    completed_at: route.completed_at || null
  };
}

function normalizeChecklistTemplateFields(fields = []) {
  const submittedById = new Map(
    (Array.isArray(fields) ? fields : [])
      .filter((field) => field && typeof field === 'object')
      .map((field) => [String(field.id || '').trim(), field])
      .filter(([id]) => Boolean(id))
  );

  return DEFAULT_CHECKLIST_TEMPLATE_FIELDS.map((defaultField) => {
    const submitted = submittedById.get(defaultField.id);
    return {
      ...defaultField,
      enabled: typeof submitted?.enabled === 'boolean' ? submitted.enabled : defaultField.enabled
    };
  });
}

function normalizeMaintenanceSetting(setting = {}) {
  const serviceType = String(setting.service_type || '').trim();

  if (!serviceType) {
    return { error: 'service_type is required' };
  }

  const isEnabled = typeof setting.is_enabled === 'boolean' ? setting.is_enabled : true;
  const intervalMiles = setting.default_interval_miles === '' || setting.default_interval_miles === undefined || setting.default_interval_miles === null
    ? null
    : toInteger(setting.default_interval_miles);
  const intervalDays = setting.default_interval_days === '' || setting.default_interval_days === undefined || setting.default_interval_days === null
    ? null
    : toInteger(setting.default_interval_days);

  if (setting.default_interval_miles !== undefined && setting.default_interval_miles !== null && setting.default_interval_miles !== '' && intervalMiles === null) {
    return { error: `default_interval_miles must be an integer for ${serviceType}` };
  }

  if (setting.default_interval_days !== undefined && setting.default_interval_days !== null && setting.default_interval_days !== '' && intervalDays === null) {
    return { error: `default_interval_days must be an integer for ${serviceType}` };
  }

  return {
    service_type: serviceType,
    is_enabled: isEnabled,
    default_interval_miles: intervalMiles,
    default_interval_days: intervalDays,
    notes: setting.notes ? String(setting.notes).trim() : null
  };
}

async function isAllowedMaintenanceServiceType(supabase, { accountId, serviceType }) {
  const normalizedServiceType = String(serviceType || '').trim();

  if (ALLOWED_SERVICE_TYPES.has(normalizedServiceType)) {
    return { allowed: true };
  }

  const { data, error } = await supabase
    .from('vehicle_maintenance_settings')
    .select('service_type')
    .eq('account_id', accountId)
    .eq('service_type', normalizedServiceType)
    .maybeSingle();

  if (error) {
    return { error };
  }

  return { allowed: Boolean(data) };
}

async function getMaintenanceSettingForServiceType(supabase, { accountId, serviceType }) {
  const normalizedServiceType = String(serviceType || '').trim();
  const { data, error } = await supabase
    .from('vehicle_maintenance_settings')
    .select('*')
    .eq('account_id', accountId)
    .eq('service_type', normalizedServiceType)
    .maybeSingle();

  if (error) {
    return { error };
  }

  if (data) {
    return { setting: data };
  }

  return {
    setting: createDefaultMaintenanceSettings().find(
      (setting) => setting.service_type.toLowerCase() === normalizedServiceType.toLowerCase()
    ) || null
  };
}

function getCurrentDateString(now = new Date(), timeZone = process.env.APP_TIME_ZONE || 'America/Los_Angeles') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function addDaysToDateString(dateString, days) {
  if (!dateString || !Number.isInteger(days)) {
    return null;
  }

  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function differenceInDays(dateString, todayString) {
  if (!dateString || !todayString) {
    return null;
  }

  const date = new Date(`${dateString}T00:00:00.000Z`);
  const today = new Date(`${todayString}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || Number.isNaN(today.getTime())) {
    return null;
  }

  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function toInteger(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toNumeric(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeVehicleStatus(value = 'active') {
  const normalized = String(value || 'active').trim().toLowerCase().replace(/[\s-]+/g, '_');

  if (!VEHICLE_STATUS_OPTIONS.has(normalized)) {
    return { error: 'vehicle_status is not supported' };
  }

  return {
    vehicle_status: normalized,
    is_active: normalized === 'active'
  };
}

function getVehicleStatusLabel(vehicle = {}) {
  const normalized = normalizeVehicleStatus(vehicle.vehicle_status || (vehicle.is_active === false ? 'out_of_service' : 'active'));

  if (normalized.error) {
    return vehicle.is_active === false ? 'Out of Service' : 'Active';
  }

  return VEHICLE_STATUS_LABELS[normalized.vehicle_status] || 'Active';
}

function normalizeTruckType({ truckType, customTruckType }) {
  const normalizedTruckType = truckType === null || truckType === undefined || truckType === ''
    ? null
    : String(truckType).trim();
  const normalizedCustomTruckType = customTruckType === null || customTruckType === undefined || customTruckType === ''
    ? null
    : String(customTruckType).trim();

  if (normalizedTruckType === null) {
    return {
      truck_type: null,
      custom_truck_type: null
    };
  }

  if (!ALLOWED_TRUCK_TYPES.has(normalizedTruckType)) {
    return { error: 'truck_type is not supported' };
  }

  if (normalizedTruckType === 'Other') {
    if (!normalizedCustomTruckType) {
      return { error: 'custom_truck_type is required when truck_type is Other' };
    }

    return {
      truck_type: normalizedTruckType,
      custom_truck_type: normalizedCustomTruckType
    };
  }

  return {
    truck_type: normalizedTruckType,
    custom_truck_type: null
  };
}

function mapLatestMaintenance(records) {
  return (records || []).reduce((map, record) => {
    const existing = map.get(record.vehicle_id);

    if (
      !existing ||
      String(record.service_date || '') > String(existing.service_date || '') ||
      (
        String(record.service_date || '') === String(existing.service_date || '') &&
        String(record.created_at || '') > String(existing.created_at || '')
      )
    ) {
      map.set(record.vehicle_id, record);
    }

    return map;
  }, new Map());
}

function getLatestMaintenanceByVehicleAndType(records = []) {
  return (records || []).reduce((map, record) => {
    const vehicleId = record.vehicle_id;
    const serviceType = String(record.service_type || '').trim();
    const mileageAtService = toInteger(record.mileage_at_service);

    if (!vehicleId || !serviceType || (mileageAtService === null && !record.service_date)) {
      return map;
    }

    const key = `${vehicleId}:${serviceType.toLowerCase()}`;
    const existing = map.get(key);
    const existingMileage = toInteger(existing?.mileage_at_service);

    if (
      !existing ||
      (mileageAtService !== null && (existingMileage === null || mileageAtService > existingMileage)) ||
      (
        (mileageAtService === existingMileage || mileageAtService === null) &&
        (
          String(record.service_date || '') > String(existing.service_date || '') ||
          (
            String(record.service_date || '') === String(existing.service_date || '') &&
            String(record.created_at || '') > String(existing.created_at || '')
          )
        )
      )
    ) {
      map.set(key, record);
    }

    return map;
  }, new Map());
}

function mapOpenInspectionIssues(inspections = [], itemsByInspectionId = new Map()) {
  return (inspections || []).reduce((map, inspection) => {
    if (!inspection?.vehicle_id) {
      return map;
    }

    const items = itemsByInspectionId.get(inspection.id) || [];
    const failedItems = items.filter((item) => normalizeInspectionItemStatus(item.status) === 'fail');
    const existing = map.get(inspection.vehicle_id);

    if (existing && String(existing.submitted_at || '') > String(inspection.submitted_at || '')) {
      return map;
    }

    map.set(inspection.vehicle_id, {
      id: inspection.id,
      inspection_type: normalizeInspectionType(inspection.inspection_type) || 'daily_check',
      inspection_type_label: formatInspectionTypeLabel(inspection.inspection_type),
      status: normalizeInspectionStatus(inspection.status),
      issue_reported: Boolean(inspection.issue_reported),
      issue_note: inspection.issue_note || null,
      submitted_at: inspection.submitted_at || null,
      failed_items: failedItems.map((item) => ({
        checklist_item_key: item.checklist_item_key,
        label: item.label,
        value: item.value,
        note: item.note
      })),
      severity: failedItems.length ? 'blocked' : 'maintenance_soon'
    });

    return map;
  }, new Map());
}

function buildVehicleMaintenanceAlert(
  vehicle = {},
  activeSettings = [],
  maintenanceByVehicleAndType = new Map(),
  todayString = getCurrentDateString(),
  reminderSchedule = DEFAULT_REMINDER_SCHEDULE
) {
  const currentMileage = toInteger(vehicle.current_mileage) || 0;
  const maintenanceWarningMiles = toInteger(reminderSchedule.maintenance_warning_miles) ?? DEFAULT_REMINDER_SCHEDULE.maintenance_warning_miles;
  const maintenanceWarningDays = toInteger(reminderSchedule.maintenance_warning_days) ?? DEFAULT_REMINDER_SCHEDULE.maintenance_warning_days;
  const candidates = (activeSettings || [])
    .filter((setting) => setting?.is_enabled)
    .map((setting) => {
      const intervalMiles = toInteger(setting.default_interval_miles);
      const intervalDays = toInteger(setting.default_interval_days);
      const serviceType = String(setting.service_type || '').trim();

      if (!serviceType) {
        return null;
      }

      const latestService = maintenanceByVehicleAndType.get(`${vehicle.id}:${serviceType.toLowerCase()}`) || null;
      const lastCompletedMileage = toInteger(latestService?.mileage_at_service);
      const nextServiceMileage = toInteger(latestService?.next_service_mileage);
      const nextDueMileage = lastCompletedMileage !== null && intervalMiles !== null && intervalMiles > 0
          ? lastCompletedMileage + intervalMiles
          : nextServiceMileage;
      const remainingMiles = nextDueMileage !== null ? nextDueMileage - currentMileage : null;
      const nextDueDate = intervalDays !== null && intervalDays > 0
        ? addDaysToDateString(latestService?.service_date, intervalDays)
        : latestService?.next_service_date || null;
      const remainingDays = differenceInDays(nextDueDate, todayString);
      const mileageStatus = remainingMiles === null
        ? 'ok'
        : remainingMiles <= 0
          ? 'overdue'
          : remainingMiles <= maintenanceWarningMiles
            ? 'due_soon'
            : 'ok';
      const dateStatus = remainingDays === null
        ? 'ok'
        : remainingDays < 0
          ? 'overdue'
          : remainingDays <= maintenanceWarningDays
            ? 'due_soon'
            : 'ok';
      const status = mileageStatus === 'overdue' || dateStatus === 'overdue'
        ? 'overdue'
        : mileageStatus === 'due_soon' || dateStatus === 'due_soon'
          ? 'due_soon'
          : 'ok';

      if (lastCompletedMileage === null && !latestService?.service_date && nextDueMileage === null && !nextDueDate) {
        return null;
      }

      return {
        service_type: serviceType,
        status,
        last_completed_mileage: lastCompletedMileage,
        interval_miles: intervalMiles,
        interval_days: intervalDays,
        next_due_mileage: nextDueMileage,
        remaining_miles: remainingMiles,
        next_due_date: nextDueDate,
        remaining_days: remainingDays,
        last_service_date: latestService?.service_date || null
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const statusPriority = { overdue: 0, due_soon: 1, ok: 2 };
      const statusDifference = statusPriority[left.status] - statusPriority[right.status];

      if (statusDifference !== 0) {
        return statusDifference;
      }

      const leftMileage = left.remaining_miles ?? Number.POSITIVE_INFINITY;
      const rightMileage = right.remaining_miles ?? Number.POSITIVE_INFINITY;
      const mileageDifference = leftMileage - rightMileage;

      if (Number.isFinite(mileageDifference) && mileageDifference !== 0) {
        return mileageDifference;
      }

      return (left.remaining_days ?? Number.POSITIVE_INFINITY) - (right.remaining_days ?? Number.POSITIVE_INFINITY);
    });

  const mostUrgent = candidates[0] || null;

  return {
    status: mostUrgent?.status || 'ok',
    most_urgent: mostUrgent,
    items: candidates
  };
}

function buildVehicleReadiness(
  vehicle = {},
  maintenanceAlert = {},
  todayAssignment = null,
  openInspectionIssue = null,
  todayString = getCurrentDateString(),
  reminderSchedule = DEFAULT_REMINDER_SCHEDULE
) {
  const registrationDays = differenceInDays(vehicle.registration_expiration, todayString);
  const insuranceDays = differenceInDays(vehicle.insurance_expiration, todayString);
  const documentWarningDays = toInteger(reminderSchedule.document_warning_days) ?? DEFAULT_REMINDER_SCHEDULE.document_warning_days;
  const maintenanceItem = maintenanceAlert.most_urgent || null;
  const reasons = [];

  if (vehicle.is_active === false) {
    reasons.push({ type: 'inactive', severity: 'blocked', label: getVehicleStatusLabel(vehicle) });
  }

  if (maintenanceAlert.status === 'overdue') {
    const overdueByMileage = maintenanceItem?.remaining_miles !== null && maintenanceItem?.remaining_miles <= 0;
    reasons.push({
      type: 'maintenance_overdue',
      severity: 'blocked',
      label: maintenanceItem?.service_type
        ? `${maintenanceItem.service_type} overdue`
        : 'Maintenance overdue',
      detail: overdueByMileage
        ? `${Math.abs(maintenanceItem.remaining_miles)} mi overdue`
        : maintenanceItem?.remaining_days !== null && maintenanceItem?.remaining_days < 0
          ? `${Math.abs(maintenanceItem.remaining_days)} days overdue`
          : null
    });
  }

  if (openInspectionIssue?.severity === 'blocked') {
    const failedItem = openInspectionIssue.failed_items?.[0];
    reasons.push({
      type: 'unresolved_inspection_issue',
      severity: 'blocked',
      label: failedItem?.label
        ? `${failedItem.label} needs review`
        : 'Vehicle issue needs review',
      detail: openInspectionIssue.issue_note || failedItem?.value || 'Driver inspection issue'
    });
  }

  if (registrationDays !== null && registrationDays < 0) {
    reasons.push({
      type: 'registration_expired',
      severity: 'blocked',
      label: 'Registration expired',
      detail: vehicle.registration_expiration
    });
  }

  if (insuranceDays !== null && insuranceDays < 0) {
    reasons.push({
      type: 'insurance_expired',
      severity: 'blocked',
      label: 'Insurance expired',
      detail: vehicle.insurance_expiration
    });
  }

  if (registrationDays !== null && registrationDays >= 0 && registrationDays <= documentWarningDays) {
    reasons.push({
      type: 'registration_soon',
      severity: 'maintenance_soon',
      label: 'Registration expiring soon',
      detail: `${registrationDays} days left`
    });
  }

  if (insuranceDays !== null && insuranceDays >= 0 && insuranceDays <= documentWarningDays) {
    reasons.push({
      type: 'insurance_soon',
      severity: 'maintenance_soon',
      label: 'Insurance expiring soon',
      detail: `${insuranceDays} days left`
    });
  }

  if (openInspectionIssue && openInspectionIssue.severity !== 'blocked') {
    reasons.push({
      type: 'unresolved_inspection_note',
      severity: 'maintenance_soon',
      label: 'Driver issue needs review',
      detail: openInspectionIssue.issue_note || openInspectionIssue.inspection_type_label || 'Vehicle check submitted'
    });
  }

  if (maintenanceAlert.status === 'due_soon') {
    reasons.push({
      type: 'maintenance_soon',
      severity: 'maintenance_soon',
      label: maintenanceItem?.service_type
        ? `${maintenanceItem.service_type} soon`
        : 'Maintenance soon',
      detail: maintenanceItem?.remaining_miles !== null && maintenanceItem?.remaining_miles <= 1000
        ? `${maintenanceItem.remaining_miles} mi left`
        : maintenanceItem?.remaining_days !== null
          ? `${maintenanceItem.remaining_days} days left`
          : null
    });
  }

  const hasBlockedReason = reasons.some((reason) => reason.severity === 'blocked');
  const hasMaintenanceSoonReason = reasons.some((reason) => reason.severity === 'maintenance_soon');
  const status = hasBlockedReason
    ? 'blocked'
    : hasMaintenanceSoonReason
      ? 'maintenance_soon'
      : todayAssignment
        ? 'assigned'
        : 'ready';

  return {
    status,
    label: {
      ready: 'Ready',
      assigned: 'Assigned',
      maintenance_soon: 'Maintenance Soon',
      blocked: 'Blocked'
    }[status],
    reasons,
    primary_reason: reasons[0] || null
  };
}

function buildAssignmentMap(routes, driversById) {
  return (routes || []).reduce((map, route) => {
    if (!route.vehicle_id) {
      return map;
    }

    const driver = route.driver_id ? driversById.get(route.driver_id) || null : null;
    map.set(route.vehicle_id, {
      driver_id: route.driver_id || null,
      driver_name: driver?.name || null,
      route_id: route.id,
      work_area_name: route.work_area_name || null,
      route_status: route.status || null
    });
    return map;
  }, new Map());
}

async function loadOwnedVehicle(supabase, { vehicleId, accountId }) {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .eq('account_id', accountId)
    .maybeSingle();

  return { data, error };
}

function createVehiclesRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const nowProvider = options.now || (() => new Date());

  router.get('/', requireManager, async (req, res) => {
    const today = getCurrentDateString(nowProvider());

    try {
      const { data: vehicles, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('account_id', req.account.account_id)
        .order('name');

      if (vehiclesError) {
        console.error('Vehicles lookup failed:', vehiclesError);
        return res.status(500).json({ error: 'Failed to load vehicles' });
      }

      const vehicleIds = (vehicles || []).map((vehicle) => vehicle.id);
      let maintenanceByVehicleId = new Map();
      let maintenanceByVehicleAndType = new Map();
      let assignmentsByVehicleId = new Map();
      let openInspectionIssuesByVehicleId = new Map();
      let activeMaintenanceSettings = [];
      let reminderSchedule = { ...DEFAULT_REMINDER_SCHEDULE };

      const { data: maintenanceSettings, error: maintenanceSettingsError } = await supabase
        .from('vehicle_maintenance_settings')
        .select('*')
        .eq('account_id', req.account.account_id)
        .order('service_type');

      if (maintenanceSettingsError) {
        console.error('Vehicle maintenance settings lookup failed:', maintenanceSettingsError);
        return res.status(500).json({ error: 'Failed to load vehicle maintenance settings' });
      }

      activeMaintenanceSettings = maintenanceSettings?.length
        ? maintenanceSettings
        : createDefaultMaintenanceSettings();

      const { data: checkRequirementSettings, error: checkRequirementError } = await supabase
        .from('vehicle_check_requirement_settings')
        .select('weekly_inspection_day, maintenance_warning_miles, maintenance_warning_days, document_warning_days')
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (checkRequirementError) {
        const missingReminderColumns = ['42703', 'PGRST204', 'PGRST205'].includes(checkRequirementError.code);
        if (!missingReminderColumns) {
          console.error('Vehicle reminder schedule lookup failed:', checkRequirementError);
          return res.status(500).json({ error: 'Failed to load vehicle reminder schedule' });
        }
      } else {
        reminderSchedule = presentReminderSchedule(checkRequirementSettings);
      }

      if (vehicleIds.length > 0) {
        const { data: maintenanceRows, error: maintenanceError } = await supabase
          .from('vehicle_maintenance')
          .select('*')
          .eq('account_id', req.account.account_id)
          .in('vehicle_id', vehicleIds)
          .order('service_date', { ascending: false });

        if (maintenanceError) {
          console.error('Vehicle maintenance lookup failed:', maintenanceError);
          return res.status(500).json({ error: 'Failed to load vehicle maintenance' });
        }

        maintenanceByVehicleId = mapLatestMaintenance(maintenanceRows);
        maintenanceByVehicleAndType = getLatestMaintenanceByVehicleAndType(maintenanceRows);

        const { data: openInspectionRows, error: openInspectionError } = await supabase
          .from('vehicle_inspections')
          .select('id, vehicle_id, inspection_type, issue_reported, issue_note, status, submitted_at')
          .eq('account_id', req.account.account_id)
          .eq('status', 'needs_review')
          .in('vehicle_id', vehicleIds)
          .order('submitted_at', { ascending: false });

        if (openInspectionError) {
          console.error('Vehicle open inspection lookup failed:', openInspectionError);
          return res.status(500).json({ error: 'Failed to load vehicle inspection issues' });
        }

        const openInspectionIds = (openInspectionRows || []).map((inspection) => inspection.id).filter(Boolean);
        let itemsByInspectionId = new Map();

        if (openInspectionIds.length) {
          const { data: inspectionItems, error: inspectionItemsError } = await supabase
            .from('vehicle_inspection_items')
            .select('inspection_id, checklist_item_key, label, value, status, note')
            .eq('account_id', req.account.account_id)
            .in('inspection_id', openInspectionIds);

          if (inspectionItemsError) {
            console.error('Vehicle open inspection item lookup failed:', inspectionItemsError);
            return res.status(500).json({ error: 'Failed to load vehicle inspection issues' });
          }

          itemsByInspectionId = (inspectionItems || []).reduce((map, item) => {
            const current = map.get(item.inspection_id) || [];
            current.push(item);
            map.set(item.inspection_id, current);
            return map;
          }, new Map());
        }

        openInspectionIssuesByVehicleId = mapOpenInspectionIssues(openInspectionRows, itemsByInspectionId);

        const { data: routeAssignments, error: assignmentsError } = await supabase
          .from('routes')
          .select('id, vehicle_id, driver_id, work_area_name, status')
          .eq('account_id', req.account.account_id)
          .eq('date', today)
          .in('vehicle_id', vehicleIds);

        if (assignmentsError) {
          console.error('Vehicle assignment lookup failed:', assignmentsError);
          return res.status(500).json({ error: 'Failed to load vehicle assignments' });
        }

        const driverIds = [...new Set((routeAssignments || []).map((route) => route.driver_id).filter(Boolean))];
        let driversById = new Map();

        if (driverIds.length > 0) {
          const { data: drivers, error: driversError } = await supabase
            .from('drivers')
            .select('id, name')
            .eq('account_id', req.account.account_id)
            .in('id', driverIds);

          if (driversError) {
            console.error('Vehicle assignment driver lookup failed:', driversError);
            return res.status(500).json({ error: 'Failed to load vehicle assignments' });
          }

          driversById = new Map((drivers || []).map((driver) => [driver.id, driver]));
        }

        assignmentsByVehicleId = buildAssignmentMap(routeAssignments, driversById);
      }

      return res.status(200).json({
        vehicles: (vehicles || []).map((vehicle) => {
          const nextServiceMileage = toInteger(vehicle.next_service_mileage);
          const currentMileage = toInteger(vehicle.current_mileage) || 0;
          const serviceDue = Number.isInteger(nextServiceMileage)
            ? currentMileage >= nextServiceMileage - 500
            : false;
          const maintenanceAlert = buildVehicleMaintenanceAlert(
            vehicle,
            activeMaintenanceSettings,
            maintenanceByVehicleAndType,
            today,
            reminderSchedule
          );
          const maintenanceServiceDue = ['due_soon', 'overdue'].includes(maintenanceAlert.status);
          const todayAssignment = assignmentsByVehicleId.get(vehicle.id) || null;
          const openInspectionIssue = openInspectionIssuesByVehicleId.get(vehicle.id) || null;
          const readiness = buildVehicleReadiness(
            vehicle,
            maintenanceAlert,
            todayAssignment,
            openInspectionIssue,
            today,
            reminderSchedule
          );

          return {
            ...vehicle,
            vehicle_status: vehicle.vehicle_status || (vehicle.is_active === false ? 'out_of_service' : 'active'),
            vehicle_status_label: getVehicleStatusLabel(vehicle),
            latest_maintenance: maintenanceByVehicleId.get(vehicle.id) || null,
            maintenance_alert: maintenanceAlert,
            open_inspection_issue: openInspectionIssue,
            today_assignment: todayAssignment,
            readiness,
            readiness_status: readiness.status,
            service_due: serviceDue || maintenanceServiceDue
          };
        })
      });
    } catch (error) {
      console.error('Vehicles endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load vehicles' });
    }
  });

  router.get('/due-soon', requireManager, async (req, res) => {
    const today = getCurrentDateString(nowProvider());

    try {
      const { data: vehicles, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('account_id', req.account.account_id)
        .order('name');

      if (error) {
        console.error('Vehicles due-soon lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load vehicles due for service' });
      }

      const vehicleIds = (vehicles || []).map((vehicle) => vehicle.id);
      let activeMaintenanceSettings = [];
      let maintenanceByVehicleAndType = new Map();
      let reminderSchedule = { ...DEFAULT_REMINDER_SCHEDULE };

      const { data: maintenanceSettings, error: maintenanceSettingsError } = await supabase
        .from('vehicle_maintenance_settings')
        .select('*')
        .eq('account_id', req.account.account_id)
        .order('service_type');

      if (maintenanceSettingsError) {
        console.error('Vehicles due-soon maintenance settings lookup failed:', maintenanceSettingsError);
        return res.status(500).json({ error: 'Failed to load maintenance settings' });
      }

      activeMaintenanceSettings = maintenanceSettings?.length
        ? maintenanceSettings
        : createDefaultMaintenanceSettings();

      const { data: checkRequirementSettings, error: checkRequirementError } = await supabase
        .from('vehicle_check_requirement_settings')
        .select('weekly_inspection_day, maintenance_warning_miles, maintenance_warning_days, document_warning_days')
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (checkRequirementError) {
        const missingReminderColumns = ['42703', 'PGRST204', 'PGRST205'].includes(checkRequirementError.code);
        if (!missingReminderColumns) {
          console.error('Vehicles due-soon reminder schedule lookup failed:', checkRequirementError);
          return res.status(500).json({ error: 'Failed to load vehicle reminder schedule' });
        }
      } else {
        reminderSchedule = presentReminderSchedule(checkRequirementSettings);
      }

      if (vehicleIds.length) {
        const { data: maintenanceRows, error: maintenanceError } = await supabase
          .from('vehicle_maintenance')
          .select('*')
          .eq('account_id', req.account.account_id)
          .in('vehicle_id', vehicleIds)
          .order('service_date', { ascending: false });

        if (maintenanceError) {
          console.error('Vehicles due-soon maintenance lookup failed:', maintenanceError);
          return res.status(500).json({ error: 'Failed to load vehicle maintenance' });
        }

        maintenanceByVehicleAndType = getLatestMaintenanceByVehicleAndType(maintenanceRows);
      }

      const dueSoon = (vehicles || []).map((vehicle) => {
        const nextServiceMileage = toInteger(vehicle.next_service_mileage);
        const currentMileage = toInteger(vehicle.current_mileage) || 0;
        const legacyServiceDue = Number.isInteger(nextServiceMileage) && currentMileage >= nextServiceMileage - 500;
        const maintenanceAlert = buildVehicleMaintenanceAlert(
          vehicle,
          activeMaintenanceSettings,
          maintenanceByVehicleAndType,
          today,
          reminderSchedule
        );

        if (!legacyServiceDue && !['due_soon', 'overdue'].includes(maintenanceAlert.status)) {
          return null;
        }

        return {
          ...vehicle,
          maintenance_alert: maintenanceAlert,
          service_due: true
        };
      }).filter(Boolean);

      return res.status(200).json({ vehicles: dueSoon });
    } catch (error) {
      console.error('Vehicles due-soon endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load vehicles due for service' });
    }
  });

  router.get('/maintenance-records', requireManager, async (req, res) => {
    try {
      const { data: records, error } = await supabase
        .from('vehicle_maintenance')
        .select('*')
        .eq('account_id', req.account.account_id)
        .order('service_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Vehicle maintenance records lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load maintenance records' });
      }

      const vehicleIds = [...new Set((records || []).map((record) => record.vehicle_id).filter(Boolean))];
      let vehiclesById = new Map();

      if (vehicleIds.length > 0) {
        const { data: vehicles, error: vehiclesError } = await supabase
          .from('vehicles')
          .select('id, name, make, model, year, truck_type, custom_truck_type')
          .eq('account_id', req.account.account_id)
          .in('id', vehicleIds);

        if (vehiclesError) {
          console.error('Vehicle maintenance records vehicle lookup failed:', vehiclesError);
          return res.status(500).json({ error: 'Failed to load maintenance records' });
        }

        vehiclesById = new Map((vehicles || []).map((vehicle) => [vehicle.id, vehicle]));
      }

      return res.status(200).json({
        maintenance: (records || []).map((record) => ({
          ...record,
          vehicle: vehiclesById.get(record.vehicle_id) || null
        }))
      });
    } catch (error) {
      console.error('Vehicle maintenance records endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load maintenance records' });
    }
  });

  router.get('/settings/maintenance', requireManager, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('vehicle_maintenance_settings')
        .select('*')
        .eq('account_id', req.account.account_id)
        .order('service_type');

      if (error) {
        console.error('Vehicle maintenance settings lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load maintenance settings' });
      }

      if (!data?.length) {
        return res.status(200).json({ settings: createDefaultMaintenanceSettings() });
      }

      return res.status(200).json({ settings: data });
    } catch (error) {
      console.error('Vehicle maintenance settings endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load maintenance settings' });
    }
  });

  router.put('/settings/maintenance', requireManager, async (req, res) => {
    const settings = Array.isArray(req.body?.settings) ? req.body.settings : null;

    if (!settings?.length) {
      return res.status(400).json({ error: 'settings array is required' });
    }

    const normalized = [];

    for (const setting of settings) {
      const parsed = normalizeMaintenanceSetting(setting);
      if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
      }

      normalized.push({
        account_id: req.account.account_id,
        ...parsed,
        updated_at: nowProvider().toISOString()
      });
    }

    try {
      const { data: existingSettings, error: existingSettingsError } = await supabase
        .from('vehicle_maintenance_settings')
        .select('service_type')
        .eq('account_id', req.account.account_id);

      if (existingSettingsError) {
        console.error('Vehicle maintenance settings existing lookup failed:', existingSettingsError);
        return res.status(500).json({ error: 'Failed to save maintenance settings' });
      }

      const nextServiceTypes = new Set(normalized.map((setting) => setting.service_type));
      const deletedServiceTypes = (existingSettings || [])
        .map((setting) => setting.service_type)
        .filter((serviceType) => !nextServiceTypes.has(serviceType));

      if (deletedServiceTypes.length) {
        const { error: deleteError } = await supabase
          .from('vehicle_maintenance_settings')
          .delete()
          .eq('account_id', req.account.account_id)
          .in('service_type', deletedServiceTypes);

        if (deleteError) {
          console.error('Vehicle maintenance settings delete failed:', deleteError);
          return res.status(500).json({ error: 'Failed to save maintenance settings' });
        }
      }

      const { error } = await supabase
        .from('vehicle_maintenance_settings')
        .upsert(normalized, { onConflict: 'account_id,service_type' });

      if (error) {
        console.error('Vehicle maintenance settings upsert failed:', error);
        return res.status(500).json({ error: 'Failed to save maintenance settings' });
      }

      return res.status(200).json({ settings: normalized });
    } catch (error) {
      console.error('Vehicle maintenance settings save failed:', error);
      return res.status(500).json({ error: 'Failed to save maintenance settings' });
    }
  });

  router.get('/settings/maintenance-requirements', requireManager, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('vehicle_check_requirement_settings')
        .select('*')
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (error) {
        console.error('Vehicle check requirement settings lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load vehicle check requirements' });
      }

      if (!data) {
        return res.status(200).json({ setting: createDefaultMaintenanceRequirementSetting() });
      }

      return res.status(200).json({
        setting: {
          ...createDefaultMaintenanceRequirementSetting(),
          ...data,
          custom_daily_requirements: normalizeBooleanMap(
            data.custom_daily_requirements,
            DEFAULT_CUSTOM_DAILY_REQUIREMENTS
          ),
          custom_weekly_requirements: normalizeBooleanMap(
            data.custom_weekly_requirements,
            DEFAULT_CUSTOM_WEEKLY_REQUIREMENTS
          )
        }
      });
    } catch (error) {
      console.error('Vehicle check requirement settings endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load vehicle check requirements' });
    }
  });

  router.put('/settings/maintenance-requirements', requireManager, async (req, res) => {
    const parsed = normalizeMaintenanceRequirementSetting(req.body || {});

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const payload = {
      account_id: req.account.account_id,
      ...parsed,
      updated_by_manager_user_id: req.account.manager_user_id || null,
      updated_at: nowProvider().toISOString()
    };

    try {
      const { error } = await supabase
        .from('vehicle_check_requirement_settings')
        .upsert(payload, { onConflict: 'account_id' });

      if (error) {
        console.error('Vehicle check requirement settings upsert failed:', error);
        return res.status(500).json({ error: 'Failed to save vehicle check requirements' });
      }

      return res.status(200).json({ setting: payload });
    } catch (error) {
      console.error('Vehicle check requirement settings save failed:', error);
      return res.status(500).json({ error: 'Failed to save vehicle check requirements' });
    }
  });

  router.get('/settings/reminder-schedule', requireManager, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('vehicle_check_requirement_settings')
        .select('*')
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (error) {
        console.error('Vehicle reminder schedule lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load reminder schedule' });
      }

      return res.status(200).json({
        schedule: presentReminderSchedule(data)
      });
    } catch (error) {
      console.error('Vehicle reminder schedule endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load reminder schedule' });
    }
  });

  router.put('/settings/reminder-schedule', requireManager, async (req, res) => {
    const parsed = normalizeReminderSchedule(req.body || {});

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    try {
      const { data: existing, error: lookupError } = await supabase
        .from('vehicle_check_requirement_settings')
        .select('*')
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (lookupError) {
        console.error('Vehicle reminder schedule lookup failed:', lookupError);
        return res.status(500).json({ error: 'Failed to save reminder schedule' });
      }

      const baseSetting = {
        ...createDefaultMaintenanceRequirementSetting(),
        ...(existing || {})
      };
      const payload = {
        account_id: req.account.account_id,
        maintenance_requirement_mode: baseSetting.maintenance_requirement_mode,
        weekly_inspection_day: parsed.weekly_inspection_day,
        maintenance_warning_miles: parsed.maintenance_warning_miles,
        maintenance_warning_days: parsed.maintenance_warning_days,
        document_warning_days: parsed.document_warning_days,
        custom_daily_requirements: normalizeBooleanMap(
          baseSetting.custom_daily_requirements,
          DEFAULT_CUSTOM_DAILY_REQUIREMENTS
        ),
        custom_weekly_requirements: normalizeBooleanMap(
          baseSetting.custom_weekly_requirements,
          DEFAULT_CUSTOM_WEEKLY_REQUIREMENTS
        ),
        updated_by_manager_user_id: req.account.manager_user_id || null,
        updated_at: nowProvider().toISOString()
      };

      const { error } = await supabase
        .from('vehicle_check_requirement_settings')
        .upsert(payload, { onConflict: 'account_id' });

      if (error) {
        console.error('Vehicle reminder schedule upsert failed:', error);
        return res.status(500).json({ error: 'Failed to save reminder schedule' });
      }

      return res.status(200).json({
        schedule: presentReminderSchedule(payload)
      });
    } catch (error) {
      console.error('Vehicle reminder schedule save failed:', error);
      return res.status(500).json({ error: 'Failed to save reminder schedule' });
    }
  });

  router.get('/settings/checklist-template', requireManager, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('vehicle_checklist_template_settings')
        .select('*')
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (error) {
        console.error('Vehicle checklist template lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load checklist template' });
      }

      if (!data) {
        return res.status(200).json({ template: createDefaultChecklistTemplateSetting() });
      }

      return res.status(200).json({
        template: {
          fields: normalizeChecklistTemplateFields(data.fields),
          updated_by_manager_user_id: data.updated_by_manager_user_id || null,
          updated_at: data.updated_at || null
        }
      });
    } catch (error) {
      console.error('Vehicle checklist template endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load checklist template' });
    }
  });

  router.put('/settings/checklist-template', requireManager, async (req, res) => {
    const fields = normalizeChecklistTemplateFields(req.body?.fields);
    const payload = {
      account_id: req.account.account_id,
      fields,
      updated_by_manager_user_id: req.account.manager_user_id || null,
      updated_at: nowProvider().toISOString()
    };

    try {
      const { error } = await supabase
        .from('vehicle_checklist_template_settings')
        .upsert(payload, { onConflict: 'account_id' });

      if (error) {
        console.error('Vehicle checklist template upsert failed:', error);
        return res.status(500).json({ error: 'Failed to save checklist template' });
      }

      return res.status(200).json({
        template: {
          fields,
          updated_by_manager_user_id: payload.updated_by_manager_user_id,
          updated_at: payload.updated_at
        }
      });
    } catch (error) {
      console.error('Vehicle checklist template save failed:', error);
      return res.status(500).json({ error: 'Failed to save checklist template' });
    }
  });

  router.get('/inspections', requireManager, async (req, res) => {
    const statusFilter = String(req.query.status || 'all').trim();
    const dateFilter = String(req.query.date || '').trim();
    const vehicleIdFilter = String(req.query.vehicle_id || '').trim();

    if (statusFilter !== 'all' && !INSPECTION_STATUSES.has(statusFilter)) {
      return res.status(400).json({ error: 'inspection status is not supported' });
    }

    try {
      let query = supabase
        .from('vehicle_inspections')
        .select('*')
        .eq('account_id', req.account.account_id)
        .order('submitted_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(150);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (dateFilter) {
        query = query.eq('inspection_date', dateFilter);
      }

      if (vehicleIdFilter) {
        query = query.eq('vehicle_id', vehicleIdFilter);
      }

      const { data: inspections, error } = await query;

      if (error) {
        console.error('Vehicle inspections lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load vehicle inspections' });
      }

      const vehicleIds = [...new Set((inspections || []).map((inspection) => inspection.vehicle_id).filter(Boolean))];
      const driverIds = [...new Set((inspections || []).map((inspection) => inspection.driver_id).filter(Boolean))];
      const inspectionIds = (inspections || []).map((inspection) => inspection.id).filter(Boolean);
      let vehiclesById = new Map();
      let driversById = new Map();
      let itemsByInspectionId = new Map();

      if (vehicleIds.length) {
        const { data: vehicles, error: vehiclesError } = await supabase
          .from('vehicles')
          .select('id, name, make, model, year, truck_type, custom_truck_type')
          .eq('account_id', req.account.account_id)
          .in('id', vehicleIds);

        if (vehiclesError) {
          console.error('Vehicle inspections vehicle lookup failed:', vehiclesError);
          return res.status(500).json({ error: 'Failed to load vehicle inspections' });
        }

        vehiclesById = new Map((vehicles || []).map((vehicle) => [vehicle.id, vehicle]));
      }

      if (driverIds.length) {
        const { data: drivers, error: driversError } = await supabase
          .from('drivers')
          .select('id, name, phone')
          .eq('account_id', req.account.account_id)
          .in('id', driverIds);

        if (driversError) {
          console.error('Vehicle inspections driver lookup failed:', driversError);
          return res.status(500).json({ error: 'Failed to load vehicle inspections' });
        }

        driversById = new Map((drivers || []).map((driver) => [driver.id, driver]));
      }

      if (inspectionIds.length) {
        const { data: items, error: itemsError } = await supabase
          .from('vehicle_inspection_items')
          .select('*')
          .eq('account_id', req.account.account_id)
          .in('inspection_id', inspectionIds)
          .order('sort_order');

        if (itemsError) {
          console.error('Vehicle inspections item lookup failed:', itemsError);
          return res.status(500).json({ error: 'Failed to load vehicle inspections' });
        }

        itemsByInspectionId = (items || []).reduce((map, item) => {
          const current = map.get(item.inspection_id) || [];
          current.push(item);
          map.set(item.inspection_id, current);
          return map;
        }, new Map());
      }

      return res.status(200).json({
        inspections: (inspections || []).map((inspection) => presentInspection(inspection, {
          vehicle: vehiclesById.get(inspection.vehicle_id) || null,
          driver: driversById.get(inspection.driver_id) || null,
          items: itemsByInspectionId.get(inspection.id) || []
        }))
      });
    } catch (error) {
      console.error('Vehicle inspections endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load vehicle inspections' });
    }
  });

  router.get('/inspections/:inspectionId', requireManager, async (req, res) => {
    try {
      const { data: inspection, error } = await supabase
        .from('vehicle_inspections')
        .select('*')
        .eq('account_id', req.account.account_id)
        .eq('id', req.params.inspectionId)
        .maybeSingle();

      if (error) {
        console.error('Vehicle inspection detail lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load vehicle inspection' });
      }

      if (!inspection) {
        return res.status(404).json({ error: 'Vehicle inspection not found' });
      }

      const [
        vehicleResult,
        driverResult,
        itemsResult
      ] = await Promise.all([
        inspection.vehicle_id
          ? supabase
            .from('vehicles')
            .select('id, name, make, model, year, truck_type, custom_truck_type')
            .eq('account_id', req.account.account_id)
            .eq('id', inspection.vehicle_id)
            .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        inspection.driver_id
          ? supabase
            .from('drivers')
            .select('id, name, phone')
            .eq('account_id', req.account.account_id)
            .eq('id', inspection.driver_id)
            .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('vehicle_inspection_items')
          .select('*')
          .eq('account_id', req.account.account_id)
          .eq('inspection_id', inspection.id)
          .order('sort_order')
      ]);

      if (vehicleResult.error || driverResult.error || itemsResult.error) {
        console.error('Vehicle inspection detail related lookup failed:', vehicleResult.error || driverResult.error || itemsResult.error);
        return res.status(500).json({ error: 'Failed to load vehicle inspection' });
      }

      return res.status(200).json({
        inspection: presentInspection(inspection, {
          vehicle: vehicleResult.data,
          driver: driverResult.data,
          items: itemsResult.data || []
        })
      });
    } catch (error) {
      console.error('Vehicle inspection detail endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load vehicle inspection' });
    }
  });

  router.put('/inspections/:inspectionId/review', requireManager, async (req, res) => {
    const managerReviewNote = req.body?.manager_review_note === undefined || req.body?.manager_review_note === null
      ? null
      : String(req.body.manager_review_note).trim();

    try {
      const { data: existing, error: lookupError } = await supabase
        .from('vehicle_inspections')
        .select('id')
        .eq('account_id', req.account.account_id)
        .eq('id', req.params.inspectionId)
        .maybeSingle();

      if (lookupError) {
        console.error('Vehicle inspection review lookup failed:', lookupError);
        return res.status(500).json({ error: 'Failed to review vehicle inspection' });
      }

      if (!existing) {
        return res.status(404).json({ error: 'Vehicle inspection not found' });
      }

      const reviewedAt = nowProvider().toISOString();
      const payload = {
        status: 'reviewed',
        reviewed_at: reviewedAt,
        reviewed_by_manager_user_id: req.account.manager_user_id || null,
        manager_review_note: managerReviewNote,
        updated_at: reviewedAt
      };

      const { data: inspection, error: updateError } = await supabase
        .from('vehicle_inspections')
        .update(payload)
        .eq('account_id', req.account.account_id)
        .eq('id', req.params.inspectionId)
        .select('*')
        .single();

      if (updateError) {
        console.error('Vehicle inspection review update failed:', updateError);
        return res.status(500).json({ error: 'Failed to review vehicle inspection' });
      }

      return res.status(200).json({ inspection: presentInspection(inspection) });
    } catch (error) {
      console.error('Vehicle inspection review endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to review vehicle inspection' });
    }
  });

  router.post('/inspections', requireDriver, async (req, res) => {
    const vehicleId = String(req.body?.vehicle_id || '').trim();
    const routeId = req.body?.route_id ? String(req.body.route_id).trim() : null;
    const inspectionType = normalizeInspectionType(req.body?.inspection_type);
    const inspectionDate = String(req.body?.inspection_date || '').trim() || getCurrentDateString(nowProvider());
    const odometer = req.body?.odometer === undefined || req.body?.odometer === null || req.body?.odometer === ''
      ? null
      : toInteger(req.body.odometer);
    const issueNote = req.body?.issue_note === undefined || req.body?.issue_note === null
      ? null
      : String(req.body.issue_note).trim();
    const items = normalizeInspectionItems(req.body?.items);

    if (!vehicleId) {
      return res.status(400).json({ error: 'vehicle_id is required' });
    }

    if (!inspectionType) {
      return res.status(400).json({ error: 'inspection_type is not supported' });
    }

    if (odometer !== null && (!Number.isInteger(odometer) || odometer < 0)) {
      return res.status(400).json({ error: 'odometer must be a non-negative integer' });
    }

    try {
      const { data: vehicle, error: vehicleError } = await loadOwnedVehicle(supabase, {
        vehicleId,
        accountId: req.driver.account_id
      });

      if (vehicleError) {
        console.error('Vehicle inspection vehicle lookup failed:', vehicleError);
        return res.status(500).json({ error: 'Failed to save vehicle inspection' });
      }

      if (!vehicle) {
        return res.status(403).json({ error: 'Vehicle does not belong to this account' });
      }

      if (routeId) {
        const { data: route, error: routeError } = await supabase
          .from('routes')
          .select('id')
          .eq('account_id', req.driver.account_id)
          .eq('driver_id', req.driver.driver_id)
          .eq('id', routeId)
          .maybeSingle();

        if (routeError) {
          console.error('Vehicle inspection route lookup failed:', routeError);
          return res.status(500).json({ error: 'Failed to save vehicle inspection' });
        }

        if (!route) {
          return res.status(403).json({ error: 'Route does not belong to this driver' });
        }
      }

      const issueReported = Boolean(req.body?.issue_reported) || Boolean(issueNote) || items.some((item) => item.status === 'fail');
      const status = inspectionNeedsReview({ issueReported, issueNote, items }) ? 'needs_review' : 'submitted';
      const submittedAt = nowProvider().toISOString();
      const inspectionPayload = {
        account_id: req.driver.account_id,
        vehicle_id: vehicleId,
        driver_id: req.driver.driver_id,
        route_id: routeId,
        inspection_date: inspectionDate,
        inspection_type: inspectionType,
        odometer,
        issue_reported: issueReported,
        issue_note: issueNote,
        status,
        submitted_at: submittedAt,
        updated_at: submittedAt
      };

      const { data: inspection, error: insertError } = await supabase
        .from('vehicle_inspections')
        .insert(inspectionPayload)
        .select('*')
        .single();

      if (insertError) {
        console.error('Vehicle inspection insert failed:', insertError);
        return res.status(500).json({ error: 'Failed to save vehicle inspection' });
      }

      if (items.length) {
        const itemPayload = items.map((item) => ({
          ...item,
          account_id: req.driver.account_id,
          inspection_id: inspection.id
        }));

        const { error: itemsError } = await supabase
          .from('vehicle_inspection_items')
          .insert(itemPayload);

        if (itemsError) {
          console.error('Vehicle inspection items insert failed:', itemsError);
          return res.status(500).json({ error: 'Failed to save vehicle inspection items' });
        }
      }

      if (odometer !== null && odometer > (toInteger(vehicle.current_mileage) || 0)) {
        const { error: updateVehicleError } = await supabase
          .from('vehicles')
          .update({ current_mileage: odometer })
          .eq('id', vehicleId)
          .eq('account_id', req.driver.account_id);

        if (updateVehicleError) {
          console.error('Vehicle inspection odometer update failed:', updateVehicleError);
        }
      }

      return res.status(201).json({
        inspection: presentInspection(inspection, { vehicle })
      });
    } catch (error) {
      console.error('Vehicle inspection submit endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save vehicle inspection' });
    }
  });

  router.post('/', requireManager, async (req, res) => {
    const {
      name,
      truck_type: truckType,
      custom_truck_type: customTruckType,
      make,
      model,
      year,
      plate,
      registration_expiration: registrationExpiration,
      insurance_expiration: insuranceExpiration,
      current_mileage: currentMileage
    } = req.body || {};

    const parsedYear = toInteger(year);
    const parsedCurrentMileage = currentMileage === undefined ? 0 : toInteger(currentMileage);
    const normalizedTruckType = normalizeTruckType({ truckType, customTruckType });

    if (!name || !make || !model || parsedYear === null || !plate || parsedCurrentMileage === null) {
      return res.status(400).json({ error: 'name, make, model, year, and plate are required' });
    }

    if (normalizedTruckType.error) {
      return res.status(400).json({ error: normalizedTruckType.error });
    }

    try {
      const { data: vehicle, error } = await supabase
        .from('vehicles')
        .insert({
          account_id: req.account.account_id,
          name: String(name).trim(),
          truck_type: normalizedTruckType.truck_type,
          custom_truck_type: normalizedTruckType.custom_truck_type,
          make: String(make).trim(),
          model: String(model).trim(),
          year: parsedYear,
          plate: String(plate).trim(),
          registration_expiration: registrationExpiration || null,
          insurance_expiration: insuranceExpiration || null,
          current_mileage: parsedCurrentMileage
        })
        .select('id')
        .single();

      if (error) {
        console.error('Vehicle creation failed:', error);
        return res.status(500).json({ error: 'Failed to create vehicle' });
      }

      return res.status(201).json({ vehicle_id: vehicle.id });
    } catch (error) {
      console.error('Vehicle creation endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to create vehicle' });
    }
  });

  router.post('/import', requireManager, parseMultipartForm, async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Vehicle import file is required' });
    }

    try {
      const rows = parseVehicleImportRows(req.file);
      const { data: existingVehicles, error: existingVehiclesError } = await supabase
        .from('vehicles')
        .select('id, name')
        .eq('account_id', req.account.account_id);

      if (existingVehiclesError) {
        console.error('Vehicle import duplicate lookup failed:', existingVehiclesError);
        return res.status(500).json({ error: 'Failed to validate vehicle import' });
      }

      const existingNames = new Set((existingVehicles || []).map((vehicle) => String(vehicle.name || '').trim().toLowerCase()));
      const seenNames = new Set();
      const result = {
        total: rows.length,
        created: 0,
        skipped: 0,
        errors: []
      };

      for (const row of rows) {
        const parsedYear = toInteger(row.year);
        const parsedCurrentMileage = row.current_mileage === '' ? 0 : toInteger(row.current_mileage);
        const normalizedTruckType = normalizeTruckType({
          truckType: row.truck_type,
          customTruckType: row.custom_truck_type
        });
        const name = String(row.name || '').trim();
        const nameKey = name.toLowerCase();

        if (!name || !row.make || !row.model || parsedYear === null || !row.plate || parsedCurrentMileage === null) {
          result.errors.push({ row: row.row_number, error: 'Vehicle ID, make, model, year, and plate are required.' });
          continue;
        }

        if (normalizedTruckType.error) {
          result.errors.push({ row: row.row_number, error: normalizedTruckType.error });
          continue;
        }

        if (existingNames.has(nameKey) || seenNames.has(nameKey)) {
          result.skipped += 1;
          continue;
        }

        const { error } = await supabase
          .from('vehicles')
          .insert({
            account_id: req.account.account_id,
            name,
            truck_type: normalizedTruckType.truck_type,
            custom_truck_type: normalizedTruckType.custom_truck_type,
            make: String(row.make).trim(),
            model: String(row.model).trim(),
            year: parsedYear,
            plate: String(row.plate).trim(),
            registration_expiration: row.registration_expiration || null,
            insurance_expiration: row.insurance_expiration || null,
            current_mileage: parsedCurrentMileage,
            notes: row.notes || null
          })
          .select('id')
          .single();

        if (error) {
          console.error('Vehicle import row failed:', error);
          result.errors.push({ row: row.row_number, error: 'Could not create vehicle.' });
          continue;
        }

        seenNames.add(nameKey);
        existingNames.add(nameKey);
        result.created += 1;
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error('Vehicle import failed:', error);
      return res.status(400).json({ error: error?.message || 'Could not import vehicles.' });
    }
  });

  router.put('/:id', requireManager, async (req, res) => {
    const vehicleId = req.params.id;
    const allowedFields = [
      'name',
      'truck_type',
      'custom_truck_type',
      'make',
      'model',
      'year',
      'plate',
      'registration_expiration',
      'insurance_expiration',
      'current_mileage',
      'vehicle_status',
      'notes',
      'is_active'
    ];
    const payload = {};

    for (const field of allowedFields) {
      if (!(field in (req.body || {}))) {
        continue;
      }

      if (field === 'year' || field === 'current_mileage') {
        const parsed = toInteger(req.body[field]);
        if (parsed === null) {
          return res.status(400).json({ error: `${field} must be an integer` });
        }

        payload[field] = parsed;
        continue;
      }

      if (field === 'is_active') {
        if (typeof req.body[field] !== 'boolean') {
          return res.status(400).json({ error: 'is_active must be a boolean' });
        }

        payload[field] = req.body[field];
        if (!('vehicle_status' in (req.body || {}))) {
          payload.vehicle_status = req.body[field] ? 'active' : 'out_of_service';
        }
        continue;
      }

      if (field === 'vehicle_status') {
        const normalizedStatus = normalizeVehicleStatus(req.body[field]);

        if (normalizedStatus.error) {
          return res.status(400).json({ error: normalizedStatus.error });
        }

        payload.vehicle_status = normalizedStatus.vehicle_status;
        payload.is_active = normalizedStatus.is_active;
        continue;
      }

      if (field === 'registration_expiration' || field === 'insurance_expiration') {
        payload[field] = req.body[field] || null;
        continue;
      }

      payload[field] = req.body[field] === null ? null : String(req.body[field]).trim();
    }

    if ('vehicle_status' in payload) {
      payload.is_active = payload.vehicle_status === 'active';
    }

    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: 'At least one vehicle field is required' });
    }

    try {
      const { data: vehicle, error: vehicleError } = await loadOwnedVehicle(supabase, {
        vehicleId,
        accountId: req.account.account_id
      });

      if (vehicleError) {
        console.error('Vehicle update lookup failed:', vehicleError);
        return res.status(500).json({ error: 'Failed to validate vehicle' });
      }

      if (!vehicle) {
        return res.status(403).json({ error: 'Vehicle does not belong to this account' });
      }

      if ('truck_type' in payload || 'custom_truck_type' in payload) {
        const normalizedTruckType = normalizeTruckType({
          truckType: 'truck_type' in payload ? payload.truck_type : vehicle.truck_type,
          customTruckType: 'custom_truck_type' in payload ? payload.custom_truck_type : vehicle.custom_truck_type
        });

        if (normalizedTruckType.error) {
          return res.status(400).json({ error: normalizedTruckType.error });
        }

        payload.truck_type = normalizedTruckType.truck_type;
        payload.custom_truck_type = normalizedTruckType.custom_truck_type;
      }

      const { error: updateError } = await supabase
        .from('vehicles')
        .update(payload)
        .eq('id', vehicleId);

      if (updateError) {
        console.error('Vehicle update failed:', updateError);
        return res.status(500).json({ error: 'Failed to update vehicle' });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Vehicle update endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update vehicle' });
    }
  });

  router.post('/:id/odometer', requireManager, async (req, res) => {
    const vehicleId = req.params.id;
    const {
      odometer_reading: odometerReading,
      notes
    } = req.body || {};
    const parsedOdometer = toInteger(odometerReading);

    if (parsedOdometer === null || parsedOdometer < 0) {
      return res.status(400).json({ error: 'odometer_reading must be a nonnegative integer' });
    }

    try {
      const { data: vehicle, error: vehicleError } = await loadOwnedVehicle(supabase, {
        vehicleId,
        accountId: req.account.account_id
      });

      if (vehicleError) {
        console.error('Manager odometer vehicle lookup failed:', vehicleError);
        return res.status(500).json({ error: 'Failed to validate vehicle' });
      }

      if (!vehicle) {
        return res.status(403).json({ error: 'Vehicle does not belong to this account' });
      }

      const oldOdometer = toInteger(vehicle.current_mileage) || 0;
      const recordedAt = nowProvider().toISOString();
      const { data: entry, error: insertError } = await supabase
        .from('vehicle_odometer_entries')
        .insert({
          vehicle_id: vehicleId,
          manager_user_id: req.account.manager_user_id || null,
          account_id: req.account.account_id,
          route_id: null,
          old_odometer_reading: oldOdometer,
          new_odometer_reading: parsedOdometer,
          odometer_reading: parsedOdometer,
          source: 'manager',
          notes: notes ? String(notes).trim() : null,
          recorded_at: recordedAt
        })
        .select('id, old_odometer_reading, new_odometer_reading, odometer_reading, recorded_at, source, notes')
        .single();

      if (insertError) {
        console.error('Manager odometer insert failed:', insertError);
        return res.status(500).json({ error: 'Failed to save odometer update' });
      }

      const { error: updateError } = await supabase
        .from('vehicles')
        .update({ current_mileage: parsedOdometer })
        .eq('id', vehicleId)
        .eq('account_id', req.account.account_id);

      if (updateError) {
        console.error('Manager odometer vehicle update failed:', updateError);
        return res.status(500).json({ error: 'Failed to update vehicle odometer' });
      }

      return res.status(200).json({
        entry,
        vehicle: {
          id: vehicleId,
          current_mileage: parsedOdometer
        }
      });
    } catch (error) {
      console.error('Manager odometer endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save odometer update' });
    }
  });

  router.post('/:id/maintenance', requireManager, async (req, res) => {
    const vehicleId = req.params.id;
    const {
      service_date: serviceDate,
      service_type: serviceType,
      description,
      condition_notes: conditionNotes,
      vendor_name: vendorName,
      shop_name: shopName,
      cost,
      mileage_at_service: mileageAtService,
      next_service_mileage: nextServiceMileage,
      next_service_date: nextServiceDate
    } = req.body || {};

    const parsedCost = cost === undefined ? null : toNumeric(cost);
    const parsedMileageAtService = toInteger(mileageAtService);
    const parsedNextServiceMileage = nextServiceMileage === undefined || nextServiceMileage === null || nextServiceMileage === ''
      ? null
      : toInteger(nextServiceMileage);

    if (!serviceDate || !serviceType) {
      return res.status(400).json({ error: 'service_date and service_type are required' });
    }

    if (cost !== undefined && parsedCost === null) {
      return res.status(400).json({ error: 'cost must be numeric' });
    }

    if (mileageAtService !== undefined && parsedMileageAtService === null) {
      return res.status(400).json({ error: 'mileage_at_service must be an integer' });
    }

    if (nextServiceMileage !== undefined && parsedNextServiceMileage === null) {
      return res.status(400).json({ error: 'next_service_mileage must be an integer' });
    }

    try {
      const serviceTypeStatus = await isAllowedMaintenanceServiceType(supabase, {
        accountId: req.account.account_id,
        serviceType
      });

      if (serviceTypeStatus.error) {
        console.error('Vehicle maintenance service type lookup failed:', serviceTypeStatus.error);
        return res.status(500).json({ error: 'Failed to validate service type' });
      }

      if (!serviceTypeStatus.allowed) {
        return res.status(400).json({ error: 'service_type is not supported' });
      }

      const { data: vehicle, error: vehicleError } = await loadOwnedVehicle(supabase, {
        vehicleId,
        accountId: req.account.account_id
      });

      if (vehicleError) {
        console.error('Vehicle maintenance lookup failed:', vehicleError);
        return res.status(500).json({ error: 'Failed to validate vehicle' });
      }

      if (!vehicle) {
        return res.status(403).json({ error: 'Vehicle does not belong to this account' });
      }

      const { setting: serviceSetting, error: serviceSettingError } = await getMaintenanceSettingForServiceType(supabase, {
        accountId: req.account.account_id,
        serviceType
      });

      if (serviceSettingError) {
        console.error('Vehicle maintenance setting lookup failed:', serviceSettingError);
        return res.status(500).json({ error: 'Failed to load service interval' });
      }

      const intervalMiles = toInteger(serviceSetting?.default_interval_miles);
      const intervalNextServiceMileage = parsedMileageAtService !== null && intervalMiles !== null && intervalMiles > 0
        ? parsedMileageAtService + intervalMiles
        : null;
      const submittedNextServiceMileageIsBehindService = parsedNextServiceMileage !== null &&
        parsedMileageAtService !== null &&
        parsedNextServiceMileage <= parsedMileageAtService;
      const resolvedNextServiceMileage = parsedNextServiceMileage !== null && !submittedNextServiceMileageIsBehindService
        ? parsedNextServiceMileage
        : intervalNextServiceMileage;

      if (submittedNextServiceMileageIsBehindService && resolvedNextServiceMileage === null) {
        return res.status(400).json({ error: 'next_service_mileage must be greater than mileage_at_service' });
      }

      const resolvedDescription = description && String(description).trim()
        ? String(description).trim()
        : `Completed ${String(serviceType).trim()}`;
      const resolvedVendorName = vendorName || shopName
        ? String(vendorName || shopName).trim()
        : null;
      const insertPayload = {
        vehicle_id: vehicleId,
        account_id: req.account.account_id,
        service_date: serviceDate,
        service_type: String(serviceType).trim(),
        description: resolvedDescription,
        condition_notes: conditionNotes ? String(conditionNotes).trim() : null,
        vendor_name: resolvedVendorName,
        cost: parsedCost,
        mileage_at_service: parsedMileageAtService,
        next_service_mileage: resolvedNextServiceMileage,
        next_service_date: nextServiceDate || null
      };

      const { data: maintenance, error: maintenanceError } = await supabase
        .from('vehicle_maintenance')
        .insert(insertPayload)
        .select('id')
        .single();

      if (maintenanceError) {
        console.error('Vehicle maintenance insert failed:', maintenanceError);
        return res.status(500).json({ error: 'Failed to save vehicle maintenance' });
      }

      const currentMileage = toInteger(vehicle.current_mileage) || 0;
      const lastServiceMileage = toInteger(vehicle.last_service_mileage);
      const updatePayload = {};

      if (
        parsedMileageAtService !== null &&
        (lastServiceMileage === null || parsedMileageAtService > lastServiceMileage)
      ) {
        updatePayload.last_service_date = serviceDate;
        updatePayload.last_service_mileage = parsedMileageAtService;
        updatePayload.next_service_mileage = resolvedNextServiceMileage;
      }

      if (parsedMileageAtService !== null && parsedMileageAtService > currentMileage) {
        updatePayload.current_mileage = parsedMileageAtService;
      }

      if (Object.keys(updatePayload).length) {
        const { error: updateError } = await supabase
          .from('vehicles')
          .update(updatePayload)
          .eq('id', vehicleId);

        if (updateError) {
          console.error('Vehicle maintenance vehicle update failed:', updateError);
          return res.status(500).json({ error: 'Failed to update vehicle after maintenance' });
        }
      }

      return res.status(201).json({ maintenance_id: maintenance.id });
    } catch (error) {
      console.error('Vehicle maintenance endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save vehicle maintenance' });
    }
  });

  router.get('/:id/maintenance', requireManager, async (req, res) => {
    const vehicleId = req.params.id;

    try {
      const { data: vehicle, error: vehicleError } = await loadOwnedVehicle(supabase, {
        vehicleId,
        accountId: req.account.account_id
      });

      if (vehicleError) {
        console.error('Vehicle maintenance history lookup failed:', vehicleError);
        return res.status(500).json({ error: 'Failed to validate vehicle' });
      }

      if (!vehicle) {
        return res.status(403).json({ error: 'Vehicle does not belong to this account' });
      }

      const { data: history, error: historyError } = await supabase
        .from('vehicle_maintenance')
        .select('*')
        .eq('account_id', req.account.account_id)
        .eq('vehicle_id', vehicleId)
        .order('service_date', { ascending: false });

      if (historyError) {
        console.error('Vehicle maintenance history query failed:', historyError);
        return res.status(500).json({ error: 'Failed to load maintenance history' });
      }

      return res.status(200).json({ maintenance: history || [] });
    } catch (error) {
      console.error('Vehicle maintenance history endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load maintenance history' });
    }
  });

  router.get('/:id/inspection-history', requireManager, async (req, res) => {
    const vehicleId = req.params.id;

    try {
      const { data: vehicle, error: vehicleError } = await loadOwnedVehicle(supabase, {
        vehicleId,
        accountId: req.account.account_id
      });

      if (vehicleError) {
        console.error('Vehicle inspection history lookup failed:', vehicleError);
        return res.status(500).json({ error: 'Failed to validate vehicle' });
      }

      if (!vehicle) {
        return res.status(403).json({ error: 'Vehicle does not belong to this account' });
      }

      const { data: inspections, error: inspectionsError } = await supabase
        .from('vehicle_inspections')
        .select('*')
        .eq('account_id', req.account.account_id)
        .eq('vehicle_id', vehicleId)
        .order('inspection_date', { ascending: false })
        .order('submitted_at', { ascending: false })
        .limit(100);

      if (inspectionsError) {
        console.error('Vehicle inspection history query failed:', inspectionsError);
        return res.status(500).json({ error: 'Failed to load inspection history' });
      }

      const driverIds = [...new Set((inspections || []).map((inspection) => inspection.driver_id).filter(Boolean))];
      const inspectionIds = (inspections || []).map((inspection) => inspection.id).filter(Boolean);
      let driversById = new Map();
      let itemsByInspectionId = new Map();

      if (driverIds.length) {
        const { data: drivers, error: driversError } = await supabase
          .from('drivers')
          .select('id, name, phone')
          .eq('account_id', req.account.account_id)
          .in('id', driverIds);

        if (driversError) {
          console.error('Vehicle inspection history driver lookup failed:', driversError);
          return res.status(500).json({ error: 'Failed to load inspection history' });
        }

        driversById = new Map((drivers || []).map((driver) => [driver.id, driver]));
      }

      if (inspectionIds.length) {
        const { data: items, error: itemsError } = await supabase
          .from('vehicle_inspection_items')
          .select('*')
          .eq('account_id', req.account.account_id)
          .in('inspection_id', inspectionIds)
          .order('sort_order');

        if (itemsError) {
          console.error('Vehicle inspection history items lookup failed:', itemsError);
          return res.status(500).json({ error: 'Failed to load inspection history' });
        }

        itemsByInspectionId = (items || []).reduce((map, item) => {
          const current = map.get(item.inspection_id) || [];
          current.push(item);
          map.set(item.inspection_id, current);
          return map;
        }, new Map());
      }

      return res.status(200).json({
        inspections: (inspections || []).map((inspection) => presentInspection(inspection, {
          vehicle,
          driver: driversById.get(inspection.driver_id) || null,
          items: itemsByInspectionId.get(inspection.id) || []
        }))
      });
    } catch (error) {
      console.error('Vehicle inspection history endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load inspection history' });
    }
  });

  router.get('/:id/odometer-history', requireManager, async (req, res) => {
    const vehicleId = req.params.id;

    try {
      const { data: vehicle, error: vehicleError } = await loadOwnedVehicle(supabase, {
        vehicleId,
        accountId: req.account.account_id
      });

      if (vehicleError) {
        console.error('Vehicle odometer history lookup failed:', vehicleError);
        return res.status(500).json({ error: 'Failed to validate vehicle' });
      }

      if (!vehicle) {
        return res.status(403).json({ error: 'Vehicle does not belong to this account' });
      }

      const { data: entries, error: entriesError } = await supabase
        .from('vehicle_odometer_entries')
        .select('*')
        .eq('account_id', req.account.account_id)
        .eq('vehicle_id', vehicleId)
        .order('recorded_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      if (entriesError) {
        console.error('Vehicle odometer history query failed:', entriesError);
        return res.status(500).json({ error: 'Failed to load odometer history' });
      }

      const driverIds = [...new Set((entries || []).map((entry) => entry.driver_id).filter(Boolean))];
      const routeIds = [...new Set((entries || []).map((entry) => entry.route_id).filter(Boolean))];
      let driversById = new Map();
      let routesById = new Map();

      if (driverIds.length) {
        const { data: drivers, error: driversError } = await supabase
          .from('drivers')
          .select('id, name, phone')
          .eq('account_id', req.account.account_id)
          .in('id', driverIds);

        if (driversError) {
          console.error('Vehicle odometer history driver lookup failed:', driversError);
          return res.status(500).json({ error: 'Failed to load odometer history' });
        }

        driversById = new Map((drivers || []).map((driver) => [driver.id, driver]));
      }

      if (routeIds.length) {
        const { data: routes, error: routesError } = await supabase
          .from('routes')
          .select('id, date, work_area_name, status')
          .eq('account_id', req.account.account_id)
          .in('id', routeIds);

        if (routesError) {
          console.error('Vehicle odometer history route lookup failed:', routesError);
          return res.status(500).json({ error: 'Failed to load odometer history' });
        }

        routesById = new Map((routes || []).map((route) => [route.id, route]));
      }

      return res.status(200).json({
        odometer_entries: (entries || []).map((entry) => presentOdometerEntry(entry, {
          driver: driversById.get(entry.driver_id) || null,
          route: routesById.get(entry.route_id) || null
        }))
      });
    } catch (error) {
      console.error('Vehicle odometer history endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load odometer history' });
    }
  });

  router.get('/:id/assignment-history', requireManager, async (req, res) => {
    const vehicleId = req.params.id;

    try {
      const { data: vehicle, error: vehicleError } = await loadOwnedVehicle(supabase, {
        vehicleId,
        accountId: req.account.account_id
      });

      if (vehicleError) {
        console.error('Vehicle assignment history lookup failed:', vehicleError);
        return res.status(500).json({ error: 'Failed to validate vehicle' });
      }

      if (!vehicle) {
        return res.status(403).json({ error: 'Vehicle does not belong to this account' });
      }

      const { data: routes, error: routesError } = await supabase
        .from('routes')
        .select('id, date, driver_id, vehicle_id, work_area_name, status, total_stops, completed_stops, created_at, completed_at')
        .eq('account_id', req.account.account_id)
        .eq('vehicle_id', vehicleId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      if (routesError) {
        console.error('Vehicle assignment history route query failed:', routesError);
        return res.status(500).json({ error: 'Failed to load assignment history' });
      }

      const driverIds = [...new Set((routes || []).map((route) => route.driver_id).filter(Boolean))];
      let driversById = new Map();

      if (driverIds.length) {
        const { data: drivers, error: driversError } = await supabase
          .from('drivers')
          .select('id, name, phone')
          .eq('account_id', req.account.account_id)
          .in('id', driverIds);

        if (driversError) {
          console.error('Vehicle assignment history driver lookup failed:', driversError);
          return res.status(500).json({ error: 'Failed to load assignment history' });
        }

        driversById = new Map((drivers || []).map((driver) => [driver.id, driver]));
      }

      return res.status(200).json({
        assignments: (routes || []).map((route) => presentAssignmentRoute(route, {
          driver: driversById.get(route.driver_id) || null
        }))
      });
    } catch (error) {
      console.error('Vehicle assignment history endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load assignment history' });
    }
  });

  return router;
}

module.exports = createVehiclesRouter();
module.exports.createVehiclesRouter = createVehiclesRouter;
