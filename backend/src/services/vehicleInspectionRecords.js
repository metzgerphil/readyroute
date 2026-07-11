function getMissingColumnName(error) {
  const message = String(error?.message || error?.details || '');
  const schemaCacheMatch = message.match(/Could not find the '([^']+)' column/i);
  if (schemaCacheMatch?.[1]) {
    return schemaCacheMatch[1];
  }

  const postgresMatch = message.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
  if (postgresMatch?.[1]) {
    return postgresMatch[1];
  }

  return null;
}

function isMissingColumnError(error) {
  if (['42703', 'PGRST204'].includes(error?.code)) {
    return true;
  }

  const message = String(error?.message || error?.details || '');
  return /column/i.test(message) && /(does not exist|schema cache|could not find)/i.test(message);
}

function isInspectionTypeConstraintError(error) {
  const combined = String(`${error?.message || ''} ${error?.details || ''}`).toLowerCase();
  return error?.code === '23514' &&
    combined.includes('vehicle_inspections_type_check');
}

function isInspectionStatusConstraintError(error) {
  const combined = String(`${error?.message || ''} ${error?.details || ''}`).toLowerCase();
  return error?.code === '23514' &&
    combined.includes('vehicle_inspections_status_check');
}

const INSPECTION_STATUSES = new Set([
  'safe_to_operate',
  'safe_with_maintenance_reported',
  'manager_review_required',
  'urgent_manager_review',
  'reviewed',
  // Legacy statuses still appear in existing rows and older databases.
  'submitted',
  'needs_review'
]);

const INSPECTION_STATUS_LABELS = {
  safe_to_operate: 'Safe to Operate',
  safe_with_maintenance_reported: 'Safe with Maintenance Reported',
  manager_review_required: 'Manager Review Required',
  urgent_manager_review: 'Urgent Manager Review',
  reviewed: 'Reviewed',
  submitted: 'Submitted',
  needs_review: 'Needs Review'
};

const SEVERITY_RANK = {
  minor: 1,
  maintenance_soon: 2,
  unsafe: 3
};

const INSPECTION_ITEM_CATEGORIES = {
  tires: 'critical_safety',
  check_engine_light: 'critical_safety',
  lights: 'critical_safety',
  brake_fluid: 'critical_safety',
  vedr: 'safety_equipment',
  back_up_camera: 'safety_equipment',
  turn_cameras: 'safety_equipment',
  parking_sensors: 'safety_equipment',
  horn: 'safety_equipment',
  coolant: 'maintenance',
  engine_oil: 'maintenance',
  windshield_fluid: 'maintenance',
  wipers: 'maintenance',
  truck_cleanliness: 'vehicle_condition'
};

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizeInspectionStatus(value, fallback = 'safe_to_operate') {
  const normalized = normalizeKey(value || fallback);
  const fallbackStatus = INSPECTION_STATUSES.has(fallback) ? fallback : 'safe_to_operate';
  return INSPECTION_STATUSES.has(normalized) ? normalized : fallbackStatus;
}

function getInspectionStatusLabel(status) {
  const normalized = normalizeInspectionStatus(status, 'safe_to_operate');
  return INSPECTION_STATUS_LABELS[normalized] || normalized;
}

function getLegacyInspectionStatus(status) {
  const normalized = normalizeInspectionStatus(status, 'safe_to_operate');

  if (normalized === 'reviewed') {
    return 'reviewed';
  }

  if (normalized === 'safe_to_operate' || normalized === 'submitted') {
    return 'submitted';
  }

  return 'needs_review';
}

function normalizeInspectionItemStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');

  if (!raw) {
    return 'unanswered';
  }

  if (['pass', 'passed', 'good', 'clean'].includes(raw)) {
    return 'pass';
  }

  if (['issue', 'fail', 'failed', 'dirty', 'needs_attention'].includes(raw)) {
    return 'issue';
  }

  if (raw === 'not_applicable' || raw === 'n/a' || raw === 'na') {
    return 'not_applicable';
  }

  if (raw === 'unanswered' || raw === 'pending') {
    return 'unanswered';
  }

  return 'unanswered';
}

function normalizeSeverity(value) {
  const normalized = normalizeKey(value);
  if (normalized === 'maintenance' || normalized === 'maintenance_due' || normalized === 'needs_maintenance_soon') {
    return 'maintenance_soon';
  }

  if (['minor', 'maintenance_soon', 'unsafe'].includes(normalized)) {
    return normalized;
  }

  return null;
}

function normalizeInspectionPhotos(value) {
  const source = Array.isArray(value)
    ? value
    : value
      ? [value]
      : [];

  return source
    .map((photo) => {
      if (!photo) {
        return null;
      }

      if (typeof photo === 'string') {
        const url = photo.trim();
        return url ? { url } : null;
      }

      if (typeof photo !== 'object' || Array.isArray(photo)) {
        return null;
      }

      const normalized = {
        url: photo.url ? String(photo.url).trim() : null,
        storage_path: photo.storage_path ? String(photo.storage_path).trim() : null,
        storage_bucket: photo.storage_bucket ? String(photo.storage_bucket).trim() : null,
        caption: photo.caption ? String(photo.caption).trim() : null
      };

      return normalized.url || normalized.storage_path ? normalized : null;
    })
    .filter(Boolean);
}

function removeTransientInspectionPhotoUrls(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    photos: (Array.isArray(item?.photos) ? item.photos : []).map((photo) => (
      photo?.storage_path
        ? { ...photo, url: null }
        : photo
    ))
  }));
}

function hasIssueDetailValue(value) {
  if (Array.isArray(value)) {
    return value.some(hasIssueDetailValue);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some(hasIssueDetailValue);
  }

  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function hasSubmittedIssueEvidence(item = {}) {
  const issueDetails = item.issue_details && typeof item.issue_details === 'object' && !Array.isArray(item.issue_details)
    ? item.issue_details
    : {};

  if (hasIssueDetailValue(issueDetails)) {
    return true;
  }

  if (normalizeSeverity(item.severity)) {
    return true;
  }

  if (item.note && String(item.note).trim()) {
    return true;
  }

  if (normalizeInspectionPhotos(item.photos || item.photo || item.photo_url).length) {
    return true;
  }

  if (item.manager_review_required === true || item.urgent_review === true || item.maintenance_followup_required === true) {
    return true;
  }

  return [
    'issue_type',
    'issue_types',
    'position',
    'positions',
    'light_type',
    'condition',
    'equipment_item',
    'safe_to_operate_answer'
  ].some((key) => hasIssueDetailValue(item[key]));
}

function normalizeIssueDetails(item = {}) {
  const issueDetails = item.issue_details && typeof item.issue_details === 'object' && !Array.isArray(item.issue_details)
    ? { ...item.issue_details }
    : {};

  for (const key of [
    'issue_type',
    'issue_types',
    'position',
    'positions',
    'light_type',
    'condition',
    'equipment_item',
    'safe_to_operate_answer'
  ]) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
      issueDetails[key] = item[key];
    }
  }

  return issueDetails;
}

function normalizeInspectionItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const key = String(item.checklist_item_key || item.id || '').trim();
      const label = String(item.label || item.checklist_item_label || key || 'Inspection item').trim();
      const checklistItemKey = key || normalizeKey(label);
      const submittedStatus = normalizeInspectionItemStatus(item.status);
      const status = submittedStatus === 'pass' && hasSubmittedIssueEvidence(item) ? 'issue' : submittedStatus;
      const legacyFailedStatus = String(item.status || '').trim().toLowerCase().replace(/\s+/g, '_') === 'fail';
      const severity = status === 'issue'
        ? normalizeSeverity(item.severity) || (legacyFailedStatus ? 'maintenance_soon' : null)
        : null;
      const issueDetails = status === 'issue' ? normalizeIssueDetails(item) : {};
      const photos = status === 'issue'
        ? normalizeInspectionPhotos(item.photos || item.photo || item.photo_url)
        : [];
      const category = item.category
        ? normalizeKey(item.category)
        : INSPECTION_ITEM_CATEGORIES[checklistItemKey] || 'other';

      return {
        checklist_item_key: checklistItemKey,
        label,
        category,
        status,
        severity,
        manager_review_required: status === 'issue' && (severity === 'unsafe' || item.manager_review_required === true),
        urgent_review: status === 'issue' && (severity === 'unsafe' || item.urgent_review === true),
        maintenance_followup_required: status === 'issue' && (
          severity === 'maintenance_soon' ||
          severity === 'unsafe' ||
          item.maintenance_followup_required === true
        ),
        issue_details: issueDetails,
        note: item.note ? String(item.note).trim() : null,
        photos,
        value: item.value !== undefined && item.value !== null ? String(item.value).trim() : null
      };
    });
}

function summarizeInspectionItems(items = [], { issueNote = null } = {}) {
  const normalizedItems = normalizeInspectionItems(items);
  const issueItems = normalizedItems.filter((item) => item.status === 'issue');
  const unansweredItems = normalizedItems.filter((item) => item.status === 'unanswered');
  const completedItems = normalizedItems.filter((item) => item.status !== 'unanswered');
  const hasIssueNote = Boolean(issueNote && String(issueNote).trim());
  const categoryIssueCounts = issueItems.reduce((counts, item) => ({
    ...counts,
    [item.category]: (counts[item.category] || 0) + 1
  }), {});
  const highestSeverity = issueItems.reduce((current, item) => {
    if (!item.severity) {
      return current;
    }

    if (!current || SEVERITY_RANK[item.severity] > SEVERITY_RANK[current]) {
      return item.severity;
    }

    return current;
  }, null);
  const urgentReview = issueItems.some((item) => item.urgent_review || item.severity === 'unsafe');
  const managerReviewRequired = urgentReview || issueItems.some((item) => item.manager_review_required);
  const maintenanceFollowupRequired = issueItems.some((item) => item.maintenance_followup_required);

  return {
    total_items: normalizedItems.length,
    completed_items_count: completedItems.length,
    unanswered_items_count: unansweredItems.length,
    unanswered_items: unansweredItems,
    issue_items: issueItems,
    failed_items: issueItems,
    issue_count: issueItems.length,
    failed_items_count: issueItems.length,
    critical_safety_issue_count: categoryIssueCounts.critical_safety || 0,
    maintenance_issue_count: categoryIssueCounts.maintenance || 0,
    safety_equipment_issue_count: categoryIssueCounts.safety_equipment || 0,
    vehicle_condition_issue_count: categoryIssueCounts.vehicle_condition || 0,
    highest_severity: highestSeverity,
    manager_review_required: managerReviewRequired,
    urgent_review: urgentReview,
    maintenance_followup_required: maintenanceFollowupRequired
  };
}

function resolveInspectionStatus({ items = [], issueNote = null, submittedStatus = null } = {}) {
  if (submittedStatus) {
    return normalizeInspectionStatus(submittedStatus);
  }

  const summary = summarizeInspectionItems(items, { issueNote });

  if (summary.urgent_review) {
    return 'urgent_manager_review';
  }

  if (summary.manager_review_required) {
    return 'manager_review_required';
  }

  if (summary.maintenance_followup_required) {
    return 'safe_with_maintenance_reported';
  }

  return 'safe_to_operate';
}

function validateInspectionItemsForSubmission(items = []) {
  const normalizedItems = normalizeInspectionItems(items);

  if (!normalizedItems.length) {
    return { error: 'At least one inspection item is required' };
  }

  if (normalizedItems.some((item) => item.status === 'unanswered')) {
    return { error: 'All inspection items must be answered before submitting' };
  }

  if (normalizedItems.some((item) => item.status === 'issue' && !item.severity)) {
    return { error: 'Issue severity is required for every inspection issue' };
  }

  return { items: normalizedItems };
}

function createLegacyInspectionPayload(payload = {}) {
  const issueReported = typeof payload.issue_reported === 'boolean'
    ? payload.issue_reported
    : Boolean(payload.issue_note || getLegacyInspectionStatus(payload.status) === 'needs_review');

  return {
    account_id: payload.account_id,
    vehicle_id: payload.vehicle_id,
    driver_id: payload.driver_id || payload.submitted_by_driver_id || null,
    route_id: payload.route_id || null,
    inspection_date: payload.inspection_date,
    inspection_type: 'daily_check',
    odometer: payload.odometer,
    issue_reported: issueReported,
    issue_note: payload.issue_note,
    status: getLegacyInspectionStatus(payload.status),
    submitted_at: payload.submitted_at,
    submitted_by_type: payload.submitted_by_type,
    submitted_by_driver_id: payload.submitted_by_driver_id || null,
    submitted_by_manager_user_id: payload.submitted_by_manager_user_id || null,
    submitted_by_name: payload.submitted_by_name || null
  };
}

async function insertVehicleInspectionWithSchemaFallback(supabase, payload) {
  const persistencePayload = {
    ...payload,
    items: removeTransientInspectionPhotoUrls(payload.items)
  };
  let currentPayload = { ...persistencePayload };
  const fallbackReasons = [];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from('vehicle_inspections')
      .insert(currentPayload)
      .select('*')
      .single();

    if (!error) {
      return { data, error: null, fallbackReasons };
    }

    if (isInspectionTypeConstraintError(error) && currentPayload.inspection_type !== 'daily_check') {
      currentPayload = createLegacyInspectionPayload(persistencePayload);
      fallbackReasons.push('legacy_inspection_type');
      continue;
    }

    if (isInspectionStatusConstraintError(error) && currentPayload.status !== getLegacyInspectionStatus(currentPayload.status)) {
      currentPayload = {
        ...currentPayload,
        status: getLegacyInspectionStatus(currentPayload.status)
      };
      fallbackReasons.push('legacy_inspection_status');
      continue;
    }

    if (!isMissingColumnError(error)) {
      return { data: null, error };
    }

    const missingColumn = getMissingColumnName(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(currentPayload, missingColumn)) {
      currentPayload = { ...currentPayload };
      delete currentPayload[missingColumn];
      fallbackReasons.push(`missing_column:${missingColumn}`);
      continue;
    }

    const legacyPayload = createLegacyInspectionPayload(persistencePayload);
    const changedToLegacyPayload = Object.keys(currentPayload).some((key) => legacyPayload[key] !== currentPayload[key]);
    if (!changedToLegacyPayload) {
      return { data: null, error };
    }

    currentPayload = legacyPayload;
    fallbackReasons.push('legacy_inspection_payload');
  }

  return {
    data: null,
    error: {
      code: 'INSPECTION_SCHEMA_FALLBACK_EXHAUSTED',
      message: 'Vehicle inspection insert could not be matched to the current database schema.'
    }
  };
}

module.exports = {
  getInspectionStatusLabel,
  insertVehicleInspectionWithSchemaFallback,
  isInspectionTypeConstraintError,
  isInspectionStatusConstraintError,
  isMissingColumnError,
  normalizeInspectionItems,
  resolveInspectionStatus,
  summarizeInspectionItems,
  validateInspectionItemsForSubmission
};
