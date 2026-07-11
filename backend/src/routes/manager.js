const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const defaultSupabase = require('../lib/supabase');
const { addDriverDocumentAccessUrl } = require('../services/privateStorage');
const { PRIVILEGED_MANAGER_ROLES } = require('../config/constants');
const { requireManager } = require('../middleware/auth');
const { parseMultipartForm } = require('../middleware/multipart');
const { createBillingService } = require('../services/billing');
const { attachApartmentIntelligenceToStops } = require('../services/apartmentIntelligence');
const { isUsableCoordinate, summarizeCoordinateHealth } = require('../services/coordinates');
const { attachPropertyIntelToStops, buildPropertyIntelKey, savePropertyIntel } = require('../services/propertyIntel');
const {
  sendManagerInviteEmail: defaultSendManagerInviteEmail,
  sendManagerPasswordResetEmail: defaultSendManagerPasswordResetEmail
} = require('../services/managerInviteEmail');
const { applyLocationCorrectionsToStops } = require('../services/locationCorrections');
const {
  detectApartmentUnitStop,
  detectBusinessContact,
  detectSecondaryAddressType,
  extractUnitLikeValue,
  extractBuildingLabel,
  extractFloorLabel,
  inferLocationType
} = require('../services/manifestParser');
const { attachStopNotesToStops, saveStopNote } = require('../services/stopNotes');
const { parseDriverImportRows } = require('../services/resourceImport');
const { filterProductionRows, isProductionTestArtifact } = require('../services/testDataFilter');
const { getRouteBillingSummary, parseBillingMonth, updateRouteBillingSettings } = require('../services/routeBilling');
const {
  listManagerNotifications,
  markNotificationRead,
  notifyDriverRouteInspectionAssigned,
  registerNotificationDeviceToken
} = require('../services/appNotifications');

function getCurrentDateString(now = new Date(), timeZone = process.env.APP_TIME_ZONE || 'America/Los_Angeles') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

const DEFAULT_DRIVER_STARTER_PIN = '1234';
const DRIVER_DOCUMENT_BUCKET = process.env.DRIVER_DOCUMENT_BUCKET || 'driver-documents';
const DRIVER_DOCUMENT_TYPES = Object.freeze({
  driver_license: { label: 'Driver License', required: true, allowMultiple: false, expires: true },
  mec: { label: 'MEC', required: true, allowMultiple: false, expires: true },
  qualification_certificate: { label: 'Qualification Certificate', required: true, allowMultiple: false, expires: false },
  signed_policy: { label: 'Signed Policy', required: true, allowMultiple: false, expires: false },
  write_up: { label: 'Write-ups', required: false, allowMultiple: true, expires: false },
  other: { label: 'Other Documents', required: false, allowMultiple: true, expires: false }
});
const DEFAULT_ROUTE_SYNC_SETTINGS = Object.freeze({
  operations_timezone: process.env.APP_TIME_ZONE || 'America/Los_Angeles',
  dispatch_window_start_hour: 9,
  dispatch_window_end_hour: 11,
  manifest_sync_interval_minutes: 15
});
const MIN_FCC_SYNC_START_HOUR = 9;
const LIVE_ROUTE_POSITION_MAX_AGE_MS = 2 * 60 * 1000;

function getRouteSortLabel(route) {
  return String(route?.work_area_name || route?.route_number || route?.route_name || route?.route_id || route?.id || '').trim();
}

function getRouteSortNumber(value) {
  const match = String(value || '').match(/\b\d{1,5}\b/);
  return match ? Number(match[0]) : null;
}

function compareRouteWorkAreas(left, right) {
  const leftLabel = getRouteSortLabel(left);
  const rightLabel = getRouteSortLabel(right);
  const leftNumber = getRouteSortNumber(leftLabel);
  const rightNumber = getRouteSortNumber(rightLabel);

  if (leftNumber != null && rightNumber != null && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  if (leftNumber != null && rightNumber == null) {
    return -1;
  }

  if (leftNumber == null && rightNumber != null) {
    return 1;
  }

  const labelComparison = leftLabel.localeCompare(rightLabel, undefined, { numeric: true, sensitivity: 'base' });

  if (labelComparison !== 0) {
    return labelComparison;
  }

  return String(left?.id || '').localeCompare(String(right?.id || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function sortRoutesByWorkArea(routes = []) {
  return [...(routes || [])].sort(compareRouteWorkAreas);
}

function isMissingDriverProfileColumn(error) {
  const message = String(error?.message || error?.details || '');
  return /date_of_birth|daily_flat_rate/i.test(message) && /column|schema|cache/i.test(message);
}

function isMissingTestDataColumn(error) {
  const message = String(error?.message || error?.details || '');
  return /is_test|test_data/i.test(message) && /column|schema|cache/i.test(message);
}

function isMissingDriverDocumentsTable(error) {
  const message = String(error?.message || error?.details || '');
  return /driver_documents/i.test(message) && /(does not exist|schema cache|relation|table|unexpected query)/i.test(message);
}

function sanitizeStorageSegment(value) {
  return String(value || 'file')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file';
}

function getDriverDocumentDefinition(documentType) {
  return DRIVER_DOCUMENT_TYPES[String(documentType || '').trim()] || null;
}

function buildDriverDocumentSummary(documents = []) {
  const byType = Object.keys(DRIVER_DOCUMENT_TYPES).reduce((summary, type) => {
    summary[type] = [];
    return summary;
  }, {});

  (documents || []).forEach((document) => {
    if (!byType[document.document_type]) {
      byType[document.document_type] = [];
    }
    byType[document.document_type].push(document);
  });

  const requiredTypes = Object.entries(DRIVER_DOCUMENT_TYPES)
    .filter(([, definition]) => definition.required)
    .map(([type]) => type);
  const completedRequired = requiredTypes.filter((type) => (byType[type] || []).length > 0);
  const now = Date.now();
  const expirationWindowMs = 30 * 24 * 60 * 60 * 1000;
  const expiringSoon = (documents || []).filter((document) => {
    if (!document.expires_on) {
      return false;
    }
    const expiresAt = new Date(document.expires_on).getTime();
    return Number.isFinite(expiresAt) && expiresAt >= now && expiresAt <= now + expirationWindowMs;
  });
  const expired = (documents || []).filter((document) => {
    if (!document.expires_on) {
      return false;
    }
    const expiresAt = new Date(document.expires_on).getTime();
    return Number.isFinite(expiresAt) && expiresAt < now;
  });

  return {
    required_total: requiredTypes.length,
    required_complete: completedRequired.length,
    missing_required: requiredTypes.filter((type) => !completedRequired.includes(type)),
    expiring_soon: expiringSoon.length,
    expired: expired.length,
    write_up_count: (byType.write_up || []).length,
    other_count: (byType.other || []).length,
    by_type: byType
  };
}

async function loadDriverDocumentsForAccount(supabase, accountId, driverIds = []) {
  if (!driverIds.length) {
    return new Map();
  }

  let data = [];
  let error = null;

  try {
    const result = await supabase
      .from('driver_documents')
      .select('id, driver_id, document_type, file_name, mime_type, file_size, storage_bucket, storage_path, public_url, expires_on, notes, uploaded_by_manager_id, created_at, updated_at')
      .eq('account_id', accountId)
      .in('driver_id', driverIds)
      .order('created_at', { ascending: false });

    data = result.data || [];
    error = result.error || null;
  } catch (queryError) {
    if (isMissingDriverDocumentsTable(queryError)) {
      return new Map();
    }
    throw queryError;
  }

  if (error) {
    if (isMissingDriverDocumentsTable(error)) {
      return new Map();
    }
    throw error;
  }

  const documentsWithAccess = await Promise.all(
    (data || []).map((document) => addDriverDocumentAccessUrl(supabase, document))
  );
  const documentsByDriverId = new Map();
  documentsWithAccess.forEach((document) => {
    const documents = documentsByDriverId.get(document.driver_id) || [];
    documents.push(document);
    documentsByDriverId.set(document.driver_id, documents);
  });
  return documentsByDriverId;
}

function parseIsoDateToUtcMidday(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatHourLabel(hour) {
  const normalizedHour = Number(hour);

  if (!Number.isInteger(normalizedHour) || normalizedHour < 0 || normalizedHour > 23) {
    return '--';
  }

  const period = normalizedHour >= 12 ? 'PM' : 'AM';
  const displayHour = normalizedHour % 12 || 12;
  return `${displayHour}:00 ${period}`;
}

function getTimeZoneDateParts(now, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return {
    date: `${lookup.get('year')}-${lookup.get('month')}-${lookup.get('day')}`,
    hour: Number(lookup.get('hour'))
  };
}

function presentRouteSyncSettings(account, selectedDate, now = new Date()) {
  const operationsTimezone = account?.operations_timezone || DEFAULT_ROUTE_SYNC_SETTINGS.operations_timezone;
  const configuredDispatchWindowStartHour = Number(
    account?.dispatch_window_start_hour ?? DEFAULT_ROUTE_SYNC_SETTINGS.dispatch_window_start_hour
  );
  const dispatchWindowStartHour = Math.max(configuredDispatchWindowStartHour, MIN_FCC_SYNC_START_HOUR);
  const dispatchWindowEndHour = Number(account?.dispatch_window_end_hour ?? DEFAULT_ROUTE_SYNC_SETTINGS.dispatch_window_end_hour);
  const manifestSyncIntervalMinutes = Number(
    account?.manifest_sync_interval_minutes ?? DEFAULT_ROUTE_SYNC_SETTINGS.manifest_sync_interval_minutes
  );

  const localNow = getTimeZoneDateParts(now, operationsTimezone);
  let dispatchWindowState = 'scheduled';

  if (selectedDate < localNow.date) {
    dispatchWindowState = 'historical';
  } else if (selectedDate === localNow.date) {
    if (localNow.hour < dispatchWindowStartHour) {
      dispatchWindowState = 'before_window';
    } else if (localNow.hour >= dispatchWindowEndHour) {
      dispatchWindowState = 'after_window';
    } else {
      dispatchWindowState = 'active_window';
    }
  }

  return {
    operations_timezone: operationsTimezone,
    dispatch_window_start_hour: dispatchWindowStartHour,
    configured_dispatch_window_start_hour: configuredDispatchWindowStartHour,
    dispatch_window_end_hour: dispatchWindowEndHour,
    dispatch_window_label: `${formatHourLabel(dispatchWindowStartHour)} - ${formatHourLabel(dispatchWindowEndHour)}`,
    manifest_sync_interval_minutes: manifestSyncIntervalMinutes,
    local_today: localNow.date,
    dispatch_window_state: dispatchWindowState
  };
}

function isValidTimeZone(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch (_error) {
    return false;
  }
}

function getWeekRangeFromDate(dateValue) {
  const date = parseIsoDateToUtcMidday(dateValue);
  const dayOfWeek = date.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(date);
  weekStart.setUTCDate(date.getUTCDate() + mondayOffset);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setUTCDate(weekStart.getUTCDate() + 7);
  weekEndExclusive.setUTCHours(0, 0, 0, 0);

  const weekEndInclusive = new Date(weekEndExclusive);
  weekEndInclusive.setUTCDate(weekEndExclusive.getUTCDate() - 1);

  return {
    weekStart,
    weekEndInclusive,
    weekEndExclusive
  };
}

function getBreakMinutes(startedAt, endedAt, now = new Date()) {
  if (!startedAt) {
    return 0;
  }

  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : now.getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return Math.round((end - start) / (1000 * 60));
}

function getBreakLimitMinutes(breakType) {
  switch (breakType) {
    case 'lunch':
      return 30;
    case 'rest':
    case 'other':
    default:
      return 15;
  }
}

function getScheduledBreakEnd(startedAt, breakType) {
  if (!startedAt) {
    return null;
  }

  const startedAtMs = new Date(startedAt).getTime();

  if (!Number.isFinite(startedAtMs)) {
    return null;
  }

  return new Date(startedAtMs + getBreakLimitMinutes(breakType) * 60 * 1000).toISOString();
}

function buildBreakDetail(breakRow, now = new Date()) {
  const scheduledEndAt = getScheduledBreakEnd(breakRow?.started_at, breakRow?.break_type);
  const scheduledEndMs = scheduledEndAt ? new Date(scheduledEndAt).getTime() : null;
  const currentMs = now.getTime();
  const isAutoEnded = !breakRow?.ended_at && Number.isFinite(scheduledEndMs) && currentMs >= scheduledEndMs;
  const effectiveEndedAt = breakRow?.ended_at || (isAutoEnded ? scheduledEndAt : null);

  return {
    id: breakRow.id,
    break_type: breakRow.break_type,
    started_at: breakRow.started_at,
    ended_at: effectiveEndedAt,
    scheduled_end_at: scheduledEndAt,
    is_active: !effectiveEndedAt,
    auto_ended: isAutoEnded,
    minutes: getBreakMinutes(breakRow.started_at, effectiveEndedAt, now)
  };
}

function getWorkedHours(clockIn, clockOut, storedHoursWorked, now = new Date()) {
  if (storedHoursWorked !== null && storedHoursWorked !== undefined) {
    return Number(storedHoursWorked || 0);
  }

  if (!clockIn) {
    return 0;
  }

  const start = new Date(clockIn).getTime();
  const end = clockOut ? new Date(clockOut).getTime() : now.getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return Number(((end - start) / (1000 * 60 * 60)).toFixed(2));
}

function getLunchMinutes(timecardBreaks = [], now = new Date()) {
  return (timecardBreaks || [])
    .filter((breakRow) => breakRow.break_type === 'lunch')
    .reduce((sum, breakRow) => sum + getBreakMinutes(breakRow.started_at, breakRow.ended_at, now), 0);
}

function getComplianceFlags({ clockOut, breaks = [], workedHours = 0, lunchMinutes = 0 }) {
  const flags = [];

  if (!clockOut) {
    flags.push('Open shift');
  }

  if ((breaks || []).some((breakRow) => !breakRow.ended_at)) {
    flags.push('Open break');
  }

  if (workedHours >= 6 && lunchMinutes < 30) {
    flags.push('Lunch review');
  }

  return flags;
}

function buildTimecardDetail(timecard, timecardBreaks = [], routeById = new Map(), now = new Date()) {
  const normalizedBreaks = (timecardBreaks || []).map((breakRow) => buildBreakDetail(breakRow, now));
  const workedHours = getWorkedHours(timecard.clock_in, timecard.clock_out, timecard.hours_worked, now);
  const breakMinutes = normalizedBreaks.reduce((sum, breakRow) => sum + Number(breakRow.minutes || 0), 0);
  const lunchMinutes = getLunchMinutes(normalizedBreaks, now);
  const payableHours = Math.max(0, Number((workedHours - lunchMinutes / 60).toFixed(2)));
  const route = routeById.get(timecard.route_id) || null;

  return {
    id: timecard.id,
    route_id: timecard.route_id || null,
    route_name: route?.work_area_name || null,
    clock_in: timecard.clock_in || null,
    clock_out: timecard.clock_out || null,
    worked_hours: workedHours,
    payable_hours: payableHours,
    break_minutes: breakMinutes,
    lunch_minutes: lunchMinutes,
    breaks: normalizedBreaks,
    compliance_flags: getComplianceFlags({
      clockOut: timecard.clock_out,
      breaks: normalizedBreaks,
      workedHours,
      lunchMinutes
    })
  };
}

function getLiveDriverStatus(latestTimecard) {
  if (!latestTimecard) {
    return {
      code: 'not_clocked_in',
      label: 'Not clocked in'
    };
  }

  if (latestTimecard.clock_out) {
    return {
      code: 'clocked_out',
      label: 'Clocked out'
    };
  }

  const activeBreak = (latestTimecard.breaks || []).find((breakRow) => breakRow.is_active) || null;

  if (activeBreak?.break_type === 'lunch') {
    return {
      code: 'on_lunch',
      label: 'On lunch'
    };
  }

  if (activeBreak) {
    return {
      code: 'on_break',
      label: 'On break'
    };
  }

  return {
    code: 'working',
    label: 'Working'
  };
}

function normalizeLaborMinutes(value) {
  const parsedValue = Number.parseInt(String(value ?? 0), 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return parsedValue;
}

function normalizeOptionalIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function validateBreakPair({ start, end, label }) {
  if ((start && !end) || (!start && end)) {
    return `${label} start and end are both required`;
  }

  if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
    return `${label} end must be later than start`;
  }

  return null;
}

function buildExplicitBreakRows({
  accountId,
  driverId,
  routeId,
  timecardId,
  lunchStart,
  lunchEnd,
  restBreakStart,
  restBreakEnd
}) {
  const rows = [];

  if (restBreakStart && restBreakEnd) {
    rows.push({
      account_id: accountId,
      driver_id: driverId,
      route_id: routeId,
      timecard_id: timecardId,
      break_type: 'rest',
      started_at: restBreakStart,
      ended_at: restBreakEnd
    });
  }

  if (lunchStart && lunchEnd) {
    rows.push({
      account_id: accountId,
      driver_id: driverId,
      route_id: routeId,
      timecard_id: timecardId,
      break_type: 'lunch',
      started_at: lunchStart,
      ended_at: lunchEnd
    });
  }

  return rows;
}

function buildSyntheticBreakRows({
  accountId,
  driverId,
  routeId,
  timecardId,
  clockIn,
  clockOut,
  breakMinutes,
  lunchMinutes
}) {
  const segments = [];
  const clockInMs = new Date(clockIn).getTime();
  const clockOutMs = clockOut
    ? new Date(clockOut).getTime()
    : clockInMs + Math.max((breakMinutes + lunchMinutes + 60), 8 * 60) * 60 * 1000;
  const shiftMinutes = Math.max(1, Math.round((clockOutMs - clockInMs) / (1000 * 60)));

  if (breakMinutes > 0) {
    segments.push({ break_type: 'rest', minutes: breakMinutes, anchor: 0.28 });
  }

  if (lunchMinutes > 0) {
    segments.push({ break_type: 'lunch', minutes: lunchMinutes, anchor: 0.58 });
  }

  let lastEndOffset = 0;

  return segments.map((segment) => {
    const maxStart = Math.max(0, shiftMinutes - segment.minutes);
    let startOffset = Math.round(shiftMinutes * segment.anchor - segment.minutes / 2);
    startOffset = Math.max(0, Math.min(maxStart, startOffset));

    if (startOffset < lastEndOffset) {
      startOffset = Math.min(maxStart, lastEndOffset);
    }

    const endOffset = Math.min(shiftMinutes, startOffset + segment.minutes);
    lastEndOffset = endOffset;

    return {
      account_id: accountId,
      driver_id: driverId,
      route_id: routeId,
      timecard_id: timecardId,
      break_type: segment.break_type,
      started_at: new Date(clockInMs + startOffset * 60 * 1000).toISOString(),
      ended_at: new Date(clockInMs + endOffset * 60 * 1000).toISOString()
    };
  });
}

function buildLaborAdjustmentSummary(row) {
  return {
    id: row.id,
    manager_user_id: row.manager_user_id || null,
    work_date: row.work_date,
    adjustment_reason: row.adjustment_reason,
    before_state: row.before_state || {},
    after_state: row.after_state || {},
    created_at: row.created_at
  };
}

async function syncDailyLaborSnapshotForDate({ supabase, accountId, workDate, now = new Date() }) {
  const { data: routes, error: routesError } = await supabase
    .from('routes')
    .select('id')
    .eq('account_id', accountId)
    .eq('date', workDate);

  if (routesError) {
    return { error: routesError };
  }

  const routeIds = (routes || []).map((route) => route.id);

  if (!routeIds.length) {
    return { finalized: false, snapshot_id: null };
  }

  const { data: openTimecards, error: openTimecardsError } = await supabase
    .from('timecards')
    .select('id')
    .in('route_id', routeIds)
    .is('clock_out', null);

  if (openTimecardsError) {
    return { error: openTimecardsError };
  }

  if ((openTimecards || []).length > 0) {
    return { finalized: false, snapshot_id: null };
  }

  const { data: drivers, error: driversError } = await supabase
    .from('drivers')
    .select('id, name, email, hourly_rate, is_active')
    .eq('account_id', accountId)
    .order('name');

  if (driversError) {
    return { error: driversError };
  }

  const { data: timecards, error: timecardsError } = await supabase
    .from('timecards')
    .select('id, driver_id, route_id, clock_in, clock_out, hours_worked')
    .in('route_id', routeIds);

  if (timecardsError) {
    return { error: timecardsError };
  }

  const timecardIds = (timecards || []).map((timecard) => timecard.id);
  const { data: breaks, error: breaksError } = timecardIds.length
    ? await supabase
        .from('timecard_breaks')
        .select('id, timecard_id, break_type, started_at, ended_at')
        .in('timecard_id', timecardIds)
    : { data: [], error: null };

  if (breaksError) {
    return { error: breaksError };
  }

  const breaksByTimecardId = (breaks || []).reduce((map, breakRow) => {
    const current = map.get(breakRow.timecard_id) || [];
    current.push(breakRow);
    map.set(breakRow.timecard_id, current);
    return map;
  }, new Map());

  const driverSummaries = (drivers || [])
    .map((driver) => {
      const driverTimecards = (timecards || []).filter((timecard) => timecard.driver_id === driver.id);

      if (!driverTimecards.length) {
        return null;
      }

      const summary = driverTimecards.reduce(
        (current, timecard) => {
          const timecardBreaks = breaksByTimecardId.get(timecard.id) || [];
          const workedHours = getWorkedHours(timecard.clock_in, timecard.clock_out, timecard.hours_worked, now);
          const totalBreakMinutes = timecardBreaks.reduce(
            (sum, breakRow) => sum + getBreakMinutes(breakRow.started_at, breakRow.ended_at, now),
            0
          );
          const lunchMinutes = timecardBreaks
            .filter((breakRow) => breakRow.break_type === 'lunch')
            .reduce((sum, breakRow) => sum + getBreakMinutes(breakRow.started_at, breakRow.ended_at, now), 0);
          const payableHours = Math.max(0, Number((workedHours - lunchMinutes / 60).toFixed(2)));

          current.shift_count += 1;
          current.worked_hours += workedHours;
          current.break_minutes += totalBreakMinutes;
          current.lunch_minutes += lunchMinutes;
          current.payable_hours += payableHours;
          return current;
        },
        { shift_count: 0, worked_hours: 0, break_minutes: 0, lunch_minutes: 0, payable_hours: 0 }
      );

      return {
        driver_id: driver.id,
        hourly_rate: Number(driver.hourly_rate || 0),
        shift_count: summary.shift_count,
        worked_hours: Number(summary.worked_hours.toFixed(2)),
        break_minutes: summary.break_minutes,
        lunch_minutes: summary.lunch_minutes,
        payable_hours: Number(summary.payable_hours.toFixed(2)),
        estimated_pay: Number((summary.payable_hours * Number(driver.hourly_rate || 0)).toFixed(2))
      };
    })
    .filter(Boolean);

  const totals = driverSummaries.reduce(
    (summary, row) => {
      summary.driver_count += 1;
      summary.shift_count += row.shift_count;
      summary.worked_hours += row.worked_hours;
      summary.payable_hours += row.payable_hours;
      summary.break_minutes += row.break_minutes;
      summary.lunch_minutes += row.lunch_minutes;
      summary.estimated_pay += row.estimated_pay;
      return summary;
    },
    { driver_count: 0, shift_count: 0, worked_hours: 0, payable_hours: 0, break_minutes: 0, lunch_minutes: 0, estimated_pay: 0 }
  );

  const finalizedAt = now.toISOString();
  const { data: existingSnapshot, error: existingSnapshotError } = await supabase
    .from('daily_labor_snapshots')
    .select('id')
    .eq('account_id', accountId)
    .eq('work_date', workDate)
    .maybeSingle();

  if (existingSnapshotError) {
    return { error: existingSnapshotError };
  }

  let snapshotId = existingSnapshot?.id || null;

  if (snapshotId) {
    const { error: updateSnapshotError } = await supabase
      .from('daily_labor_snapshots')
      .update({
        finalized_at: finalizedAt,
        driver_count: totals.driver_count,
        shift_count: totals.shift_count,
        total_worked_hours: Number(totals.worked_hours.toFixed(2)),
        total_payable_hours: Number(totals.payable_hours.toFixed(2)),
        total_break_minutes: totals.break_minutes,
        total_lunch_minutes: totals.lunch_minutes,
        estimated_payroll: Number(totals.estimated_pay.toFixed(2))
      })
      .eq('id', snapshotId);

    if (updateSnapshotError) {
      return { error: updateSnapshotError };
    }
  } else {
    const { data: insertedSnapshot, error: insertSnapshotError } = await supabase
      .from('daily_labor_snapshots')
      .insert({
        account_id: accountId,
        work_date: workDate,
        finalized_at: finalizedAt,
        finalized_by_system: false,
        driver_count: totals.driver_count,
        shift_count: totals.shift_count,
        total_worked_hours: Number(totals.worked_hours.toFixed(2)),
        total_payable_hours: Number(totals.payable_hours.toFixed(2)),
        total_break_minutes: totals.break_minutes,
        total_lunch_minutes: totals.lunch_minutes,
        estimated_payroll: Number(totals.estimated_pay.toFixed(2))
      })
      .select('id')
      .maybeSingle();

    if (insertSnapshotError) {
      return { error: insertSnapshotError };
    }

    snapshotId = insertedSnapshot?.id || null;
  }

  const { data: existingDriverRows, error: existingDriverRowsError } = await supabase
    .from('daily_driver_labor')
    .select('id, driver_id')
    .eq('batch_id', snapshotId);

  if (existingDriverRowsError) {
    return { error: existingDriverRowsError };
  }

  const existingRowsByDriverId = new Map((existingDriverRows || []).map((row) => [row.driver_id, row]));

  for (const row of driverSummaries) {
    const existingRow = existingRowsByDriverId.get(row.driver_id);

    if (existingRow?.id) {
      const { error: updateRowError } = await supabase
        .from('daily_driver_labor')
        .update({
          hourly_rate: row.hourly_rate,
          shift_count: row.shift_count,
          worked_hours: row.worked_hours,
          payable_hours: row.payable_hours,
          break_minutes: row.break_minutes,
          lunch_minutes: row.lunch_minutes,
          estimated_pay: row.estimated_pay
        })
        .eq('id', existingRow.id);

      if (updateRowError) {
        return { error: updateRowError };
      }
    } else {
      const { error: insertRowError } = await supabase
        .from('daily_driver_labor')
        .insert({
          batch_id: snapshotId,
          account_id: accountId,
          driver_id: row.driver_id,
          work_date: workDate,
          hourly_rate: row.hourly_rate,
          shift_count: row.shift_count,
          worked_hours: row.worked_hours,
          payable_hours: row.payable_hours,
          break_minutes: row.break_minutes,
          lunch_minutes: row.lunch_minutes,
          estimated_pay: row.estimated_pay
        });

      if (insertRowError) {
        return { error: insertRowError };
      }
    }
  }

  return {
    finalized: true,
    snapshot_id: snapshotId
  };
}

function parseDateParam(value, nowProvider) {
  if (!value) {
    return getCurrentDateString(nowProvider());
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return null;
  }

  return String(value);
}

function createAddressHash(address) {
  return require('crypto')
    .createHash('md5')
    .update(String(address || '').trim().toLowerCase())
    .digest('hex');
}

function roundToSingleDecimal(value) {
  return Math.round(value * 10) / 10;
}

function getStopsPerHour({ completedStops, firstScan, currentTime }) {
  if (!completedStops || !firstScan) {
    return null;
  }

  const firstScanTime = new Date(firstScan).getTime();
  const currentTimeMs = currentTime.getTime();

  if (!Number.isFinite(firstScanTime) || currentTimeMs <= firstScanTime) {
    return null;
  }

  const hoursWorked = (currentTimeMs - firstScanTime) / (1000 * 60 * 60);

  if (hoursWorked <= 0) {
    return null;
  }

  return roundToSingleDecimal(completedStops / hoursWorked);
}

function createLastPositionMap(positions) {
  return (positions || []).reduce((map, position) => {
    const key = position.driver_id;
    const existing = map.get(key);
    const positionTime = new Date(position.timestamp || position.recorded_at || position.created_at || 0).getTime();
    const existingTime = existing
      ? new Date(existing.timestamp || existing.recorded_at || existing.created_at || 0).getTime()
      : -Infinity;

    if (!existing || positionTime > existingTime) {
      map.set(key, position);
    }

    return map;
  }, new Map());
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getDateDaysAgo(date, days) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function getLatestTimestamp(values) {
  return (values || []).reduce((latest, value) => {
    if (!value) {
      return latest;
    }

    if (!latest) {
      return value;
    }

    return new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
  }, null);
}

function getRecentPosition(position, currentTime, maxAgeMs = 10 * 60 * 1000) {
  if (!position) {
    return null;
  }

  const timestamp = position.timestamp || position.recorded_at || position.created_at || null;

  if (!timestamp) {
    return null;
  }

  const recordedTime = new Date(timestamp).getTime();

  if (!Number.isFinite(recordedTime)) {
    return null;
  }

  if (currentTime.getTime() - recordedTime > maxAgeMs) {
    return null;
  }

  return {
    ...position,
    timestamp
  };
}

function getManifestSchemaError(error) {
  const message = String(error?.message || error?.details || error?.hint || '');

  if (
    /column .* does not exist/i.test(message) ||
    /could not find the .*column/i.test(message) ||
    /schema cache/i.test(message)
  ) {
    return 'Database is missing the FedEx manifest columns. Run the latest ALTER TABLE migration for stops and routes in Supabase, then refresh.';
  }

  return null;
}

function getManagerPortalBaseUrl() {
  return (
    process.env.MANAGER_PORTAL_URL ||
    process.env.VITE_MANAGER_PORTAL_URL ||
    'http://127.0.0.1:5173'
  );
}

function buildManagerInviteUrl(token) {
  const baseUrl = getManagerPortalBaseUrl().replace(/\/$/, '');
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}&mode=invite`;
}

function buildManagerPasswordResetUrl(token) {
  const baseUrl = getManagerPortalBaseUrl().replace(/\/$/, '');
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

function getPasswordVersion(hash) {
  return crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 16);
}

function isMissingManagerUsersTable(error) {
  return ['PGRST116', 'PGRST205', '42P01'].includes(error?.code);
}

function isMissingDriverStarterPinColumn(error) {
  const message = String(error?.message || error?.details || error?.hint || '');
  return /driver_starter_pin/i.test(message) && /column|schema cache|could not find/i.test(message);
}

function isMissingFedexDriverIdColumn(error) {
  const message = String(error?.message || error?.details || error?.hint || '');
  return /fedex_driver_id/i.test(message) && /column|schema cache|could not find/i.test(message);
}

function isMissingFedexAccountsTable(error) {
  const message = String(error?.message || error?.details || error?.hint || '');
  return ['PGRST116', 'PGRST205', '42P01'].includes(error?.code) || /fedex_accounts/i.test(message);
}

function normalizeFedexAccountNumber(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function maskFedexAccountNumber(value) {
  const normalized = normalizeFedexAccountNumber(value);

  if (!normalized) {
    return '••••';
  }

  const suffix = normalized.slice(-4);
  return `••••${suffix}`;
}

function toFedexAccountRecord(row) {
  return {
    id: row.id,
    account_id: row.account_id,
    nickname: row.nickname,
    account_number: row.account_number,
    account_number_masked: maskFedexAccountNumber(row.account_number),
    billing_contact_name: row.billing_contact_name || null,
    billing_company_name: row.billing_company_name || null,
    billing_address_line1: row.billing_address_line1,
    billing_address_line2: row.billing_address_line2 || null,
    billing_city: row.billing_city,
    billing_state_or_province: row.billing_state_or_province,
    billing_postal_code: row.billing_postal_code,
    billing_country_code: row.billing_country_code || 'US',
    connection_status: row.connection_status || 'not_started',
    connection_reference: row.connection_reference || null,
    fcc_username: null,
    fcc_username_masked: null,
    has_saved_fcc_password: false,
    fcc_password_updated_at: null,
    last_verified_at: row.last_verified_at || null,
    is_default: row.is_default === true,
    created_by_manager_user_id: row.created_by_manager_user_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    disconnected_at: row.disconnected_at || null
  };
}

async function listFedexAccountsForAccount(supabase, accountId) {
  const fedexAccountsQuery = await supabase
    .from('fedex_accounts')
    .select(
      'id, account_id, nickname, account_number, billing_contact_name, billing_company_name, billing_address_line1, billing_address_line2, billing_city, billing_state_or_province, billing_postal_code, billing_country_code, connection_status, connection_reference, last_verified_at, is_default, created_by_manager_user_id, created_at, updated_at, disconnected_at'
    )
    .eq('account_id', accountId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (fedexAccountsQuery.error) {
    if (isMissingFedexAccountsTable(fedexAccountsQuery.error)) {
      return {
        migrationRequired: true,
        accounts: []
      };
    }

    throw fedexAccountsQuery.error;
  }

  return {
    migrationRequired: false,
    accounts: (fedexAccountsQuery.data || []).map(toFedexAccountRecord)
  };
}

function summarizeFedexAccounts(accounts = [], fallbackTerminalLabel = null) {
  const activeAccounts = (accounts || []).filter((account) => !account.disconnected_at);
  const connectedAccounts = activeAccounts.filter((account) => account.connection_status === 'connected');
  const defaultAccount = activeAccounts.find((account) => account.is_default) || null;
  const connectedDefaultAccount = (defaultAccount && defaultAccount.connection_status === 'connected'
    ? defaultAccount
    : connectedAccounts[0]) || null;

  if (connectedDefaultAccount) {
    return {
      is_connected: true,
      terminal_label: connectedDefaultAccount.account_number_masked,
      default_account_id: connectedDefaultAccount.id,
      default_account_label: `${connectedDefaultAccount.nickname} (${connectedDefaultAccount.account_number_masked})`,
      connected_accounts_count: connectedAccounts.length
    };
  }

  return {
    is_connected: Boolean(fallbackTerminalLabel),
    terminal_label: fallbackTerminalLabel || null,
    default_account_id: defaultAccount?.id || null,
    default_account_label: defaultAccount
      ? `${defaultAccount.nickname} (${defaultAccount.account_number_masked})`
      : null,
    connected_accounts_count: connectedAccounts.length
  };
}

async function getFedexAccountForManager(supabase, accountId, fedexAccountId) {
  const fedexAccountQuery = await supabase
    .from('fedex_accounts')
    .select(
      'id, account_id, nickname, account_number, billing_contact_name, billing_company_name, billing_address_line1, billing_address_line2, billing_city, billing_state_or_province, billing_postal_code, billing_country_code, connection_status, connection_reference, last_verified_at, is_default, created_by_manager_user_id, created_at, updated_at, disconnected_at'
    )
    .eq('account_id', accountId)
    .eq('id', fedexAccountId)
    .maybeSingle();

  if (fedexAccountQuery.error) {
    if (isMissingFedexAccountsTable(fedexAccountQuery.error)) {
      return {
        migrationRequired: true,
        account: null
      };
    }

    throw fedexAccountQuery.error;
  }

  return {
    migrationRequired: false,
    account: fedexAccountQuery.data
      ? {
          ...toFedexAccountRecord(fedexAccountQuery.data),
          fcc_password_encrypted: null
        }
      : null
  };
}

function parseFedexAccountInput(body = {}) {
  return {
    nickname: String(body.nickname || '').trim(),
    account_number: normalizeFedexAccountNumber(body.account_number),
    billing_contact_name: String(body.billing_contact_name || '').trim(),
    billing_company_name: String(body.billing_company_name || '').trim(),
    billing_address_line1: String(body.billing_address_line1 || '').trim(),
    billing_address_line2: String(body.billing_address_line2 || '').trim(),
    billing_city: String(body.billing_city || '').trim(),
    billing_state_or_province: String(body.billing_state_or_province || '').trim(),
    billing_postal_code: String(body.billing_postal_code || '').trim(),
    billing_country_code: String(body.billing_country_code || 'US').trim().toUpperCase(),
    connection_status: String(body.connection_status || 'not_started').trim().toLowerCase(),
    connection_reference: String(body.connection_reference || '').trim()
  };
}

function hasFedexCredentialInput(body = {}) {
  return Boolean(
    String(body.fcc_username || '').trim() ||
    String(body.fcc_password || '') ||
    body.clear_saved_fcc_password === true
  );
}

function validateFedexAccountInput(input) {
  if (!input.nickname) {
    return 'nickname is required';
  }

  if (input.nickname.length > 80) {
    return 'nickname must be 80 characters or fewer';
  }

  if (!input.account_number || input.account_number.length < 5) {
    return 'account_number must be at least 5 characters';
  }

  if (!input.billing_address_line1 || !input.billing_city || !input.billing_state_or_province || !input.billing_postal_code) {
    return 'Billing address line 1, city, state/province, and postal code are required';
  }

  if (!input.billing_country_code || input.billing_country_code.length < 2) {
    return 'billing_country_code is required';
  }

  if (!['not_started', 'pending_mfa', 'connected', 'failed'].includes(input.connection_status)) {
    return 'connection_status must be not_started, pending_mfa, connected, or failed';
  }

  return null;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function getManagerUserStatus(managerUser) {
  return managerUser?.password_hash ? 'active' : 'pending_invite';
}

function toManagerAccessRecord(managerUser, primaryManagerEmail) {
  return {
    id: managerUser.id,
    account_id: managerUser.account_id,
    email: managerUser.email,
    full_name: managerUser.full_name || null,
    is_active: managerUser.is_active !== false,
    invited_at: managerUser.invited_at || null,
    accepted_at: managerUser.accepted_at || null,
    status: getManagerUserStatus(managerUser),
    is_primary: normalizeEmail(managerUser.email) === normalizeEmail(primaryManagerEmail)
  };
}

async function getAccountManagerContext(supabase, accountId) {
  const accountQuery = await supabase
    .from('accounts')
    .select('id, company_name, manager_email, driver_starter_pin')
    .eq('id', accountId)
    .maybeSingle();

  if (accountQuery.error) {
    if (!isMissingDriverStarterPinColumn(accountQuery.error)) {
      throw accountQuery.error;
    }

    const fallbackQuery = await supabase
      .from('accounts')
      .select('id, company_name, manager_email')
      .eq('id', accountId)
      .maybeSingle();

    if (fallbackQuery.error) {
      throw fallbackQuery.error;
    }

    return fallbackQuery.data
      ? {
          ...fallbackQuery.data,
          driver_starter_pin: null
        }
      : null;
  }

  return accountQuery.data || null;
}

async function listManagerUsersForAccount(supabase, accountId, primaryManagerEmail = null) {
  const managerUsersQuery = await supabase
    .from('manager_users')
    .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at, created_at')
    .eq('account_id', accountId)
    .order('created_at');

  if (managerUsersQuery.error && !isMissingManagerUsersTable(managerUsersQuery.error)) {
    throw managerUsersQuery.error;
  }

  const records = (managerUsersQuery.data || []).map((managerUser) =>
    toManagerAccessRecord(managerUser, primaryManagerEmail)
  );

  if (!records.length && primaryManagerEmail) {
    records.push({
      id: null,
      account_id: accountId,
      email: primaryManagerEmail,
      full_name: null,
      is_active: true,
      invited_at: null,
      accepted_at: null,
      status: 'active',
      is_primary: true,
      is_legacy: true
    });
  }

  return records;
}

function buildManagerAuthTokenPayload(identity) {
  const companyName = identity.company_name || null;

  return {
    account_id: identity.account_id,
    manager_user_id: identity.source === 'manager_user' ? identity.id : null,
    manager_email: identity.email,
    manager_name: identity.full_name,
    company_name: companyName,
    csa_name: companyName,
    role: 'manager'
  };
}

function isManagerUsersGlobalEmailConstraintError(error) {
  if (!error) {
    return false;
  }

  const combined = String(error.message || error.details || error.hint || error.code || '').toLowerCase();

  return (
    error.code === '23505' &&
    (combined.includes('manager_users_email') || combined.includes('manager_users_email_key'))
  );
}

function buildCsaLinkCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code = 'CSA-';

  for (let index = 0; index < 8; index += 1) {
    code += alphabet[bytes[index] % alphabet.length];
  }

  return code;
}

async function findSharedManagerIdentityByEmail(supabase, email, currentAccountId = null) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  const existingManagerIdentityQuery = await supabase
    .from('manager_users')
    .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at, created_at')
    .eq('email', normalizedEmail)
    .limit(25);

  if (existingManagerIdentityQuery.error) {
    if (isMissingManagerUsersTable(existingManagerIdentityQuery.error)) {
      throw existingManagerIdentityQuery.error;
    }

    throw existingManagerIdentityQuery.error;
  }

  return (existingManagerIdentityQuery.data || []).find((row) =>
    row.account_id !== currentAccountId &&
    row.is_active !== false &&
    row.password_hash
  ) || null;
}

async function findManagerIdentityForAccount(supabase, accountId, email) {
  const normalizedEmail = normalizeEmail(email);

  const managerUserQuery = await supabase
    .from('manager_users')
    .select('id, account_id, email, full_name, password_hash, is_active')
    .eq('account_id', accountId)
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (managerUserQuery.error && !isMissingManagerUsersTable(managerUserQuery.error)) {
    throw managerUserQuery.error;
  }

  if (managerUserQuery.data) {
    return {
      id: managerUserQuery.data.id,
      account_id: managerUserQuery.data.account_id,
      email: managerUserQuery.data.email,
      password_hash: managerUserQuery.data.password_hash,
      full_name: managerUserQuery.data.full_name,
      is_active: managerUserQuery.data.is_active,
      source: 'manager_user'
    };
  }

  const accountQuery = await supabase
    .from('accounts')
    .select('id, company_name, manager_email, manager_password_hash')
    .eq('id', accountId)
    .maybeSingle();

  if (accountQuery.error) {
    throw accountQuery.error;
  }

  if (!accountQuery.data || normalizeEmail(accountQuery.data.manager_email) !== normalizedEmail) {
    return null;
  }

  return {
    id: accountQuery.data.id,
    account_id: accountQuery.data.id,
    email: accountQuery.data.manager_email,
    password_hash: accountQuery.data.manager_password_hash,
    full_name: null,
    company_name: accountQuery.data.company_name || null,
    is_active: true,
    source: 'legacy_account'
  };
}

async function listAccessibleCsasForManager(supabase, managerEmail, currentAccountId = null, now = new Date()) {
  const normalizedEmail = normalizeEmail(managerEmail);
  const accessibleIds = new Set();

  const managerUsersQuery = await supabase
    .from('manager_users')
    .select('account_id, is_active')
    .eq('email', normalizedEmail);

  if (managerUsersQuery.error && !isMissingManagerUsersTable(managerUsersQuery.error)) {
    throw managerUsersQuery.error;
  }

  for (const row of managerUsersQuery.data || []) {
    if (row.account_id) {
      if (row.is_active !== false) {
        accessibleIds.add(row.account_id);
      }
    }
  }

  const legacyAccountsQuery = await supabase
    .from('accounts')
    .select('id')
    .eq('manager_email', normalizedEmail);

  if (legacyAccountsQuery.error) {
    throw legacyAccountsQuery.error;
  }

  for (const row of legacyAccountsQuery.data || []) {
    if (row.id) {
      accessibleIds.add(row.id);
    }
  }

  if (!accessibleIds.size) {
    return [];
  }

  const accountIds = [...accessibleIds];
  const accountsQuery = await supabase
    .from('accounts')
    .select('id, company_name, manager_email, created_at, operations_timezone, dispatch_window_start_hour, dispatch_window_end_hour, manifest_sync_interval_minutes')
    .in('id', accountIds)
    .order('company_name');

  if (accountsQuery.error) {
    throw accountsQuery.error;
  }

  const activeManagerRowsQuery = await supabase
    .from('manager_users')
    .select('account_id, id, is_active, email')
    .in('account_id', accountIds);

  if (activeManagerRowsQuery.error && !isMissingManagerUsersTable(activeManagerRowsQuery.error)) {
    throw activeManagerRowsQuery.error;
  }

  const driversQuery = await supabase
    .from('drivers')
    .select('id, account_id')
    .in('account_id', accountIds);

  if (driversQuery.error) {
    throw driversQuery.error;
  }

  const vehiclesQuery = await supabase
    .from('vehicles')
    .select('id, account_id')
    .in('account_id', accountIds);

  if (vehiclesQuery.error) {
    throw vehiclesQuery.error;
  }

  const localTodayByAccount = new Map();
  for (const account of accountsQuery.data || []) {
    const routeSyncSettings = presentRouteSyncSettings(account, getCurrentDateString(now), now);
    localTodayByAccount.set(account.id, routeSyncSettings.local_today);
  }

  const routeDates = [...new Set(localTodayByAccount.values())];
  const routesQuery = await supabase
    .from('routes')
    .select('id, account_id, archived_at, date, driver_id, vehicle_id, dispatch_state, sync_state, last_manifest_change_at, dispatched_at')
    .in('account_id', accountIds)
    .in('date', routeDates);

  if (routesQuery.error) {
    throw routesQuery.error;
  }

  const managersByAccount = new Map();
  const primaryManagerEmailByAccount = new Map();
  for (const row of activeManagerRowsQuery.data || []) {
    const current = managersByAccount.get(row.account_id) || 0;
    managersByAccount.set(row.account_id, current + (row.is_active === false ? 0 : 1));
    if (!primaryManagerEmailByAccount.has(row.account_id) && row.email) {
      primaryManagerEmailByAccount.set(row.account_id, normalizeEmail(row.email));
    }
  }

  const driversByAccount = new Map();
  for (const row of driversQuery.data || []) {
    driversByAccount.set(row.account_id, (driversByAccount.get(row.account_id) || 0) + 1);
  }

  const vehiclesByAccount = new Map();
  for (const row of vehiclesQuery.data || []) {
    vehiclesByAccount.set(row.account_id, (vehiclesByAccount.get(row.account_id) || 0) + 1);
  }

  const routesByAccount = new Map();
  const routeStatusSummaryByAccount = new Map();
  for (const row of routesQuery.data || []) {
    if (row.archived_at) {
      continue;
    }

    if (row.date !== localTodayByAccount.get(row.account_id)) {
      continue;
    }

    routesByAccount.set(row.account_id, (routesByAccount.get(row.account_id) || 0) + 1);

    const current = routeStatusSummaryByAccount.get(row.account_id) || {
      ready: 0,
      review: 0,
      blocked: 0,
      dispatched: 0
    };
    const syncState = presentRouteSyncState(row);

    if (row.dispatch_state === 'dispatched') {
      current.dispatched += 1;
    } else if (shouldBlockDispatchForSyncState(syncState)) {
      current.blocked += 1;
    } else if (['staged_changed', 'changed_after_dispatch'].includes(syncState)) {
      current.review += 1;
    } else {
      current.ready += 1;
    }

    routeStatusSummaryByAccount.set(row.account_id, current);
  }

  return (accountsQuery.data || []).map((account) => ({
    ...(routeStatusSummaryByAccount.get(account.id) || {
      ready: 0,
      review: 0,
      blocked: 0,
      dispatched: 0
    }),
    id: account.id,
    company_name: account.company_name,
    manager_email: account.manager_email || primaryManagerEmailByAccount.get(account.id) || null,
    created_at: account.created_at || null,
    is_current: account.id === currentAccountId,
    local_date: localTodayByAccount.get(account.id) || getCurrentDateString(now),
    route_sync_settings: presentRouteSyncSettings(
      account,
      localTodayByAccount.get(account.id) || getCurrentDateString(now),
      now
    ),
    manager_count: managersByAccount.get(account.id) || 0,
    driver_count: driversByAccount.get(account.id) || 0,
    vehicle_count: vehiclesByAccount.get(account.id) || 0,
    routes_today: routesByAccount.get(account.id) || 0
  }));
}

async function ensureLinkedManagerAccess(supabase, accountId, managerIdentity, nowIso) {
  const existingManagerUserQuery = await supabase
    .from('manager_users')
    .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at')
    .eq('account_id', accountId)
    .eq('email', normalizeEmail(managerIdentity.email))
    .maybeSingle();

  if (existingManagerUserQuery.error && !isMissingManagerUsersTable(existingManagerUserQuery.error)) {
    throw existingManagerUserQuery.error;
  }

  if (existingManagerUserQuery.data) {
    const existing = existingManagerUserQuery.data;
    const updates = {
      full_name: managerIdentity.full_name || existing.full_name || null,
      is_active: true,
      invited_at: existing.invited_at || nowIso,
      accepted_at: existing.accepted_at || nowIso
    };

    if (managerIdentity.password_hash) {
      updates.password_hash = managerIdentity.password_hash;
    }

    const { data, error } = await supabase
      .from('manager_users')
      .update(updates)
      .eq('id', existing.id)
      .select('id, account_id, email, full_name, password_hash, is_active')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return {
      id: data.id,
      account_id: data.account_id,
      email: data.email,
      password_hash: data.password_hash,
      full_name: data.full_name,
      is_active: data.is_active,
      source: 'manager_user'
    };
  }

  const { data, error } = await supabase
    .from('manager_users')
    .insert({
      account_id: accountId,
      email: normalizeEmail(managerIdentity.email),
      full_name: managerIdentity.full_name || null,
      password_hash: managerIdentity.password_hash || null,
      is_active: true,
      invited_at: nowIso,
      accepted_at: nowIso
    })
    .select('id, account_id, email, full_name, password_hash, is_active')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    account_id: data.account_id,
    email: data.email,
    password_hash: data.password_hash,
    full_name: data.full_name,
    is_active: data.is_active,
    source: 'manager_user'
  };
}

async function findManagerIdentityById(supabase, managerUserId) {
  if (!managerUserId) {
    return null;
  }

  const managerUserQuery = await supabase
    .from('manager_users')
    .select('id, account_id, email, full_name, password_hash, is_active')
    .eq('id', managerUserId)
    .maybeSingle();

  if (managerUserQuery.error && !isMissingManagerUsersTable(managerUserQuery.error)) {
    throw managerUserQuery.error;
  }

  if (!managerUserQuery.data || managerUserQuery.data.is_active === false) {
    return null;
  }

  return {
    id: managerUserQuery.data.id,
    account_id: managerUserQuery.data.account_id,
    email: managerUserQuery.data.email,
    password_hash: managerUserQuery.data.password_hash,
    full_name: managerUserQuery.data.full_name,
    is_active: managerUserQuery.data.is_active,
    source: 'manager_user'
  };
}

async function ensureReciprocalCsaManagerAccess(supabase, linkCode, currentManagerIdentity, currentAccountId, nowIso) {
  if (!linkCode?.created_by_manager_user_id || !currentManagerIdentity?.email || !currentAccountId) {
    return null;
  }

  const codeCreatorIdentity = await findManagerIdentityById(supabase, linkCode.created_by_manager_user_id);

  if (!codeCreatorIdentity?.email || codeCreatorIdentity.account_id !== linkCode.account_id) {
    return null;
  }

  if (normalizeEmail(codeCreatorIdentity.email) === normalizeEmail(currentManagerIdentity.email)) {
    return null;
  }

  const invitedCreatorIdentity = await findManagerIdentityForAccount(
    supabase,
    currentAccountId,
    codeCreatorIdentity.email
  );

  if (!invitedCreatorIdentity || invitedCreatorIdentity.is_active === false) {
    return null;
  }

  return ensureLinkedManagerAccess(supabase, currentAccountId, codeCreatorIdentity, nowIso);
}

function isDisplayableManagerRoute(route) {
  return !route?.archived_at && Boolean(String(route?.work_area_name || '').trim());
}

function isDispatchBlockedRoute(route) {
  return !route?.driver_id || !route?.vehicle_id;
}

function presentRouteSyncState(route) {
  if (!route) {
    return 'sync_pending';
  }

  if (route.dispatch_state === 'dispatched' && route.dispatched_at && route.last_manifest_change_at) {
    const dispatchedAt = new Date(route.dispatched_at).getTime();
    const lastChangeAt = new Date(route.last_manifest_change_at).getTime();

    if (Number.isFinite(dispatchedAt) && Number.isFinite(lastChangeAt) && lastChangeAt > dispatchedAt) {
      return 'changed_after_dispatch';
    }
  }

  if (isDispatchBlockedRoute(route)) {
    return 'dispatch_blocked';
  }

  return route.sync_state || 'sync_pending';
}

function shouldBlockDispatchForSyncState(syncState) {
  return ['sync_pending', 'syncing', 'sync_failed', 'needs_attention', 'dispatch_blocked'].includes(syncState);
}

function getPostDispatchChangePolicy(route) {
  const syncState = presentRouteSyncState(route);

  if (syncState !== 'changed_after_dispatch') {
    return {
      code: 'none',
      label: 'No post-dispatch change',
      tone: 'neutral',
      should_notify_driver: false,
      should_notify_manager: false,
      requires_manager_review: false
    };
  }

  const completedStops = Number(route?.completed_stops || 0);
  const hasStartedWork = completedStops > 0 || route?.status === 'in_progress' || route?.status === 'complete';

  if (hasStartedWork) {
    return {
      code: 'manager_review_required',
      label: 'Manager review required',
      tone: 'urgent',
      should_notify_driver: true,
      should_notify_manager: true,
      requires_manager_review: true
    };
  }

  return {
    code: 'driver_warning',
    label: 'Driver warning',
    tone: 'warning',
    should_notify_driver: true,
    should_notify_manager: true,
    requires_manager_review: false
  };
}

async function recordRouteSyncEvents(supabase, events = []) {
  const payload = (events || []).filter(
    (event) => event?.account_id && event?.route_id && event?.work_date && event?.event_type && event?.summary
  );

  if (!payload.length) {
    return;
  }

  const { error } = await supabase.from('route_sync_events').insert(payload);

  if (error) {
    console.error('Route sync event insert failed:', error);
  }
}

function getTimeCommitCounts(stops = []) {
  const timeCommitStops = (stops || []).filter((stop) => stop.has_time_commit);
  const completedStatuses = new Set(['delivered', 'attempted', 'incomplete', 'pickup_complete', 'pickup_attempted']);
  const completed = timeCommitStops.filter((stop) => completedStatuses.has(stop.status)).length;

  return {
    total: timeCommitStops.length,
    completed
  };
}

function isCompletedStopStatus(status) {
  return ['delivered', 'attempted', 'incomplete', 'pickup_complete', 'pickup_attempted'].includes(status);
}

function isPickupStop(stop) {
  return Boolean(
    stop?.has_pickup ||
    stop?.is_pickup ||
    stop?.stop_type === 'pickup' ||
    stop?.stop_type === 'combined'
  );
}

function isDeliveryStop(stop) {
  return Boolean(
    stop?.has_delivery ||
    stop?.stop_type === 'delivery' ||
    stop?.stop_type === 'combined' ||
    !isPickupStop(stop)
  );
}

function isCombinedStop(stop) {
  return isPickupStop(stop) && isDeliveryStop(stop);
}

function getTypedStopSummary(stops = [], predicate) {
  return (stops || []).reduce(
    (summary, stop) => {
      if (!predicate(stop)) {
        return summary;
      }

      summary.total += 1;

      if (isCompletedStopStatus(stop.status) || stop.completed_at) {
        summary.completed += 1;
      }

      return summary;
    },
    {
      completed: 0,
      total: 0
    }
  );
}

function getPickupStopSummary(stops = []) {
  return getTypedStopSummary(stops, isPickupStop);
}

function getDeliveryStopSummary(stops = []) {
  return getTypedStopSummary(stops, isDeliveryStop);
}

function getCombinedStopSummary(stops = []) {
  return getTypedStopSummary(stops, isCombinedStop);
}

function getStopStatusSummary(stops = []) {
  return (stops || []).reduce(
    (summary, stop) => {
      if (stop.exception_code || stop.status === 'attempted' || stop.status === 'incomplete' || stop.status === 'pickup_attempted') {
        summary.exception += 1;
      }

      if (isCompletedStopStatus(stop.status)) {
        summary.completed += 1;
      } else {
        summary.pending += 1;
      }

      return summary;
    },
    {
      completed: 0,
      pending: 0,
      exception: 0
    }
  );
}

function getPackageStatusSummary(packages = [], stopsById = new Map()) {
  return (packages || []).reduce(
    (summary, pkg) => {
      const stop = stopsById.get(pkg.stop_id);

      if (stop?.exception_code || stop?.status === 'attempted' || stop?.status === 'incomplete' || stop?.status === 'pickup_attempted') {
        summary.exception += 1;
      } else if (stop && isCompletedStopStatus(stop.status)) {
        summary.completed += 1;
      } else {
        summary.pending += 1;
      }

      return summary;
    },
    {
      completed: 0,
      pending: 0,
      exception: 0
    }
  );
}

function createPackagesByStopId(packages = []) {
  return (packages || []).reduce((map, pkg) => {
    const current = map.get(pkg.stop_id) || [];
    current.push({
      id: pkg.id,
      stop_id: pkg.stop_id,
      tracking_number: pkg.tracking_number,
      service_code: pkg.service_code,
      requires_signature: pkg.requires_signature,
      requires_adult_signature: pkg.requires_adult_signature,
      hazmat: pkg.hazmat
    });
    map.set(pkg.stop_id, current);
    return map;
  }, new Map());
}

function isOptionalPackageDetailColumnError(error) {
  const message = String(error?.message || error?.details || error?.hint || '');
  return /service_code/i.test(message) || /requires_adult_signature/i.test(message) || /schema cache/i.test(message);
}

async function fetchPackagesByStopIds(supabase, stopIds = [], selectClause = 'id, stop_id') {
  const normalizedStopIds = [...new Set((stopIds || []).filter(Boolean))];

  if (!normalizedStopIds.length) {
    return { data: [], error: null };
  }

  const chunkSize = 125;
  const packageRows = [];

  for (let index = 0; index < normalizedStopIds.length; index += chunkSize) {
    const chunk = normalizedStopIds.slice(index, index + chunkSize);
    let { data, error } = await supabase
      .from('packages')
      .select(selectClause)
      .in('stop_id', chunk);

    if (error && isOptionalPackageDetailColumnError(error)) {
      const fallback = await supabase
        .from('packages')
        .select('id, stop_id, tracking_number, requires_signature, hazmat')
        .in('stop_id', chunk);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return { data: null, error };
    }

    packageRows.push(...(data || []));
  }

  return {
    data: packageRows,
    error: null
  };
}

function getCoordinateBoundary(stops = []) {
  const validStops = (stops || []).filter(
    (stop) => isUsableCoordinate(stop.lat, stop.lng)
  );

  if (!validStops.length) {
    return null;
  }

  const latitudes = validStops.map((stop) => Number(stop.lat));
  const longitudes = validStops.map((stop) => Number(stop.lng));

  return {
    minLat: Math.min(...latitudes) - 0.005,
    maxLat: Math.max(...latitudes) + 0.005,
    minLng: Math.min(...longitudes) - 0.005,
    maxLng: Math.max(...longitudes) + 0.005
  };
}

const STOP_CONTACT_INFO_FIELDS = [
  'primary_phone',
  'alternate_phone',
  'email',
  'business_name',
  'company_name',
  'customer_instructions',
  'delivery_instructions',
  'consignee',
  'shipper'
];

function hasStopContactInfo(stop = {}) {
  return STOP_CONTACT_INFO_FIELDS.some((field) => {
    const value = stop?.[field];
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
}

function omitBroadStopContactFields(stop = {}) {
  const {
    business_name: _businessName,
    company_name: _companyName,
    primary_phone: _primaryPhone,
    alternate_phone: _alternatePhone,
    email: _email,
    customer_instructions: _customerInstructions,
    delivery_instructions: _deliveryInstructions,
    consignee: _consignee,
    shipper: _shipper,
    contact_source: _contactSource,
    contact_last_imported_at: _contactLastImportedAt,
    raw_contact_metadata: _rawContactMetadata,
    ...rest
  } = stop || {};

  return {
    ...rest,
    has_contact_info: hasStopContactInfo(stop)
  };
}

function addDerivedStopFields(stop) {
  const isBusiness = detectBusinessContact(stop.contact_name, stop.address_line2, stop.stop_type);
  const isApartment = detectApartmentUnitStop({ ...stop, is_business: isBusiness });
  const secondaryAddressType = detectSecondaryAddressType(stop.address_line2);
  const unitLikeValue = extractUnitLikeValue(stop.address_line2);
  const floorLabel = extractFloorLabel(stop.address_line2);

  return {
    ...stop,
    has_contact_info: hasStopContactInfo(stop),
    is_business: isBusiness,
    is_apartment_unit: isApartment,
    secondary_address_type: secondaryAddressType,
    unit_label: secondaryAddressType === 'unit' ? unitLikeValue : null,
    suite_label: secondaryAddressType === 'suite' ? unitLikeValue : null,
    building_label: extractBuildingLabel(stop.address_line2),
    floor_label: floorLabel,
    location_type: inferLocationType({ ...stop, is_business: isBusiness })
  };
}

function normalizePropertyIntelText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizePropertyIntelFlags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((flag) => normalizePropertyIntelText(flag).toLowerCase())
      .filter(Boolean)
  )];
}

function presentPropertyIntelRow(row) {
  return {
    id: row.id,
    normalized_address: row.normalized_address || null,
    display_address: row.display_address || row.normalized_address || null,
    property_name: row.property_name || null,
    property_type: row.property_type || null,
    building: row.building || null,
    access_code: row.access_code || null,
    access_code_confirmed_at: row.access_code_confirmed_at || null,
    access_code_source: row.access_code_source || null,
    access_note: row.access_note || null,
    parking_note: row.parking_note || null,
    entry_note: row.entry_note || null,
    business_hours: row.business_hours || null,
    shared_note: row.shared_note || null,
    warning_flags: normalizePropertyIntelFlags(row.warning_flags),
    updated_at: row.updated_at || null
  };
}

function canManageAccountSettings(req) {
  const managerRole = String(req.account?.manager_role || 'owner').trim().toLowerCase();
  return PRIVILEGED_MANAGER_ROLES.includes(managerRole);
}

function requireAccountSettingsAccess(req, res, next) {
  if (!canManageAccountSettings(req)) {
    return res.status(403).json({ error: 'Admin or owner access required' });
  }

  return next();
}

function createManagerRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const nowProvider = options.now || (() => new Date());
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const sendManagerInviteEmail = options.sendManagerInviteEmail || defaultSendManagerInviteEmail;
  const sendManagerPasswordResetEmail = options.sendManagerPasswordResetEmail || defaultSendManagerPasswordResetEmail;
  const billingService = options.billingService || createBillingService({
    supabase,
    stripeClient: options.stripeClient,
    stripePriceId: options.stripePriceId,
    trialDays: options.trialDays
  });

  router.get('/dashboard', requireManager, async (req, res) => {
    const requestedDate = parseDateParam(req.query?.date, nowProvider);
    const operationsDate = requestedDate || getCurrentDateString(nowProvider());

    try {
      let driversQuery = await supabase
        .from('drivers')
        .select('id, name, is_active, is_test, test_data')
        .eq('account_id', req.account.account_id)
        .eq('is_active', true)
        .order('name');

      if (driversQuery.error && isMissingTestDataColumn(driversQuery.error)) {
        driversQuery = await supabase
          .from('drivers')
          .select('id, name, is_active')
          .eq('account_id', req.account.account_id)
          .eq('is_active', true)
          .order('name');
      }

      if (driversQuery.error) {
        console.error('Dashboard driver lookup failed:', driversQuery.error);
        return res.status(500).json({ error: 'Failed to load dashboard drivers' });
      }

      let routesQuery = await supabase
        .from('routes')
        .select('id, driver_id, vehicle_id, date, status, total_stops, completed_stops, work_area_name, created_at, archived_at, is_test, test_data')
        .eq('account_id', req.account.account_id)
        .eq('date', operationsDate)
        .is('archived_at', null)
        .order('id');

      if (routesQuery.error && isMissingTestDataColumn(routesQuery.error)) {
        routesQuery = await supabase
          .from('routes')
          .select('id, driver_id, vehicle_id, date, status, total_stops, completed_stops, work_area_name, created_at, archived_at')
          .eq('account_id', req.account.account_id)
          .eq('date', operationsDate)
          .is('archived_at', null)
          .order('id');
      }

      if (routesQuery.error) {
        console.error('Dashboard route lookup failed:', routesQuery.error);
        return res.status(500).json({ error: 'Failed to load dashboard routes' });
      }

      const drivers = filterProductionRows(driversQuery.data || [], ['name', 'email']);
      const visibleRoutes = sortRoutesByWorkArea(
        filterProductionRows(routesQuery.data || [], ['work_area_name', 'source'])
          .filter(isDisplayableManagerRoute)
      );

      let latestRouteSyncQuery = await supabase
        .from('routes')
        .select('created_at, work_area_name, source, is_test, test_data')
        .eq('account_id', req.account.account_id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestRouteSyncQuery.error && isMissingTestDataColumn(latestRouteSyncQuery.error)) {
        latestRouteSyncQuery = await supabase
          .from('routes')
          .select('created_at, work_area_name, source')
          .eq('account_id', req.account.account_id)
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
      }

      if (latestRouteSyncQuery.error) {
        console.error('Dashboard latest route sync lookup failed:', latestRouteSyncQuery.error);
        return res.status(500).json({ error: 'Failed to load dashboard sync status' });
      }

      const latestRouteSyncRow = latestRouteSyncQuery.data &&
        !isProductionTestArtifact(latestRouteSyncQuery.data, ['work_area_name', 'source'])
        ? latestRouteSyncQuery.data
        : null;

      const routeIds = visibleRoutes.map((route) => route.id);
      const vehicleIds = [...new Set(visibleRoutes.map((route) => route.vehicle_id).filter(Boolean))];
      let stops = [];
      let positions = [];
      let packages = [];
      let vehicles = [];

      if (routeIds.length > 0) {
        const { data: stopRows, error: stopsError } = await supabase
          .from('stops')
          .select('id, route_id, sequence_order, status, completed_at, address, delivery_type_code, has_time_commit, exception_code, stop_type, has_pickup, has_delivery, is_pickup')
          .in('route_id', routeIds)
          .order('sequence_order');

        if (stopsError) {
          console.error('Dashboard stop lookup failed:', stopsError);
          return res.status(500).json({ error: getManifestSchemaError(stopsError) || 'Failed to load dashboard stops' });
        }

        stops = stopRows || [];

        const stopIds = stops.map((stop) => stop.id);

        if (stopIds.length > 0) {
          const { data: packageRows, error: packagesError } = await fetchPackagesByStopIds(
            supabase,
            stopIds,
            'id, stop_id'
          );

          if (packagesError) {
            console.error('Dashboard packages lookup failed:', packagesError);
            return res.status(500).json({ error: 'Failed to load dashboard packages' });
          }

          packages = packageRows || [];
        }

        const { data: positionRows, error: positionsError } = await supabase
          .from('driver_positions')
          .select('driver_id, route_id, lat, lng, timestamp')
          .in('route_id', routeIds)
          .order('timestamp', { ascending: false });

        if (positionsError) {
          console.error('Dashboard position lookup failed:', positionsError);
          return res.status(500).json({ error: 'Failed to load driver positions' });
        }

        positions = positionRows || [];
      }

      if (vehicleIds.length > 0) {
        const { data: vehicleRows, error: vehiclesError } = await supabase
          .from('vehicles')
          .select('id, name, plate, is_test, test_data')
          .eq('account_id', req.account.account_id)
          .in('id', vehicleIds);

        if (vehiclesError && isMissingTestDataColumn(vehiclesError)) {
          const fallbackVehiclesQuery = await supabase
            .from('vehicles')
            .select('id, name, plate')
            .eq('account_id', req.account.account_id)
            .in('id', vehicleIds);

          if (fallbackVehiclesQuery.error) {
            console.error('Dashboard vehicle lookup failed:', fallbackVehiclesQuery.error);
            return res.status(500).json({ error: 'Failed to load dashboard vehicles' });
          }

          vehicles = filterProductionRows(fallbackVehiclesQuery.data || [], ['name', 'plate']);
        } else if (vehiclesError) {
          console.error('Dashboard vehicle lookup failed:', vehiclesError);
          return res.status(500).json({ error: 'Failed to load dashboard vehicles' });
        } else {
          vehicles = filterProductionRows(vehicleRows || [], ['name', 'plate']);
        }
      }

      const driverById = new Map((drivers || []).map((driver) => [driver.id, driver]));
      const vehicleById = new Map((vehicles || []).map((vehicle) => [vehicle.id, vehicle]));
      const stopsById = new Map((stops || []).map((stop) => [stop.id, stop]));
      const stopsByRouteId = (stops || []).reduce((map, stop) => {
        const current = map.get(stop.route_id) || [];
        current.push(stop);
        map.set(stop.route_id, current);
        return map;
      }, new Map());
      const lastPositionByDriverId = createLastPositionMap(positions);
      const currentTime = nowProvider();

      const totalStops = visibleRoutes.reduce(
        (sum, route) => sum + Number(route.total_stops || 0),
        0
      );
      const completedStops = visibleRoutes.reduce(
        (sum, route) => sum + Number(route.completed_stops || 0),
        0
      );
      const completedRoutes = visibleRoutes.filter((route) => route.status === 'complete').length;
      const routesToday = Number(visibleRoutes.length);
      const routesAssigned = visibleRoutes.filter((route) => Boolean(route.driver_id)).length;
      const driversOnRoad = visibleRoutes.filter((route) => route.status === 'in_progress' && route.driver_id).length;
      const timeCommitTotals = visibleRoutes.reduce(
        (summary, route) => {
          const routeCounts = getTimeCommitCounts(stopsByRouteId.get(route.id) || []);
          summary.total += routeCounts.total;
          summary.completed += routeCounts.completed;
          return summary;
        },
        { total: 0, completed: 0 }
      );
      const stopStatusSummary = getStopStatusSummary(stops);
      const packageStatusSummary = getPackageStatusSummary(packages, stopsById);
      const pickupStopSummary = getPickupStopSummary(stops);
      const deliveryStopSummary = getDeliveryStopSummary(stops);
      const combinedStopSummary = getCombinedStopSummary(stops);

      const driverSnapshot = visibleRoutes.map((route) => {
        const driver = route.driver_id ? driverById.get(route.driver_id) || null : null;
        const routeStops = stopsByRouteId.get(route.id) || [];
        const routeTimeCommitCounts = getTimeCommitCounts(routeStops);
        const routePickupStopSummary = getPickupStopSummary(routeStops);
        const routeDeliveryStopSummary = getDeliveryStopSummary(routeStops);
        const routeCombinedStopSummary = getCombinedStopSummary(routeStops);
        const completedRouteStops = routeStops.filter((stop) => stop.completed_at);
        const firstScan = completedRouteStops.reduce((earliest, stop) => {
          if (!stop.completed_at) {
            return earliest;
          }

          if (!earliest || new Date(stop.completed_at).getTime() < new Date(earliest).getTime()) {
            return stop.completed_at;
          }

          return earliest;
        }, null);
        const nextPendingStop = routeStops.find((stop) => stop.status === 'pending') || null;
        const lastPosition = driver ? lastPositionByDriverId.get(driver.id) || null : null;
        const lastPositionTimestamp = lastPosition
          ? lastPosition.timestamp || lastPosition.recorded_at || lastPosition.created_at || null
          : null;
        const isOnline = Boolean(
          lastPositionTimestamp &&
          currentTime.getTime() - new Date(lastPositionTimestamp).getTime() < 2 * 60 * 1000
        );

        return {
          driver_id: driver ? driver.id : null,
          name: driver ? driver.name : null,
          route_id: route.id,
          work_area_name: route.work_area_name,
          vehicle_name: route.vehicle_id ? vehicleById.get(route.vehicle_id)?.name || null : null,
          vehicle_plate: route.vehicle_id ? vehicleById.get(route.vehicle_id)?.plate || null : null,
          vehicle_id: route.vehicle_id || null,
          route_status: route.status,
          current_stop_number: nextPendingStop ? nextPendingStop.sequence_order : null,
          current_stop_address: nextPendingStop ? nextPendingStop.address : null,
          total_stops: Number(route.total_stops || 0),
          completed_stops: Number(route.completed_stops || 0),
          delivery_stops: routeDeliveryStopSummary.total,
          delivery_stops_completed: routeDeliveryStopSummary.completed,
          delivery_stop_count: routeDeliveryStopSummary.total,
          pickup_stops: routePickupStopSummary.total,
          pickup_stops_completed: routePickupStopSummary.completed,
          pickup_stop_count: routePickupStopSummary.total,
          driver_pickup_stops: routePickupStopSummary.total,
          combined_stops: routeCombinedStopSummary.total,
          combined_stops_completed: routeCombinedStopSummary.completed,
          combined_stop_count: routeCombinedStopSummary.total,
          time_commits_total: routeTimeCommitCounts.total,
          time_commits_completed: routeTimeCommitCounts.completed,
          stops_per_hour: getStopsPerHour({
            completedStops: Number(route.completed_stops || 0),
            firstScan,
            currentTime
          }),
          last_position: lastPosition
            ? {
                lat: lastPosition.lat,
                lng: lastPosition.lng,
                timestamp: lastPositionTimestamp
              }
            : null,
          is_online: isOnline
        };
      });

      return res.status(200).json({
        date: operationsDate,
        total_stops: totalStops,
        completed_stops: completedStops,
        total_delivery_stops: deliveryStopSummary.total,
        delivery_stops: deliveryStopSummary.total,
        delivery_stops_completed: deliveryStopSummary.completed,
        total_pickup_stops: pickupStopSummary.total,
        pickup_stops: pickupStopSummary.total,
        pickup_stops_completed: pickupStopSummary.completed,
        total_combined_stops: combinedStopSummary.total,
        combined_stops: combinedStopSummary.total,
        combined_stops_completed: combinedStopSummary.completed,
        combined_stop_count: combinedStopSummary.total,
        time_commits_total: timeCommitTotals.total,
        time_commits_completed: timeCommitTotals.completed,
        route_summary: {
          completed: completedRoutes,
          total: routesToday
        },
        commits_summary: {
          completed: timeCommitTotals.completed,
          total: timeCommitTotals.total
        },
        stop_status_summary: stopStatusSummary,
        package_status_summary: {
          ...packageStatusSummary,
          total: packages.length
        },
        sync_status: {
          routes_today: routesToday,
          routes_assigned: routesAssigned,
          drivers_on_road: driversOnRoad,
          total_pickup_stops: pickupStopSummary.total,
          total_combined_stops: combinedStopSummary.total,
          last_sync_at: latestRouteSyncRow?.created_at || getLatestTimestamp(visibleRoutes.map((route) => route.created_at))
        },
        drivers: driverSnapshot
      });
    } catch (error) {
      console.error('Manager dashboard endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load manager dashboard' });
    }
  });

  router.get('/drivers', requireManager, async (req, res) => {
    try {
      let driversQuery = await supabase
        .from('drivers')
        .select('id, account_id, name, email, fedex_driver_id, phone, date_of_birth, hourly_rate, daily_flat_rate, is_active, is_test, test_data')
        .eq('account_id', req.account.account_id)
        .order('name');

      if (driversQuery.error && (isMissingFedexDriverIdColumn(driversQuery.error) || isMissingDriverProfileColumn(driversQuery.error) || isMissingTestDataColumn(driversQuery.error))) {
        driversQuery = await supabase
          .from('drivers')
          .select('id, account_id, name, email, phone, hourly_rate, is_active')
          .eq('account_id', req.account.account_id)
          .order('name');
      }

      if (driversQuery.error) {
        console.error('Manager drivers lookup failed:', driversQuery.error);
        return res.status(500).json({ error: 'Failed to load drivers' });
      }

      const productionDrivers = filterProductionRows(driversQuery.data || [], ['name', 'email', 'fedex_driver_id']);
      const driverIds = productionDrivers.map((driver) => driver.id);
      const documentsByDriverId = await loadDriverDocumentsForAccount(supabase, req.account.account_id, driverIds);

      return res.status(200).json({
        drivers: productionDrivers.map((driver) => ({
          fedex_driver_id: null,
          date_of_birth: null,
          daily_flat_rate: 0,
          ...driver,
          documents: documentsByDriverId.get(driver.id) || [],
          document_summary: buildDriverDocumentSummary(documentsByDriverId.get(driver.id) || [])
        }))
      });
    } catch (error) {
      console.error('Manager drivers endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load drivers' });
    }
  });

  router.get('/manager-users', requireManager, async (req, res) => {
    try {
      const account = await getAccountManagerContext(supabase, req.account.account_id);
      const managerUsers = await listManagerUsersForAccount(
        supabase,
        req.account.account_id,
        account?.manager_email || null
      );

      return res.status(200).json({ manager_users: managerUsers });
    } catch (error) {
      console.error('Manager users lookup failed:', error);
      return res.status(500).json({ error: 'Failed to load manager access' });
    }
  });

  router.get('/csas', requireManager, async (req, res) => {
    try {
      const accessibleCsas = await listAccessibleCsasForManager(
        supabase,
        req.account.manager_email,
        req.account.account_id,
        nowProvider()
      );
      const currentCsa = accessibleCsas.find((entry) => entry.is_current) || null;

      return res.status(200).json({
        current_csa: currentCsa,
        csas: accessibleCsas
      });
    } catch (error) {
      console.error('CSA listing failed:', error);
      return res.status(500).json({ error: 'Failed to load CSA access' });
    }
  });

  router.post('/account/cancel', requireManager, async (req, res) => {
    const confirmCompanyName = String(req.body?.confirm_company_name || '').trim();

    if (!confirmCompanyName) {
      return res.status(400).json({ error: 'confirm_company_name is required' });
    }

    try {
      const account = await getAccountManagerContext(supabase, req.account.account_id);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      if (normalizeEmail(req.account.manager_email) !== normalizeEmail(account.manager_email)) {
        return res.status(403).json({ error: 'Only the workspace owner can cancel ReadyRoute.' });
      }

      if (confirmCompanyName.toLowerCase() !== String(account.company_name || '').trim().toLowerCase()) {
        return res.status(400).json({ error: 'Type the exact company name to close this workspace.' });
      }

      await billingService.closeAccount(account.id, { deleteCustomer: true });

      const { error: deleteError } = await supabase
        .from('accounts')
        .delete()
        .eq('id', account.id);

      if (deleteError) {
        throw deleteError;
      }

      return res.status(200).json({
        success: true,
        company_name: account.company_name
      });
    } catch (error) {
      console.error('Manager account cancel failed:', error);
      return res.status(500).json({ error: 'Could not cancel ReadyRoute right now.' });
    }
  });

  router.get('/billing/summary', requireManager, async (req, res) => {
    const month = String(req.query?.month || '').trim();

    try {
      const summary = await getRouteBillingSummary({
        supabase,
        accountId: req.account.account_id,
        month,
        nowProvider
      });

      if (!summary) {
        return res.status(400).json({ error: 'month must be in YYYY-MM format' });
      }

      if (summary.not_found) {
        return res.status(404).json({ error: 'Account not found' });
      }

      return res.status(200).json({ billing: summary });
    } catch (error) {
      console.error('Manager billing summary failed:', error);
      return res.status(500).json({ error: 'Failed to load billing summary' });
    }
  });

  router.patch('/billing/settings', requireManager, requireAccountSettingsAccess, async (req, res) => {
    const month = String(req.body?.month || req.query?.month || '').trim();

    if (month && !parseBillingMonth(month, nowProvider)) {
      return res.status(400).json({ error: 'month must be in YYYY-MM format' });
    }

    try {
      const updateResult = await updateRouteBillingSettings({
        supabase,
        accountId: req.account.account_id,
        committedRouteCount: req.body?.committed_route_count,
        updatedAt: nowProvider().toISOString()
      });

      if (!updateResult.valid) {
        return res.status(400).json({ error: updateResult.error });
      }

      const summary = await getRouteBillingSummary({
        supabase,
        accountId: req.account.account_id,
        month,
        nowProvider
      });

      if (!summary) {
        return res.status(400).json({ error: 'month must be in YYYY-MM format' });
      }

      if (summary.not_found) {
        return res.status(404).json({ error: 'Account not found' });
      }

      return res.status(200).json({
        billing: summary,
        settings: updateResult.settings
      });
    } catch (error) {
      console.error('Manager billing settings update failed:', error);
      return res.status(500).json({ error: 'Failed to update billing settings' });
    }
  });

  router.post('/csas', requireManager, async (req, res) => {
    const companyName = String(req.body?.company_name || '').trim();
    const requestedRouteCount = req.body?.route_count ?? req.body?.routes ?? req.body?.vehicle_count ?? 0;
    const routeCommitment = Number(requestedRouteCount);

    if (!companyName) {
      return res.status(400).json({ error: 'company_name is required' });
    }

    if (!Number.isFinite(routeCommitment) || routeCommitment < 0) {
      return res.status(400).json({ error: 'route_count must be 0 or greater' });
    }

    if (!jwtSecret) {
      return res.status(500).json({ error: 'Missing JWT_SECRET environment variable' });
    }

    try {
      const managerIdentity = await findManagerIdentityForAccount(
        supabase,
        req.account.account_id,
        req.account.manager_email
      );

      if (!managerIdentity || !managerIdentity.password_hash) {
        return res.status(403).json({ error: 'Current manager identity could not be reused for CSA creation' });
      }

      const nowIso = nowProvider().toISOString();
      const committedRouteCount = Math.round(routeCommitment);
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .insert({
          company_name: companyName,
          // Linked CSA access now lives in manager_users so one manager can own multiple CSAs.
          manager_email: null,
          manager_password_hash: managerIdentity.password_hash,
          vehicle_count: committedRouteCount,
          plan: 'starter'
        })
        .select('id, company_name, manager_email, created_at')
        .single();

      if (accountError || !account) {
        throw accountError || new Error('Failed to create CSA account');
      }

      const billingSettingsResult = await updateRouteBillingSettings({
        supabase,
        accountId: account.id,
        committedRouteCount,
        updatedAt: nowIso
      });

      if (!billingSettingsResult.valid) {
        return res.status(400).json({ error: billingSettingsResult.error });
      }

      const linkedIdentity = await ensureLinkedManagerAccess(supabase, account.id, managerIdentity, nowIso);
      const token = jwt.sign(buildManagerAuthTokenPayload({
        ...linkedIdentity,
        company_name: account.company_name || null
      }), jwtSecret, { expiresIn: '24h' });

      return res.status(201).json({
        token,
        csa: {
          id: account.id,
          company_name: account.company_name,
          manager_email: account.manager_email || normalizeEmail(linkedIdentity.email),
          created_at: account.created_at,
          is_current: true,
          manager_count: 1,
          driver_count: 0,
          vehicle_count: 0,
          routes_today: 0
        }
      });
    } catch (error) {
      console.error('CSA creation failed:', error);
      return res.status(500).json({ error: 'Failed to create CSA' });
    }
  });

  router.post('/csas/switch', requireManager, async (req, res) => {
    const targetAccountId = String(req.body?.account_id || '').trim();

    if (!targetAccountId) {
      return res.status(400).json({ error: 'account_id is required' });
    }

    if (!jwtSecret) {
      return res.status(500).json({ error: 'Missing JWT_SECRET environment variable' });
    }

    try {
      const targetIdentity = await findManagerIdentityForAccount(
        supabase,
        targetAccountId,
        req.account.manager_email
      );

      if (!targetIdentity || targetIdentity.is_active === false) {
        return res.status(403).json({ error: 'You do not have access to that CSA' });
      }

      const { data: targetAccount, error: targetAccountError } = await supabase
        .from('accounts')
        .select('id, company_name')
        .eq('id', targetIdentity.account_id)
        .maybeSingle();

      if (targetAccountError) {
        throw targetAccountError;
      }

      const token = jwt.sign(buildManagerAuthTokenPayload({
        ...targetIdentity,
        company_name: targetAccount?.company_name || null
      }), jwtSecret, { expiresIn: '24h' });

      return res.status(200).json({
        token,
        account_id: targetIdentity.account_id,
        company_name: targetAccount?.company_name || null
      });
    } catch (error) {
      console.error('CSA switch failed:', error);
      return res.status(500).json({ error: 'Failed to switch CSA' });
    }
  });

  router.delete('/csas/:accountId/access', requireManager, async (req, res) => {
    const targetAccountId = String(req.params.accountId || '').trim();
    const managerEmail = normalizeEmail(req.account.manager_email);

    if (!targetAccountId) {
      return res.status(400).json({ error: 'account_id is required' });
    }

    if (targetAccountId === req.account.account_id) {
      return res.status(409).json({ error: 'Switch to another CSA before unlinking the current one.' });
    }

    try {
      const targetAccount = await getAccountManagerContext(supabase, targetAccountId);

      if (!targetAccount) {
        return res.status(404).json({ error: 'CSA not found' });
      }

      if (normalizeEmail(targetAccount.manager_email) === managerEmail) {
        return res.status(409).json({ error: 'Primary manager access cannot be unlinked from here.' });
      }

      const managerUserQuery = await supabase
        .from('manager_users')
        .select('id, account_id, email, is_active')
        .eq('account_id', targetAccountId)
        .eq('email', managerEmail)
        .maybeSingle();

      if (managerUserQuery.error) {
        if (isMissingManagerUsersTable(managerUserQuery.error)) {
          return res.status(500).json({ error: 'CSA unlink is not available until the latest database migration is run' });
        }

        throw managerUserQuery.error;
      }

      const managerUser = managerUserQuery.data;

      if (!managerUser || managerUser.is_active === false) {
        return res.status(404).json({ error: 'CSA link not found' });
      }

      const activeManagersQuery = await supabase
        .from('manager_users')
        .select('id, email, is_active')
        .eq('account_id', targetAccountId);

      if (activeManagersQuery.error) {
        if (isMissingManagerUsersTable(activeManagersQuery.error)) {
          return res.status(500).json({ error: 'CSA unlink is not available until the latest database migration is run' });
        }

        throw activeManagersQuery.error;
      }

      const otherActiveManagers = (activeManagersQuery.data || []).filter((row) =>
        row.id !== managerUser.id && row.is_active !== false
      );

      if (!otherActiveManagers.length) {
        return res.status(409).json({ error: 'Add another active manager to that CSA before unlinking your access.' });
      }

      const { error: updateError } = await supabase
        .from('manager_users')
        .update({ is_active: false })
        .eq('id', managerUser.id);

      if (updateError) {
        throw updateError;
      }

      const accessibleCsas = await listAccessibleCsasForManager(
        supabase,
        req.account.manager_email,
        req.account.account_id,
        nowProvider()
      );

      return res.status(200).json({
        success: true,
        unlinked_account_id: targetAccountId,
        csas: accessibleCsas
      });
    } catch (error) {
      console.error('CSA unlink failed:', error);
      return res.status(500).json({ error: 'Failed to unlink CSA access' });
    }
  });

  router.post('/csas/link-code', requireManager, async (req, res) => {
    const expiresInHours = 24;

    try {
      const code = buildCsaLinkCode();
      const createdAt = nowProvider();
      const expiresAt = new Date(createdAt.getTime() + expiresInHours * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('account_link_codes')
        .insert({
          account_id: req.account.account_id,
          code,
          created_by_manager_user_id: req.account.manager_user_id || null,
          expires_at: expiresAt
        })
        .select('id, account_id, code, expires_at, created_at')
        .single();

      if (error || !data) {
        throw error || new Error('Failed to create CSA link code');
      }

      return res.status(201).json({
        link_code: data.code,
        expires_at: data.expires_at,
        created_at: data.created_at
      });
    } catch (error) {
      console.error('CSA link code generation failed:', error);
      return res.status(500).json({ error: 'Failed to generate CSA link code' });
    }
  });

  router.post('/csas/link-existing', requireManager, async (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();

    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }

    try {
      const managerIdentity = await findManagerIdentityForAccount(
        supabase,
        req.account.account_id,
        req.account.manager_email
      );

      if (!managerIdentity || !managerIdentity.password_hash) {
        return res.status(403).json({ error: 'Current manager identity could not be reused for CSA linking' });
      }

      const linkCodeQuery = await supabase
        .from('account_link_codes')
        .select('id, account_id, code, expires_at, used_at, created_by_manager_user_id')
        .eq('code', code)
        .maybeSingle();

      if (linkCodeQuery.error) {
        throw linkCodeQuery.error;
      }

      const linkCode = linkCodeQuery.data;

      if (!linkCode) {
        return res.status(404).json({ error: 'CSA link code not found' });
      }

      if (linkCode.used_at) {
        return res.status(409).json({ error: 'That CSA link code has already been used' });
      }

      if (new Date(linkCode.expires_at).getTime() < nowProvider().getTime()) {
        return res.status(410).json({ error: 'That CSA link code has expired' });
      }

      if (linkCode.account_id === req.account.account_id) {
        return res.status(409).json({ error: 'That code belongs to the current CSA already' });
      }

      const invitedTargetIdentity = await findManagerIdentityForAccount(
        supabase,
        linkCode.account_id,
        req.account.manager_email
      );

      if (!invitedTargetIdentity || invitedTargetIdentity.is_active === false) {
        return res.status(403).json({
          error: 'You must be invited as a manager to that CSA before you can link it to this login.',
          invite_required: true
        });
      }

      const linkedAt = nowProvider().toISOString();
      await ensureLinkedManagerAccess(supabase, linkCode.account_id, managerIdentity, linkedAt);
      await ensureReciprocalCsaManagerAccess(
        supabase,
        linkCode,
        managerIdentity,
        req.account.account_id,
        linkedAt
      );

      const { error: updateError } = await supabase
        .from('account_link_codes')
        .update({
          used_at: nowProvider().toISOString(),
          used_by_account_id: req.account.account_id
        })
        .eq('id', linkCode.id);

      if (updateError) {
        throw updateError;
      }

      const accessibleCsas = await listAccessibleCsasForManager(
        supabase,
        req.account.manager_email,
        req.account.account_id,
        nowProvider()
      );

      return res.status(200).json({
        message: 'CSA linked successfully.',
        csas: accessibleCsas
      });
    } catch (error) {
      console.error('CSA link claim failed:', error);
      return res.status(500).json({ error: 'Failed to link CSA' });
    }
  });

  router.get('/driver-access', requireManager, async (req, res) => {
    try {
      const account = await getAccountManagerContext(supabase, req.account.account_id);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      return res.status(200).json({
        starter_pin: account.driver_starter_pin || DEFAULT_DRIVER_STARTER_PIN
      });
    } catch (error) {
      console.error('Driver access settings lookup failed:', error);
      return res.status(500).json({ error: 'Failed to load driver access settings' });
    }
  });

  router.get('/route-sync-settings', requireManager, async (req, res) => {
    try {
      const { data: account, error } = await supabase
        .from('accounts')
        .select('operations_timezone, dispatch_window_start_hour, dispatch_window_end_hour, manifest_sync_interval_minutes')
        .eq('id', req.account.account_id)
        .maybeSingle();

      if (error) {
        console.error('Route sync settings lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load route sync settings' });
      }

      return res.status(200).json({
        route_sync_settings: presentRouteSyncSettings(account || {}, getCurrentDateString(nowProvider()), nowProvider())
      });
    } catch (error) {
      console.error('Route sync settings endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load route sync settings' });
    }
  });

  router.patch('/route-sync-settings', requireManager, async (req, res) => {
    const operationsTimezone = String(req.body?.operations_timezone || '').trim();
    const dispatchWindowStartHour = Number(req.body?.dispatch_window_start_hour);
    const dispatchWindowEndHour = Number(req.body?.dispatch_window_end_hour);
    const manifestSyncIntervalMinutes = Number(req.body?.manifest_sync_interval_minutes);

    if (!isValidTimeZone(operationsTimezone)) {
      return res.status(400).json({ error: 'operations_timezone must be a valid IANA timezone.' });
    }

    if (!Number.isInteger(dispatchWindowStartHour) || dispatchWindowStartHour < 0 || dispatchWindowStartHour > 23) {
      return res.status(400).json({ error: 'dispatch_window_start_hour must be an integer from 0 to 23.' });
    }

    if (!Number.isInteger(dispatchWindowEndHour) || dispatchWindowEndHour < 1 || dispatchWindowEndHour > 23) {
      return res.status(400).json({ error: 'dispatch_window_end_hour must be an integer from 1 to 23.' });
    }

    if (dispatchWindowEndHour <= dispatchWindowStartHour) {
      return res.status(400).json({ error: 'dispatch_window_end_hour must be later than dispatch_window_start_hour.' });
    }

    if (![5, 10, 15, 20, 30, 60].includes(manifestSyncIntervalMinutes)) {
      return res.status(400).json({ error: 'manifest_sync_interval_minutes must be one of 5, 10, 15, 20, 30, or 60.' });
    }

    try {
      const { data: account, error } = await supabase
        .from('accounts')
        .update({
          operations_timezone: operationsTimezone,
          dispatch_window_start_hour: dispatchWindowStartHour,
          dispatch_window_end_hour: dispatchWindowEndHour,
          manifest_sync_interval_minutes: manifestSyncIntervalMinutes
        })
        .eq('id', req.account.account_id)
        .select('operations_timezone, dispatch_window_start_hour, dispatch_window_end_hour, manifest_sync_interval_minutes')
        .maybeSingle();

      if (error) {
        console.error('Route sync settings update failed:', error);
        return res.status(500).json({ error: 'Failed to update route sync settings' });
      }

      return res.status(200).json({
        ok: true,
        route_sync_settings: presentRouteSyncSettings(account || {}, getCurrentDateString(nowProvider(), operationsTimezone), nowProvider())
      });
    } catch (error) {
      console.error('Route sync settings patch endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update route sync settings' });
    }
  });

  router.get('/notifications', requireManager, async (req, res) => {
    try {
      const { notifications, error } = await listManagerNotifications(supabase, {
        accountId: req.account.account_id,
        managerUserId: req.account.manager_user_id,
        limit: req.query?.limit
      });

      if (error) {
        console.error('Manager notifications lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load notifications' });
      }

      return res.status(200).json({ notifications });
    } catch (error) {
      console.error('Manager notifications endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load notifications' });
    }
  });

  router.post('/notifications/device-token', requireManager, async (req, res) => {
    try {
      const now = nowProvider().toISOString();
      const { deviceToken, error } = await registerNotificationDeviceToken(supabase, {
        account_id: req.account.account_id,
        recipient_type: 'manager',
        manager_user_id: req.account.manager_user_id,
        expo_push_token: req.body?.expo_push_token,
        platform: req.body?.platform,
        device_id: req.body?.device_id,
        app_version: req.body?.app_version,
        device_name: req.body?.device_name,
        registered_at: now,
        updated_at: now
      });

      if (error) {
        if (!error.code) {
          return res.status(400).json({ error: error.message || 'Invalid device token' });
        }

        console.error('Manager notification device token registration failed:', error);
        return res.status(500).json({ error: 'Failed to register device token' });
      }

      return res.status(deviceToken ? 200 : 202).json({
        registered: Boolean(deviceToken),
        device_token: deviceToken
      });
    } catch (error) {
      console.error('Manager notification device token endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to register device token' });
    }
  });

  router.patch('/notifications/:notification_id/read', requireManager, async (req, res) => {
    try {
      const { notification, error } = await markNotificationRead(supabase, {
        accountId: req.account.account_id,
        notificationId: req.params.notification_id,
        recipientType: 'manager',
        managerUserId: req.account.manager_user_id,
        readAt: nowProvider().toISOString()
      });

      if (error) {
        console.error('Manager notification read update failed:', error);
        return res.status(500).json({ error: 'Failed to update notification' });
      }

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      return res.status(200).json({ notification });
    } catch (error) {
      console.error('Manager notification read endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update notification' });
    }
  });

  router.patch('/driver-access', requireManager, async (req, res) => {
    const starterPin = String(req.body?.starter_pin || '').trim();

    if (!/^\d{4}$/.test(starterPin)) {
      return res.status(400).json({ error: 'Starter PIN must be a 4-digit code' });
    }

    try {
      const { error } = await supabase
        .from('accounts')
        .update({
          driver_starter_pin: starterPin
        })
        .eq('id', req.account.account_id);

      if (error) {
        if (isMissingDriverStarterPinColumn(error)) {
          return res.status(500).json({ error: 'Run the latest account driver starter PIN migration in Supabase before saving this setting.' });
        }
        console.error('Driver access settings update failed:', error);
        return res.status(500).json({ error: 'Failed to update driver access settings' });
      }

      return res.status(200).json({ ok: true, starter_pin: starterPin });
    } catch (error) {
      console.error('Driver access settings patch endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update driver access settings' });
    }
  });

  router.get('/property-intel', requireManager, async (req, res) => {
    try {
      const { data: rows, error } = await supabase
        .from('property_intel')
        .select('id, normalized_address, display_address, property_name, property_type, building, access_code, access_code_confirmed_at, access_code_source, access_note, parking_note, entry_note, business_hours, shared_note, warning_flags, updated_at')
        .eq('account_id', req.account.account_id)
        .order('display_address', { ascending: true });

      if (error) {
        console.error('Manager property intel list failed:', error);
        return res.status(500).json({ error: 'Failed to load access codes' });
      }

      return res.status(200).json({
        property_intel: (rows || []).map(presentPropertyIntelRow)
      });
    } catch (error) {
      console.error('Manager property intel list endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load access codes' });
    }
  });

  router.post('/property-intel', requireManager, async (req, res) => {
    const displayAddress = normalizePropertyIntelText(req.body?.display_address || req.body?.address);

    if (!displayAddress) {
      return res.status(400).json({ error: 'Address is required.' });
    }

    try {
      const key = buildPropertyIntelKey({ address: displayAddress, address_line2: null });

      if (!key.normalized_address) {
        return res.status(400).json({ error: 'Address could not be normalized.' });
      }

      const saved = await savePropertyIntel(
        supabase,
        req.account.account_id,
        { address: displayAddress, address_line2: null, contact_name: req.body?.property_name || null },
        {
          property_name: req.body?.property_name,
          property_type: req.body?.property_type,
          building: req.body?.building,
          access_code: req.body?.access_code,
          access_code_source: req.body?.access_code_source || 'manager',
          access_note: req.body?.access_note,
          parking_note: req.body?.parking_note,
          entry_note: req.body?.entry_note,
          business_hours: req.body?.business_hours,
          shared_note: req.body?.shared_note,
          warning_flags: req.body?.warning_flags
        }
      );

      return res.status(201).json({
        property_intel: presentPropertyIntelRow({
          id: null,
          ...saved
        })
      });
    } catch (error) {
      console.error('Manager property intel create endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save access code' });
    }
  });

  router.patch('/property-intel/:propertyIntelId', requireManager, async (req, res) => {
    const propertyIntelId = req.params.propertyIntelId;

    try {
      const { data: existingRow, error: lookupError } = await supabase
        .from('property_intel')
        .select('id, account_id, access_code_confirmed_at')
        .eq('id', propertyIntelId)
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (lookupError) {
        console.error('Manager property intel lookup failed:', lookupError);
        return res.status(500).json({ error: 'Failed to load access code' });
      }

      if (!existingRow) {
        return res.status(404).json({ error: 'Access code record not found.' });
      }

      const accessCode = normalizePropertyIntelText(req.body?.access_code);
      const payload = {
        property_name: normalizePropertyIntelText(req.body?.property_name) || null,
        property_type: normalizePropertyIntelText(req.body?.property_type) || null,
        building: normalizePropertyIntelText(req.body?.building) || null,
        access_code: accessCode || null,
        access_code_confirmed_at: accessCode ? new Date().toISOString() : null,
        access_code_source: accessCode ? normalizePropertyIntelText(req.body?.access_code_source) || 'manager' : null,
        access_note: normalizePropertyIntelText(req.body?.access_note) || null,
        parking_note: normalizePropertyIntelText(req.body?.parking_note) || null,
        entry_note: normalizePropertyIntelText(req.body?.entry_note) || null,
        business_hours: normalizePropertyIntelText(req.body?.business_hours) || null,
        shared_note: normalizePropertyIntelText(req.body?.shared_note) || null,
        warning_flags: normalizePropertyIntelFlags(req.body?.warning_flags),
        updated_at: new Date().toISOString()
      };

      if (
        accessCode &&
        normalizePropertyIntelText(req.body?.access_code) === normalizePropertyIntelText(req.body?.original_access_code) &&
        existingRow.access_code_confirmed_at
      ) {
        payload.access_code_confirmed_at = existingRow.access_code_confirmed_at;
      }

      const { data: updatedRows, error: updateError } = await supabase
        .from('property_intel')
        .update(payload)
        .eq('id', propertyIntelId)
        .eq('account_id', req.account.account_id)
        .select('id, normalized_address, display_address, property_name, property_type, building, access_code, access_code_confirmed_at, access_code_source, access_note, parking_note, entry_note, business_hours, shared_note, warning_flags, updated_at');

      if (updateError) {
        console.error('Manager property intel update failed:', updateError);
        return res.status(500).json({ error: 'Failed to save access code' });
      }

      return res.status(200).json({
        property_intel: presentPropertyIntelRow((updatedRows || [])[0] || { id: propertyIntelId, ...payload })
      });
    } catch (error) {
      console.error('Manager property intel update endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save access code' });
    }
  });

  router.get('/fedex-accounts', requireManager, async (req, res) => {
    try {
      const fedexAccounts = await listFedexAccountsForAccount(supabase, req.account.account_id);
      const summary = summarizeFedexAccounts(fedexAccounts.accounts);

      return res.status(200).json({
        migration_required: fedexAccounts.migrationRequired,
        default_account_id: summary.default_account_id,
        default_account_label: summary.default_account_label,
        connected_accounts_count: summary.connected_accounts_count,
        accounts: fedexAccounts.accounts
      });
    } catch (error) {
      console.error('FedEx accounts lookup failed:', error);
      return res.status(500).json({ error: 'Failed to load FedEx accounts' });
    }
  });

  router.post('/fedex-accounts', requireManager, async (req, res) => {
    if (hasFedexCredentialInput(req.body)) {
      return res.status(403).json({
        error: 'ReadyRoute does not collect or store FedEx/MyBizAccount usernames or passwords.'
      });
    }

    const input = parseFedexAccountInput(req.body);
    const validationError = validateFedexAccountInput(input);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    try {
      const existingAccounts = await listFedexAccountsForAccount(supabase, req.account.account_id);

      if (existingAccounts.migrationRequired) {
        return res.status(500).json({ error: 'Run the latest FedEx accounts migration in Supabase before adding CSA FedEx accounts.' });
      }

      const shouldBeDefault = Boolean(req.body?.is_default) || existingAccounts.accounts.filter((account) => !account.disconnected_at).length === 0;
      const timestamp = nowProvider().toISOString();
      if (shouldBeDefault) {
        const { error: clearDefaultError } = await supabase
          .from('fedex_accounts')
          .update({
            is_default: false,
            updated_at: timestamp
          })
          .eq('account_id', req.account.account_id)
          .eq('is_default', true)
          .is('disconnected_at', null);

        if (clearDefaultError && !isMissingFedexAccountsTable(clearDefaultError)) {
          throw clearDefaultError;
        }
      }

      const { data: createdAccount, error: insertError } = await supabase
        .from('fedex_accounts')
        .insert({
          account_id: req.account.account_id,
          nickname: input.nickname,
          account_number: input.account_number,
          billing_contact_name: input.billing_contact_name || null,
          billing_company_name: input.billing_company_name || null,
          billing_address_line1: input.billing_address_line1,
          billing_address_line2: input.billing_address_line2 || null,
          billing_city: input.billing_city,
          billing_state_or_province: input.billing_state_or_province,
          billing_postal_code: input.billing_postal_code,
          billing_country_code: input.billing_country_code,
          connection_status: input.connection_status,
          connection_reference: input.connection_reference || null,
          last_verified_at: input.connection_status === 'connected' ? timestamp : null,
          is_default: shouldBeDefault,
          created_by_manager_user_id: req.account.manager_user_id || null,
          updated_at: timestamp
        })
        .select(
          'id, account_id, nickname, account_number, billing_contact_name, billing_company_name, billing_address_line1, billing_address_line2, billing_city, billing_state_or_province, billing_postal_code, billing_country_code, connection_status, connection_reference, last_verified_at, is_default, created_by_manager_user_id, created_at, updated_at, disconnected_at'
        )
        .single();

      if (insertError || !createdAccount) {
        const message = String(insertError?.message || insertError?.details || '');

        if (/fedex_accounts_account_number_uidx/i.test(message) || /duplicate key/i.test(message)) {
          return res.status(409).json({ error: 'That FedEx account number is already linked to this CSA.' });
        }

        throw insertError || new Error('Failed to add FedEx account');
      }

      return res.status(201).json({
        account: toFedexAccountRecord(createdAccount)
      });
    } catch (error) {
      console.error('FedEx account creation failed:', error);
      return res.status(500).json({ error: 'Failed to add FedEx account' });
    }
  });

  router.patch('/fedex-accounts/:fedexAccountId', requireManager, async (req, res) => {
    const fedexAccountId = String(req.params.fedexAccountId || '').trim();

    if (hasFedexCredentialInput(req.body)) {
      return res.status(403).json({
        error: 'ReadyRoute does not collect or store FedEx/MyBizAccount usernames or passwords.'
      });
    }

    const input = parseFedexAccountInput(req.body);
    const validationError = validateFedexAccountInput(input);

    if (!fedexAccountId) {
      return res.status(400).json({ error: 'fedexAccountId is required' });
    }

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    try {
      const existingFedexAccount = await getFedexAccountForManager(supabase, req.account.account_id, fedexAccountId);

      if (existingFedexAccount.migrationRequired) {
        return res.status(500).json({ error: 'Run the latest FedEx accounts migration in Supabase before updating CSA FedEx accounts.' });
      }

      if (!existingFedexAccount.account) {
        return res.status(404).json({ error: 'FedEx account not found' });
      }

      const timestamp = nowProvider().toISOString();
      const { data: updatedAccount, error: updateError } = await supabase
        .from('fedex_accounts')
        .update({
          nickname: input.nickname,
          account_number: input.account_number,
          billing_contact_name: input.billing_contact_name || null,
          billing_company_name: input.billing_company_name || null,
          billing_address_line1: input.billing_address_line1,
          billing_address_line2: input.billing_address_line2 || null,
          billing_city: input.billing_city,
          billing_state_or_province: input.billing_state_or_province,
          billing_postal_code: input.billing_postal_code,
          billing_country_code: input.billing_country_code,
          connection_status: input.connection_status,
          connection_reference: input.connection_reference || null,
          last_verified_at: input.connection_status === 'connected'
            ? (existingFedexAccount.account.last_verified_at || timestamp)
            : null,
          disconnected_at: null,
          updated_at: timestamp
        })
        .eq('account_id', req.account.account_id)
        .eq('id', fedexAccountId)
        .select(
          'id, account_id, nickname, account_number, billing_contact_name, billing_company_name, billing_address_line1, billing_address_line2, billing_city, billing_state_or_province, billing_postal_code, billing_country_code, connection_status, connection_reference, last_verified_at, is_default, created_by_manager_user_id, created_at, updated_at, disconnected_at'
        )
        .single();

      if (updateError || !updatedAccount) {
        const message = String(updateError?.message || updateError?.details || '');

        if (/fedex_accounts_account_number_uidx/i.test(message) || /duplicate key/i.test(message)) {
          return res.status(409).json({ error: 'That FedEx account number is already linked to this CSA.' });
        }

        throw updateError || new Error('Failed to update FedEx account');
      }

      return res.status(200).json({
        account: toFedexAccountRecord(updatedAccount)
      });
    } catch (error) {
      if (/FEDEX_SYNC_CREDENTIALS_KEY/i.test(String(error?.message || ''))) {
        return res.status(500).json({ error: 'FCC credential encryption is not configured on the server yet.' });
      }
      console.error('FedEx account update failed:', error);
      return res.status(500).json({ error: 'Failed to update FedEx account' });
    }
  });

  router.post('/fedex-accounts/:fedexAccountId/default', requireManager, async (req, res) => {
    const fedexAccountId = String(req.params.fedexAccountId || '').trim();

    if (!fedexAccountId) {
      return res.status(400).json({ error: 'fedexAccountId is required' });
    }

    try {
      const existingFedexAccount = await getFedexAccountForManager(supabase, req.account.account_id, fedexAccountId);

      if (existingFedexAccount.migrationRequired) {
        return res.status(500).json({ error: 'Run the latest FedEx accounts migration in Supabase before setting a default account.' });
      }

      if (!existingFedexAccount.account) {
        return res.status(404).json({ error: 'FedEx account not found' });
      }

      if (existingFedexAccount.account.disconnected_at) {
        return res.status(400).json({ error: 'Reconnect this FedEx account before setting it as default.' });
      }

      const timestamp = nowProvider().toISOString();
      const { error: clearDefaultError } = await supabase
        .from('fedex_accounts')
        .update({
          is_default: false,
          updated_at: timestamp
        })
        .eq('account_id', req.account.account_id)
        .eq('is_default', true)
        .is('disconnected_at', null);

      if (clearDefaultError) {
        throw clearDefaultError;
      }

      const { data: updatedAccount, error: setDefaultError } = await supabase
        .from('fedex_accounts')
        .update({
          is_default: true,
          updated_at: timestamp
        })
        .eq('account_id', req.account.account_id)
        .eq('id', fedexAccountId)
        .select(
          'id, account_id, nickname, account_number, billing_contact_name, billing_company_name, billing_address_line1, billing_address_line2, billing_city, billing_state_or_province, billing_postal_code, billing_country_code, connection_status, connection_reference, last_verified_at, is_default, created_by_manager_user_id, created_at, updated_at, disconnected_at'
        )
        .single();

      if (setDefaultError || !updatedAccount) {
        throw setDefaultError || new Error('Failed to set default FedEx account');
      }

      return res.status(200).json({
        account: toFedexAccountRecord(updatedAccount)
      });
    } catch (error) {
      console.error('FedEx account default update failed:', error);
      return res.status(500).json({ error: 'Failed to set default FedEx account' });
    }
  });

  router.post('/fedex-accounts/:fedexAccountId/disconnect', requireManager, async (req, res) => {
    const fedexAccountId = String(req.params.fedexAccountId || '').trim();

    if (!fedexAccountId) {
      return res.status(400).json({ error: 'fedexAccountId is required' });
    }

    try {
      const existingFedexAccount = await getFedexAccountForManager(supabase, req.account.account_id, fedexAccountId);

      if (existingFedexAccount.migrationRequired) {
        return res.status(500).json({ error: 'Run the latest FedEx accounts migration in Supabase before disconnecting CSA FedEx accounts.' });
      }

      if (!existingFedexAccount.account) {
        return res.status(404).json({ error: 'FedEx account not found' });
      }

      const timestamp = nowProvider().toISOString();
      const { data: updatedAccount, error: disconnectError } = await supabase
        .from('fedex_accounts')
        .update({
          connection_status: 'disconnected',
          disconnected_at: timestamp,
          is_default: false,
          updated_at: timestamp
        })
        .eq('account_id', req.account.account_id)
        .eq('id', fedexAccountId)
        .select(
          'id, account_id, nickname, account_number, billing_contact_name, billing_company_name, billing_address_line1, billing_address_line2, billing_city, billing_state_or_province, billing_postal_code, billing_country_code, connection_status, connection_reference, last_verified_at, is_default, created_by_manager_user_id, created_at, updated_at, disconnected_at'
        )
        .single();

      if (disconnectError || !updatedAccount) {
        throw disconnectError || new Error('Failed to disconnect FedEx account');
      }

      const remainingAccounts = await listFedexAccountsForAccount(supabase, req.account.account_id);
      const nextDefaultAccount = remainingAccounts.accounts.find((account) => !account.disconnected_at) || null;

      if (nextDefaultAccount && !remainingAccounts.accounts.some((account) => account.is_default && !account.disconnected_at)) {
        const { error: promoteError } = await supabase
          .from('fedex_accounts')
          .update({
            is_default: true,
            updated_at: timestamp
          })
          .eq('account_id', req.account.account_id)
          .eq('id', nextDefaultAccount.id);

        if (promoteError) {
          throw promoteError;
        }
      }

      return res.status(200).json({
        account: toFedexAccountRecord(updatedAccount)
      });
    } catch (error) {
      console.error('FedEx account disconnect failed:', error);
      return res.status(500).json({ error: 'Failed to disconnect FedEx account' });
    }
  });

  router.post('/manager-users/invite', requireManager, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const fullName = String(req.body?.full_name || '').trim() || null;

    if (!jwtSecret) {
      return res.status(500).json({ error: 'Missing JWT_SECRET environment variable' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    try {
      const account = await getAccountManagerContext(supabase, req.account.account_id);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      if (normalizeEmail(account.manager_email) === email) {
        return res.status(409).json({ error: 'That email is already the primary manager login for this account' });
      }

      const existingManagerUserQuery = await supabase
        .from('manager_users')
        .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at')
        .eq('account_id', req.account.account_id)
        .eq('email', email)
        .maybeSingle();

      if (existingManagerUserQuery.error) {
        if (isMissingManagerUsersTable(existingManagerUserQuery.error)) {
          return res.status(500).json({ error: 'Manager user invites are not available until the latest database migration is run' });
        }

        throw existingManagerUserQuery.error;
      }

      let managerUser = existingManagerUserQuery.data || null;

      if (managerUser && managerUser.account_id !== req.account.account_id) {
        return res.status(409).json({ error: 'That email is already assigned to another ReadyRoute account' });
      }

      const invitedAt = nowProvider().toISOString();
      let sharedManagerIdentity = null;

      try {
        sharedManagerIdentity = await findSharedManagerIdentityByEmail(supabase, email, req.account.account_id);
      } catch (identityError) {
        if (isMissingManagerUsersTable(identityError)) {
          return res.status(500).json({ error: 'Manager user invites are not available until the latest database migration is run' });
        }

        throw identityError;
      }

      if (managerUser && managerUser.password_hash) {
        return res.status(409).json({ error: 'That manager already has active access. Use password reset if they need a new password.' });
      }

      if (managerUser) {
        const alreadyActive = Boolean(managerUser.password_hash);
        const linkedExistingManager = !alreadyActive && Boolean(sharedManagerIdentity?.password_hash);
        const { data: updatedManagerUser, error: updateError } = await supabase
          .from('manager_users')
          .update({
            full_name: fullName || sharedManagerIdentity?.full_name || managerUser.full_name || null,
            password_hash: linkedExistingManager ? sharedManagerIdentity.password_hash : managerUser.password_hash || null,
            is_active: true,
            invited_at: invitedAt,
            accepted_at: linkedExistingManager ? invitedAt : null
          })
          .eq('id', managerUser.id)
          .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at')
          .maybeSingle();

        if (updateError) {
          throw updateError;
        }

        managerUser = updatedManagerUser;
      } else {
        const { data: insertedManagerUser, error: insertError } = await supabase
          .from('manager_users')
          .insert({
            account_id: req.account.account_id,
            email,
            full_name: fullName || sharedManagerIdentity?.full_name || null,
            password_hash: sharedManagerIdentity?.password_hash || null,
            is_active: true,
            invited_at: invitedAt,
            accepted_at: sharedManagerIdentity?.password_hash ? invitedAt : null
          })
          .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at')
          .maybeSingle();

        if (insertError) {
          if (isManagerUsersGlobalEmailConstraintError(insertError)) {
            return res.status(409).json({
              error: 'This manager email already exists in another CSA, but the database is still using the older single-CSA manager constraint. Run the latest database migration, then try again.'
            });
          }

          throw insertError;
        }

        managerUser = insertedManagerUser;
      }

      let emailResult = {
        delivered: false,
        skipped: true,
        reason: 'Email service is not configured'
      };
      let inviteUrl = null;

      if (!managerUser.password_hash) {
        const inviteToken = jwt.sign(
          {
            account_id: req.account.account_id,
            manager_user_id: managerUser.id,
            email: managerUser.email,
            purpose: 'manager_invite'
          },
          jwtSecret,
          { expiresIn: '7d' }
        );

        inviteUrl = buildManagerInviteUrl(inviteToken);

        try {
          emailResult = await sendManagerInviteEmail({
            to: managerUser.email,
            fullName: managerUser.full_name,
            inviteUrl,
            companyName: account.company_name,
            inviterName: req.account.manager_name || req.account.manager_email || 'A ReadyRoute admin'
          });
        } catch (emailError) {
          console.error('Manager invite email delivery failed:', emailError);
          emailResult = {
            delivered: false,
            skipped: false,
            reason: 'Email delivery failed'
          };
        }
      } else {
        emailResult = {
          delivered: false,
          skipped: true,
          reason: 'Existing manager access linked'
        };
      }

      return res.status(200).json({
        message: managerUser.password_hash
          ? `${managerUser.email} already has ReadyRoute access, so they were linked to this CSA immediately.`
          : emailResult.delivered
            ? `Invite email sent to ${managerUser.email}.`
            : emailResult.skipped
              ? 'Invite link ready. Email delivery is not configured yet, so share the link securely.'
              : 'Invite link ready. Email delivery failed, so share the link securely.',
        invite_url: managerUser.password_hash || emailResult.delivered ? null : inviteUrl,
        email_delivery: managerUser.password_hash ? 'linked_existing_manager' : emailResult.delivered ? 'sent' : emailResult.skipped ? 'not_configured' : 'failed',
        manager_user: toManagerAccessRecord(managerUser, account.manager_email)
      });
    } catch (error) {
      console.error('Manager invite creation failed:', error);
      return res.status(500).json({ error: 'Failed to prepare manager invite' });
    }
  });

  router.post('/manager-users/:managerUserId/invite', requireManager, async (req, res) => {
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Missing JWT_SECRET environment variable' });
    }

    try {
      const account = await getAccountManagerContext(supabase, req.account.account_id);

      const managerUserQuery = await supabase
        .from('manager_users')
        .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at')
        .eq('id', req.params.managerUserId)
        .maybeSingle();

      if (managerUserQuery.error) {
        if (isMissingManagerUsersTable(managerUserQuery.error)) {
          return res.status(500).json({ error: 'Manager user invites are not available until the latest database migration is run' });
        }

        throw managerUserQuery.error;
      }

      const managerUser = managerUserQuery.data;

      if (!managerUser || managerUser.account_id !== req.account.account_id) {
        return res.status(404).json({ error: 'Manager invite not found' });
      }

      if (managerUser.password_hash) {
        return res.status(409).json({ error: 'This manager already has active access. Use password reset if they need a new password.' });
      }

      let sharedManagerIdentity = null;

      try {
        sharedManagerIdentity = await findSharedManagerIdentityByEmail(supabase, managerUser.email, req.account.account_id);
      } catch (identityError) {
        if (isMissingManagerUsersTable(identityError)) {
          return res.status(500).json({ error: 'Manager user invites are not available until the latest database migration is run' });
        }

        throw identityError;
      }

      const invitedAt = nowProvider().toISOString();
      const linkedExistingManager = Boolean(sharedManagerIdentity?.password_hash);
      const { data: updatedManagerUser, error: updateError } = await supabase
        .from('manager_users')
        .update({
          full_name: managerUser.full_name || sharedManagerIdentity?.full_name || null,
          password_hash: linkedExistingManager ? sharedManagerIdentity.password_hash : null,
          invited_at: invitedAt,
          accepted_at: linkedExistingManager ? invitedAt : null,
          is_active: true
        })
        .eq('id', managerUser.id)
        .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at')
        .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      if (linkedExistingManager) {
        return res.status(200).json({
          message: `${updatedManagerUser.email} already has ReadyRoute access, so they were linked to this CSA immediately.`,
          invite_url: null,
          email_delivery: 'linked_existing_manager',
          manager_user: toManagerAccessRecord(updatedManagerUser, account?.manager_email || null)
        });
      }

      const inviteToken = jwt.sign(
        {
          account_id: req.account.account_id,
          manager_user_id: updatedManagerUser.id,
          email: updatedManagerUser.email,
          purpose: 'manager_invite'
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      const inviteUrl = buildManagerInviteUrl(inviteToken);
      let emailResult = {
        delivered: false,
        skipped: true,
        reason: 'Email service is not configured'
      };

      try {
        emailResult = await sendManagerInviteEmail({
          to: updatedManagerUser.email,
          fullName: updatedManagerUser.full_name,
          inviteUrl,
          companyName: account?.company_name,
          inviterName: req.account.manager_name || req.account.manager_email || 'A ReadyRoute admin'
        });
      } catch (emailError) {
        console.error('Manager invite refresh email delivery failed:', emailError);
        emailResult = {
          delivered: false,
          skipped: false,
          reason: 'Email delivery failed'
        };
      }

      return res.status(200).json({
        message: emailResult.delivered
          ? `Invite email sent to ${updatedManagerUser.email}.`
          : emailResult.skipped
            ? 'Invite link refreshed. Email delivery is not configured yet, so share the link securely.'
            : 'Invite link refreshed. Email delivery failed, so share the link securely.',
        invite_url: emailResult.delivered ? null : inviteUrl,
        email_delivery: emailResult.delivered ? 'sent' : emailResult.skipped ? 'not_configured' : 'failed',
        manager_user: toManagerAccessRecord(updatedManagerUser, account?.manager_email || null)
      });
    } catch (error) {
      console.error('Manager invite refresh failed:', error);
      return res.status(500).json({ error: 'Failed to refresh manager invite' });
    }
  });

  router.post('/manager-users/:managerUserId/password-reset', requireManager, async (req, res) => {
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Missing JWT_SECRET environment variable' });
    }

    try {
      const account = await getAccountManagerContext(supabase, req.account.account_id);

      const managerUserQuery = await supabase
        .from('manager_users')
        .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at')
        .eq('id', req.params.managerUserId)
        .maybeSingle();

      if (managerUserQuery.error) {
        if (isMissingManagerUsersTable(managerUserQuery.error)) {
          return res.status(500).json({ error: 'Manager password reset is not available until the latest database migration is run' });
        }

        throw managerUserQuery.error;
      }

      const managerUser = managerUserQuery.data;

      if (!managerUser || managerUser.account_id !== req.account.account_id) {
        return res.status(404).json({ error: 'Manager access not found' });
      }

      if (managerUser.is_active === false) {
        return res.status(409).json({ error: 'Reactivate this manager before sending a password reset.' });
      }

      if (!managerUser.password_hash) {
        return res.status(409).json({ error: 'This manager has not accepted their invite yet. Resend the invite instead.' });
      }

      const resetToken = jwt.sign(
        {
          account_id: req.account.account_id,
          manager_user_id: managerUser.id,
          email: managerUser.email,
          purpose: 'manager_password_reset',
          pwdv: getPasswordVersion(managerUser.password_hash)
        },
        jwtSecret,
        { expiresIn: '30m' }
      );

      const resetUrl = buildManagerPasswordResetUrl(resetToken);
      let emailResult = {
        delivered: false,
        skipped: true,
        reason: 'Email service is not configured'
      };

      try {
        emailResult = await sendManagerPasswordResetEmail({
          to: managerUser.email,
          fullName: managerUser.full_name,
          resetUrl,
          companyName: account?.company_name
        });
      } catch (emailError) {
        console.error('Manager password reset email delivery failed:', emailError);
        emailResult = {
          delivered: false,
          skipped: false,
          reason: 'Email delivery failed'
        };
      }

      return res.status(200).json({
        message: emailResult.delivered
          ? `Password reset email sent to ${managerUser.email}.`
          : emailResult.skipped
            ? 'Password reset link ready. Email delivery is not configured yet, so share the link securely.'
            : 'Password reset link ready. Email delivery failed, so share the link securely.',
        reset_url: emailResult.delivered ? null : resetUrl,
        email_delivery: emailResult.delivered ? 'sent' : emailResult.skipped ? 'not_configured' : 'failed',
        manager_user: toManagerAccessRecord(managerUser, account?.manager_email || null)
      });
    } catch (error) {
      console.error('Manager password reset failed:', error);
      return res.status(500).json({ error: 'Failed to send manager password reset' });
    }
  });

  router.get('/vehicles', requireManager, async (req, res) => {
    try {
      let vehiclesQuery = await supabase
        .from('vehicles')
        .select('id, account_id, name, make, model, year, plate, current_mileage, is_test, test_data')
        .eq('account_id', req.account.account_id)
        .order('name');

      if (vehiclesQuery.error && isMissingTestDataColumn(vehiclesQuery.error)) {
        vehiclesQuery = await supabase
          .from('vehicles')
          .select('id, account_id, name, make, model, year, plate, current_mileage')
          .eq('account_id', req.account.account_id)
          .order('name');
      }

      if (vehiclesQuery.error) {
        console.error('Manager vehicles lookup failed:', vehiclesQuery.error);
        return res.status(500).json({ error: 'Failed to load vehicles' });
      }

      return res.status(200).json({
        vehicles: filterProductionRows(vehiclesQuery.data || [], ['name', 'plate', 'make', 'model'])
      });
    } catch (error) {
      console.error('Manager vehicles endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load vehicles' });
    }
  });

  router.post('/drivers', requireManager, async (req, res) => {
    const {
      name,
      email,
      fedex_driver_id: fedexDriverId,
      phone,
      date_of_birth: dateOfBirth,
      hourly_rate: hourlyRate,
      daily_flat_rate: dailyFlatRate,
      pin
    } = req.body || {};
    const parsedHourlyRate = hourlyRate == null || hourlyRate === '' ? 0 : Number(hourlyRate);
    const parsedDailyFlatRate = dailyFlatRate == null || dailyFlatRate === '' ? 0 : Number(dailyFlatRate);

    if (!name || !email || !Number.isFinite(parsedHourlyRate) || !Number.isFinite(parsedDailyFlatRate)) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    try {
      const account = await getAccountManagerContext(supabase, req.account.account_id);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const resolvedPin = String(pin || DEFAULT_DRIVER_STARTER_PIN).trim();

      if (!/^\d{4}$/.test(resolvedPin)) {
        return res.status(400).json({ error: 'PIN must be a 4-digit code' });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const { data: existingDriver, error: existingDriverError } = await supabase
        .from('drivers')
        .select('id')
        .eq('account_id', req.account.account_id)
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existingDriverError) {
        console.error('Manager driver duplicate-email lookup failed:', existingDriverError);
        return res.status(500).json({ error: 'Failed to validate driver email' });
      }

      if (existingDriver) {
        return res.status(409).json({ error: 'A driver with that email already exists' });
      }

      const pinHash = await bcrypt.hash(resolvedPin, 10);

      const driverPayload = {
        account_id: req.account.account_id,
        name: String(name).trim(),
        email: normalizedEmail,
        fedex_driver_id: String(fedexDriverId || '').trim() || null,
        phone: String(phone || '').trim() || null,
        date_of_birth: String(dateOfBirth || '').trim() || null,
        hourly_rate: parsedHourlyRate,
        daily_flat_rate: parsedDailyFlatRate,
        pin: pinHash,
        is_active: true
      };

      let insertQuery = await supabase
        .from('drivers')
        .insert(driverPayload)
        .select('id')
        .single();

      if (insertQuery.error && (isMissingFedexDriverIdColumn(insertQuery.error) || isMissingDriverProfileColumn(insertQuery.error))) {
        const { fedex_driver_id: _fedexDriverId, date_of_birth: _dateOfBirth, daily_flat_rate: _dailyFlatRate, ...fallbackPayload } = driverPayload;
        insertQuery = await supabase
          .from('drivers')
          .insert(fallbackPayload)
          .select('id')
          .single();
      }

      if (insertQuery.error) {
        console.error('Manager driver creation failed:', insertQuery.error);
        return res.status(500).json({ error: 'Failed to create driver' });
      }

      return res.status(201).json({ driver_id: insertQuery.data.id, starter_pin_applied: !pin });
    } catch (error) {
      console.error('Manager create driver endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to create driver' });
    }
  });

  router.post('/drivers/import', requireManager, parseMultipartForm, async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Driver import file is required' });
    }

    try {
      const rows = parseDriverImportRows(req.file);
      const account = await getAccountManagerContext(supabase, req.account.account_id);

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const { data: existingDrivers, error: existingDriversError } = await supabase
        .from('drivers')
        .select('id, email')
        .eq('account_id', req.account.account_id);

      if (existingDriversError) {
        console.error('Driver import duplicate lookup failed:', existingDriversError);
        return res.status(500).json({ error: 'Failed to validate driver import' });
      }

      const existingEmails = new Set((existingDrivers || []).map((driver) => String(driver.email || '').toLowerCase()));
      const seenEmails = new Set();
      const result = {
        total: rows.length,
        created: 0,
        skipped: 0,
        errors: []
      };

      for (const row of rows) {
        const name = String(row.name || '').trim();
        const email = String(row.email || '').trim().toLowerCase();
        const resolvedPin = String(row.pin || DEFAULT_DRIVER_STARTER_PIN).trim();

        if (!name || !email) {
          result.errors.push({ row: row.row_number, error: 'Driver name and email are required.' });
          continue;
        }

        if (existingEmails.has(email) || seenEmails.has(email)) {
          result.skipped += 1;
          continue;
        }

        if (!/^\d{4}$/.test(resolvedPin)) {
          result.errors.push({ row: row.row_number, error: 'PIN must be a 4-digit code.' });
          continue;
        }

        const driverPayload = {
          account_id: req.account.account_id,
          name,
          email,
          fedex_driver_id: String(row.fedex_driver_id || '').trim() || null,
          phone: String(row.phone || '').trim() || null,
          hourly_rate: 0,
          pin: await bcrypt.hash(resolvedPin, 10),
          is_active: true
        };

        let insertQuery = await supabase
          .from('drivers')
          .insert(driverPayload)
          .select('id')
          .single();

        if (insertQuery.error && isMissingFedexDriverIdColumn(insertQuery.error)) {
          const { fedex_driver_id: _fedexDriverId, ...fallbackPayload } = driverPayload;
          insertQuery = await supabase
            .from('drivers')
            .insert(fallbackPayload)
            .select('id')
            .single();
        }

        if (insertQuery.error) {
          console.error('Driver import row failed:', insertQuery.error);
          result.errors.push({ row: row.row_number, error: 'Could not create driver.' });
          continue;
        }

        seenEmails.add(email);
        existingEmails.add(email);
        result.created += 1;
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error('Driver import failed:', error);
      return res.status(400).json({ error: error?.message || 'Could not import drivers.' });
    }
  });

  router.put('/drivers/:driver_id', requireManager, async (req, res) => {
    const driverId = req.params.driver_id;
    const {
      name,
      fedex_driver_id: fedexDriverId,
      phone,
      date_of_birth: dateOfBirth,
      hourly_rate: hourlyRate,
      daily_flat_rate: dailyFlatRate,
      pin
    } = req.body || {};
    const hasHourlyRateUpdate = hourlyRate != null && hourlyRate !== '';
    const parsedHourlyRate = hasHourlyRateUpdate ? Number(hourlyRate) : null;
    const hasDailyFlatRateUpdate = dailyFlatRate != null && dailyFlatRate !== '';
    const parsedDailyFlatRate = hasDailyFlatRateUpdate ? Number(dailyFlatRate) : null;

    if (
      !name ||
      !phone ||
      (hasHourlyRateUpdate && !Number.isFinite(parsedHourlyRate)) ||
      (hasDailyFlatRateUpdate && !Number.isFinite(parsedDailyFlatRate))
    ) {
      return res.status(400).json({ error: 'name and phone are required' });
    }

    if (pin && !/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ error: 'PIN must be a 4-digit code' });
    }

    try {
      const { data: driver, error: driverLookupError } = await supabase
        .from('drivers')
        .select('id')
        .eq('id', driverId)
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (driverLookupError) {
        console.error('Manager driver update lookup failed:', driverLookupError);
        return res.status(500).json({ error: 'Failed to load driver for update' });
      }

      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      const updatePayload = {
        name: String(name).trim(),
        fedex_driver_id: String(fedexDriverId || '').trim() || null,
        phone: String(phone).trim(),
        date_of_birth: String(dateOfBirth || '').trim() || null
      };

      if (hasHourlyRateUpdate) {
        updatePayload.hourly_rate = parsedHourlyRate;
      }

      if (hasDailyFlatRateUpdate) {
        updatePayload.daily_flat_rate = parsedDailyFlatRate;
      }

      if (pin) {
        updatePayload.pin = await bcrypt.hash(String(pin), 10);
      }

      let updateQuery = await supabase
        .from('drivers')
        .update(updatePayload)
        .eq('id', driverId);

      if (updateQuery.error && (isMissingFedexDriverIdColumn(updateQuery.error) || isMissingDriverProfileColumn(updateQuery.error))) {
        const { fedex_driver_id: _fedexDriverId, date_of_birth: _dateOfBirth, daily_flat_rate: _dailyFlatRate, ...fallbackPayload } = updatePayload;
        updateQuery = await supabase
          .from('drivers')
          .update(fallbackPayload)
          .eq('id', driverId);
      }

      if (updateQuery.error) {
        console.error('Manager driver update failed:', updateQuery.error);
        return res.status(500).json({ error: 'Failed to update driver' });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Manager driver update endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update driver' });
    }
  });

  router.post('/drivers/:driver_id/documents', requireManager, parseMultipartForm, async (req, res) => {
    const driverId = req.params.driver_id;
    const documentType = String(req.body?.document_type || '').trim();
    const documentDefinition = getDriverDocumentDefinition(documentType);

    if (!documentDefinition) {
      return res.status(400).json({ error: 'Valid document_type is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Document file is required' });
    }

    try {
      const { data: driver, error: driverLookupError } = await supabase
        .from('drivers')
        .select('id')
        .eq('id', driverId)
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (driverLookupError) {
        console.error('Driver document driver lookup failed:', driverLookupError);
        return res.status(500).json({ error: 'Failed to validate driver document' });
      }

      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      if (!documentDefinition.allowMultiple) {
        const { data: existingDocuments, error: existingDocumentsError } = await supabase
          .from('driver_documents')
          .select('id, storage_bucket, storage_path')
          .eq('account_id', req.account.account_id)
          .eq('driver_id', driverId)
          .eq('document_type', documentType);

        if (existingDocumentsError) {
          console.error('Driver document existing lookup failed:', existingDocumentsError);
          return res.status(500).json({ error: 'Failed to check existing driver documents' });
        }

        for (const existingDocument of existingDocuments || []) {
          await supabase.storage
            .from(existingDocument.storage_bucket || DRIVER_DOCUMENT_BUCKET)
            .remove([existingDocument.storage_path])
            .catch(() => null);
        }

        if ((existingDocuments || []).length) {
          const { error: deleteExistingError } = await supabase
            .from('driver_documents')
            .delete()
            .eq('account_id', req.account.account_id)
            .eq('driver_id', driverId)
            .eq('document_type', documentType);

          if (deleteExistingError) {
            console.error('Driver document replace cleanup failed:', deleteExistingError);
            return res.status(500).json({ error: 'Failed to replace existing driver document' });
          }
        }
      }

      const originalName = req.file.originalname || `${documentType}.bin`;
      const storagePath = [
        req.account.account_id,
        driverId,
        documentType,
        `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${sanitizeStorageSegment(originalName)}`
      ].join('/');

      const { error: uploadError } = await supabase.storage
        .from(DRIVER_DOCUMENT_BUCKET)
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype || 'application/octet-stream',
          upsert: false
        });

      if (uploadError) {
        console.error('Driver document storage upload failed:', uploadError);
        return res.status(500).json({ error: 'Failed to upload driver document. Confirm the driver-documents storage bucket exists.' });
      }

      const expiresOn = String(req.body?.expires_on || '').trim() || null;
      const { data: documentRow, error: insertDocumentError } = await supabase
        .from('driver_documents')
        .insert({
          account_id: req.account.account_id,
          driver_id: driverId,
          document_type: documentType,
          file_name: originalName,
          mime_type: req.file.mimetype || 'application/octet-stream',
          file_size: req.file.buffer.length,
          storage_bucket: DRIVER_DOCUMENT_BUCKET,
          storage_path: storagePath,
          public_url: null,
          expires_on: expiresOn,
          notes: String(req.body?.notes || '').trim() || null,
          uploaded_by_manager_id: req.account.manager_user_id || null
        })
        .select('id, driver_id, document_type, file_name, mime_type, file_size, storage_bucket, storage_path, public_url, expires_on, notes, uploaded_by_manager_id, created_at, updated_at')
        .single();

      if (insertDocumentError) {
        console.error('Driver document insert failed:', insertDocumentError);
        await supabase.storage.from(DRIVER_DOCUMENT_BUCKET).remove([storagePath]).catch(() => null);
        return res.status(500).json({ error: 'Failed to save driver document metadata' });
      }

      return res.status(201).json({
        document: await addDriverDocumentAccessUrl(supabase, documentRow)
      });
    } catch (error) {
      console.error('Driver document upload endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to upload driver document' });
    }
  });

  router.delete('/drivers/:driver_id/documents/:document_id', requireManager, async (req, res) => {
    const driverId = req.params.driver_id;
    const documentId = req.params.document_id;

    try {
      const { data: documentRow, error: documentLookupError } = await supabase
        .from('driver_documents')
        .select('id, storage_bucket, storage_path')
        .eq('id', documentId)
        .eq('driver_id', driverId)
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (documentLookupError) {
        console.error('Driver document delete lookup failed:', documentLookupError);
        return res.status(500).json({ error: 'Failed to load driver document' });
      }

      if (!documentRow) {
        return res.status(404).json({ error: 'Driver document not found' });
      }

      await supabase.storage
        .from(documentRow.storage_bucket || DRIVER_DOCUMENT_BUCKET)
        .remove([documentRow.storage_path])
        .catch(() => null);

      const { error: deleteError } = await supabase
        .from('driver_documents')
        .delete()
        .eq('id', documentId)
        .eq('account_id', req.account.account_id);

      if (deleteError) {
        console.error('Driver document delete failed:', deleteError);
        return res.status(500).json({ error: 'Failed to remove driver document' });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Driver document delete endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to remove driver document' });
    }
  });

  router.patch('/drivers/:driver_id/status', requireManager, async (req, res) => {
    const driverId = req.params.driver_id;
    const { is_active: isActive } = req.body || {};

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'is_active boolean is required' });
    }

    try {
      const { data: driver, error: driverLookupError } = await supabase
        .from('drivers')
        .select('id')
        .eq('id', driverId)
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (driverLookupError) {
        console.error('Manager driver status lookup failed:', driverLookupError);
        return res.status(500).json({ error: 'Failed to load driver for status update' });
      }

      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      const { error: updateError } = await supabase
        .from('drivers')
        .update({ is_active: isActive })
        .eq('id', driverId);

      if (updateError) {
        console.error('Manager driver status update failed:', updateError);
        return res.status(500).json({ error: 'Failed to update driver status' });
      }

      return res.status(200).json({ ok: true, is_active: isActive });
    } catch (error) {
      console.error('Manager driver status endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update driver status' });
    }
  });

  router.get('/drivers/:driver_id/stats', requireManager, async (req, res) => {
    const driverId = req.params.driver_id;
    const now = nowProvider();
    const sevenDaysAgo = getDateDaysAgo(now, 7).toISOString();
    const monthStart = startOfMonth(now).toISOString();

    try {
      const { data: driver, error: driverLookupError } = await supabase
        .from('drivers')
        .select('id')
        .eq('id', driverId)
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (driverLookupError) {
        console.error('Manager driver stats lookup failed:', driverLookupError);
        return res.status(500).json({ error: 'Failed to load driver stats' });
      }

      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      const { data: recentRoutes, error: recentRoutesError } = await supabase
        .from('routes')
        .select('id, completed_stops')
        .eq('account_id', req.account.account_id)
        .eq('driver_id', driverId);

      if (recentRoutesError) {
        console.error('Manager driver stats route lookup failed:', recentRoutesError);
        return res.status(500).json({ error: 'Failed to load driver stats' });
      }

      const routeIds = (recentRoutes || []).map((route) => route.id);
      let statsStops = [];

      if (routeIds.length > 0) {
        const { data: stopRows, error: stopRowsError } = await supabase
          .from('stops')
          .select('id, route_id, completed_at, exception_code, status')
          .in('route_id', routeIds);

        if (stopRowsError) {
          console.error('Manager driver stats stop lookup failed:', stopRowsError);
          return res.status(500).json({ error: 'Failed to load driver stats' });
        }

        statsStops = stopRows || [];
      }

      const recentRouteSphValues = (recentRoutes || [])
        .map((route) => {
          const routeStops = statsStops.filter((stop) => stop.route_id === route.id && stop.completed_at);
          const firstScan = routeStops.reduce((earliest, stop) => {
            if (!stop.completed_at) {
              return earliest;
            }

            if (!earliest || new Date(stop.completed_at).getTime() < new Date(earliest).getTime()) {
              return stop.completed_at;
            }

            return earliest;
          }, null);

          if (!firstScan) {
            return null;
          }

          return getStopsPerHour({
            completedStops: Number(route.completed_stops || 0),
            firstScan,
            currentTime: now
          });
        })
        .filter((value) => value !== null && value !== undefined);

      const last7DaysAverage = recentRouteSphValues.length
        ? roundToSingleDecimal(
            recentRouteSphValues.reduce((sum, value) => sum + Number(value || 0), 0) / recentRouteSphValues.length
          )
        : null;

      const monthDeliveries = statsStops.filter((stop) => stop.completed_at && new Date(stop.completed_at) >= new Date(monthStart)).length;
      const exceptionBreakdown = statsStops.reduce((map, stop) => {
        if (stop.exception_code) {
          map[stop.exception_code] = (map[stop.exception_code] || 0) + 1;
        }
        return map;
      }, {});

      return res.status(200).json({
        stats: {
          last_7_days_stops_per_hour: last7DaysAverage,
          total_deliveries_this_month: monthDeliveries,
          exception_code_breakdown: exceptionBreakdown
        }
      });
    } catch (error) {
      console.error('Manager driver stats endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load driver stats' });
    }
  });

  router.get('/timecards/weekly', requireManager, async (req, res) => {
    const requestedDate = parseDateParam(req.query?.date, nowProvider);

    if (!requestedDate) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    const { weekStart, weekEndInclusive, weekEndExclusive } = getWeekRangeFromDate(requestedDate);

    try {
      const { data: drivers, error: driversError } = await supabase
        .from('drivers')
        .select('id, name, email, hourly_rate, is_active')
        .eq('account_id', req.account.account_id)
        .order('name');

      if (driversError) {
        console.error('Weekly timecards driver lookup failed:', driversError);
        return res.status(500).json({ error: 'Failed to load weekly timecards' });
      }

      const driverIds = (drivers || []).map((driver) => driver.id);

      if (!driverIds.length) {
        return res.status(200).json({
          week_start: weekStart.toISOString().slice(0, 10),
          week_end: weekEndInclusive.toISOString().slice(0, 10),
          totals: {
            drivers: 0,
            shifts: 0,
            worked_hours: 0,
            payable_hours: 0,
            break_minutes: 0,
            lunch_minutes: 0
          },
          drivers: []
        });
      }

      const { data: timecards, error: timecardsError } = await supabase
        .from('timecards')
        .select('id, driver_id, route_id, clock_in, clock_out, hours_worked')
        .in('driver_id', driverIds)
        .gte('clock_in', weekStart.toISOString())
        .lt('clock_in', weekEndExclusive.toISOString())
        .order('clock_in', { ascending: false });

      if (timecardsError) {
        console.error('Weekly timecards lookup failed:', timecardsError);
        return res.status(500).json({ error: 'Failed to load weekly timecards' });
      }

      const timecardIds = (timecards || []).map((timecard) => timecard.id);
      const routeIds = [...new Set((timecards || []).map((timecard) => timecard.route_id).filter(Boolean))];
      let breaks = [];
      let routes = [];

      if (timecardIds.length) {
        const { data: breakRows, error: breaksError } = await supabase
          .from('timecard_breaks')
          .select('id, timecard_id, break_type, started_at, ended_at')
          .in('timecard_id', timecardIds)
          .order('started_at', { ascending: false });

        if (breaksError) {
          console.error('Weekly timecard breaks lookup failed:', breaksError);
          return res.status(500).json({ error: 'Failed to load weekly timecards' });
        }

        breaks = breakRows || [];
      }

      if (routeIds.length) {
        const { data: routeRows, error: routesError } = await supabase
          .from('routes')
          .select('id, work_area_name')
          .eq('account_id', req.account.account_id)
          .in('id', routeIds);

        if (routesError) {
          console.error('Weekly timecard route lookup failed:', routesError);
          return res.status(500).json({ error: 'Failed to load weekly timecards' });
        }

        routes = routeRows || [];
      }

      const breaksByTimecardId = (breaks || []).reduce((map, breakRow) => {
        const current = map.get(breakRow.timecard_id) || [];
        current.push(breakRow);
        map.set(breakRow.timecard_id, current);
        return map;
      }, new Map());
      const routeById = new Map((routes || []).map((route) => [route.id, route]));

      const currentTime = nowProvider();
      const summaryRows = (drivers || []).map((driver) => {
        const driverTimecards = (timecards || []).filter((timecard) => timecard.driver_id === driver.id);
        const shiftCount = driverTimecards.length;
        const detailedTimecards = driverTimecards.map((timecard) =>
          buildTimecardDetail(timecard, breaksByTimecardId.get(timecard.id) || [], routeById, currentTime)
        );

        const rollup = detailedTimecards.reduce(
          (summary, timecard) => {
            summary.worked_hours += timecard.worked_hours;
            summary.break_minutes += timecard.break_minutes;
            summary.lunch_minutes += timecard.lunch_minutes;
            summary.payable_hours += timecard.payable_hours;
            return summary;
          },
          { worked_hours: 0, payable_hours: 0, break_minutes: 0, lunch_minutes: 0 }
        );

        return {
          driver_id: driver.id,
          driver_name: driver.name,
          email: driver.email,
          hourly_rate: Number(driver.hourly_rate || 0),
          is_active: Boolean(driver.is_active),
          shift_count: shiftCount,
          worked_hours: Number(rollup.worked_hours.toFixed(2)),
          payable_hours: Number(rollup.payable_hours.toFixed(2)),
          break_minutes: rollup.break_minutes,
          lunch_minutes: rollup.lunch_minutes,
          estimated_pay: Number((rollup.payable_hours * Number(driver.hourly_rate || 0)).toFixed(2)),
          compliance_flags: [...new Set(detailedTimecards.flatMap((timecard) => timecard.compliance_flags || []))],
          timecards: detailedTimecards
        };
      });

      const totals = summaryRows.reduce(
        (summary, row) => {
          summary.drivers += 1;
          summary.shifts += row.shift_count;
          summary.worked_hours += row.worked_hours;
          summary.payable_hours += row.payable_hours;
          summary.break_minutes += row.break_minutes;
          summary.lunch_minutes += row.lunch_minutes;
          return summary;
        },
        { drivers: 0, shifts: 0, worked_hours: 0, payable_hours: 0, break_minutes: 0, lunch_minutes: 0 }
      );

      return res.status(200).json({
        week_start: weekStart.toISOString().slice(0, 10),
        week_end: weekEndInclusive.toISOString().slice(0, 10),
        totals: {
          ...totals,
          worked_hours: Number(totals.worked_hours.toFixed(2)),
          payable_hours: Number(totals.payable_hours.toFixed(2))
        },
        drivers: summaryRows
      });
    } catch (error) {
      console.error('Manager weekly timecards endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load weekly timecards' });
    }
  });

  router.get('/timecards/live', requireManager, async (req, res) => {
    const requestedDate = parseDateParam(req.query?.date, nowProvider);

    if (!requestedDate) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    try {
      const { data: drivers, error: driversError } = await supabase
        .from('drivers')
        .select('id, name, email, phone, hourly_rate, is_active')
        .eq('account_id', req.account.account_id)
        .order('name');

      if (driversError) {
        console.error('Live timecards driver lookup failed:', driversError);
        return res.status(500).json({ error: 'Failed to load live labor status' });
      }

      const driverIds = (drivers || []).map((driver) => driver.id);

      if (!driverIds.length) {
        return res.status(200).json({
          date: requestedDate,
          totals: {
            drivers: 0,
            working: 0,
            on_break: 0,
            on_lunch: 0,
            clocked_out: 0,
            not_clocked_in: 0,
            worked_hours: 0,
            break_minutes: 0,
            lunch_minutes: 0
          },
          drivers: []
        });
      }

      const startIso = `${requestedDate}T00:00:00.000Z`;
      const nextDayExclusive = new Date(`${requestedDate}T00:00:00.000Z`);
      nextDayExclusive.setUTCDate(nextDayExclusive.getUTCDate() + 1);
      const endExclusiveIso = nextDayExclusive.toISOString();
      const { data: timecards, error: timecardsError } = await supabase
        .from('timecards')
        .select('id, driver_id, route_id, clock_in, clock_out, hours_worked, manager_adjusted')
        .in('driver_id', driverIds)
        .gte('clock_in', startIso)
        .lt('clock_in', endExclusiveIso)
        .order('clock_in', { ascending: false });

      if (timecardsError) {
        console.error('Live timecards lookup failed:', timecardsError);
        return res.status(500).json({ error: 'Failed to load live labor status' });
      }

      const timecardIds = (timecards || []).map((timecard) => timecard.id);
      const routeIds = [...new Set((timecards || []).map((timecard) => timecard.route_id).filter(Boolean))];
      const { data: breakRows, error: breaksError } = timecardIds.length
        ? await supabase
            .from('timecard_breaks')
            .select('id, timecard_id, break_type, started_at, ended_at')
            .in('timecard_id', timecardIds)
            .order('started_at', { ascending: false })
        : { data: [], error: null };

      if (breaksError) {
        console.error('Live timecard breaks lookup failed:', breaksError);
        return res.status(500).json({ error: 'Failed to load live labor status' });
      }

      const { data: routeRows, error: routeRowsError } = routeIds.length
        ? await supabase
            .from('routes')
            .select('id, work_area_name')
            .eq('account_id', req.account.account_id)
            .in('id', routeIds)
        : { data: [], error: null };

      if (routeRowsError) {
        console.error('Live timecard route lookup failed:', routeRowsError);
        return res.status(500).json({ error: 'Failed to load live labor status' });
      }

      const { data: adjustmentRows, error: adjustmentRowsError } = driverIds.length
        ? await supabase
            .from('labor_adjustments')
            .select('id, manager_user_id, driver_id, route_id, timecard_id, work_date, adjustment_reason, before_state, after_state, created_at')
            .eq('account_id', req.account.account_id)
            .eq('work_date', requestedDate)
            .in('driver_id', driverIds)
            .order('created_at', { ascending: false })
        : { data: [], error: null };

      if (adjustmentRowsError) {
        console.error('Live labor adjustments lookup failed:', adjustmentRowsError);
        return res.status(500).json({ error: 'Failed to load live labor status' });
      }

      const breaksByTimecardId = (breakRows || []).reduce((map, breakRow) => {
        const current = map.get(breakRow.timecard_id) || [];
        current.push(breakRow);
        map.set(breakRow.timecard_id, current);
        return map;
      }, new Map());
      const adjustmentsByDriverId = (adjustmentRows || []).reduce((map, adjustment) => {
        const current = map.get(adjustment.driver_id) || [];
        current.push(buildLaborAdjustmentSummary(adjustment));
        map.set(adjustment.driver_id, current);
        return map;
      }, new Map());
      const routeById = new Map((routeRows || []).map((route) => [route.id, route]));
      const currentTime = nowProvider();

      const rows = (drivers || []).map((driver) => {
        const driverTimecards = (timecards || []).filter((timecard) => timecard.driver_id === driver.id);
        const detailedTimecards = driverTimecards.map((timecard) =>
          buildTimecardDetail(timecard, breaksByTimecardId.get(timecard.id) || [], routeById, currentTime)
        );
        const latestTimecard = detailedTimecards[0] || null;
        const status = getLiveDriverStatus(latestTimecard);
        const activeBreak = latestTimecard?.breaks?.find((breakRow) => breakRow.is_active) || null;
        const totals = detailedTimecards.reduce(
          (summary, timecard) => {
            summary.worked_hours += Number(timecard.worked_hours || 0);
            summary.break_minutes += Number(timecard.break_minutes || 0);
            summary.lunch_minutes += Number(timecard.lunch_minutes || 0);
            summary.payable_hours += Number(timecard.payable_hours || 0);
            return summary;
          },
          { worked_hours: 0, payable_hours: 0, break_minutes: 0, lunch_minutes: 0 }
        );

        return {
          driver_id: driver.id,
          driver_name: driver.name,
          email: driver.email,
          phone: driver.phone || null,
          hourly_rate: Number(driver.hourly_rate || 0),
          is_active: Boolean(driver.is_active),
          shift_count: detailedTimecards.length,
          worked_hours: Number(totals.worked_hours.toFixed(2)),
          payable_hours: Number(totals.payable_hours.toFixed(2)),
          break_minutes: Math.round(totals.break_minutes),
          lunch_minutes: Math.round(totals.lunch_minutes),
          status,
          active_break: activeBreak,
          latest_timecard: latestTimecard
            ? {
                id: latestTimecard.id,
                route_id: latestTimecard.route_id,
                route_name: latestTimecard.route_name,
                clock_in: latestTimecard.clock_in,
                clock_out: latestTimecard.clock_out,
                manager_adjusted: Boolean(
                  driverTimecards.find((timecard) => timecard.id === latestTimecard.id)?.manager_adjusted
                ),
                compliance_flags: latestTimecard.compliance_flags || []
              }
            : null,
          adjustments: adjustmentsByDriverId.get(driver.id) || [],
          timecards: detailedTimecards
        };
      });

      const totals = rows.reduce(
        (summary, row) => {
          summary.drivers += 1;
          summary[row.status.code] += 1;
          summary.worked_hours += row.worked_hours;
          summary.break_minutes += row.break_minutes;
          summary.lunch_minutes += row.lunch_minutes;
          return summary;
        },
        {
          drivers: 0,
          working: 0,
          on_break: 0,
          on_lunch: 0,
          clocked_out: 0,
          not_clocked_in: 0,
          worked_hours: 0,
          break_minutes: 0,
          lunch_minutes: 0
        }
      );

      return res.status(200).json({
        date: requestedDate,
        totals: {
          ...totals,
          worked_hours: Number(totals.worked_hours.toFixed(2))
        },
        drivers: rows
      });
    } catch (error) {
      console.error('Manager live timecards endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load live labor status' });
    }
  });

  router.put('/timecards/live', requireManager, async (req, res) => {
    const requestedDate = parseDateParam(req.body?.date, nowProvider);
    const driverId = String(req.body?.driver_id || '').trim();
    const adjustmentReason = String(req.body?.adjustment_reason || '').trim();
    const breakMinutes = normalizeLaborMinutes(req.body?.break_minutes);
    const lunchMinutes = normalizeLaborMinutes(req.body?.lunch_minutes);
    const clockIn = req.body?.clock_in ? new Date(req.body.clock_in).toISOString() : null;
    const clockOut = req.body?.clock_out ? new Date(req.body.clock_out).toISOString() : null;
    const lunchStart = normalizeOptionalIso(req.body?.lunch_start);
    const lunchEnd = normalizeOptionalIso(req.body?.lunch_end);
    const restBreakStart = normalizeOptionalIso(req.body?.rest_break_start);
    const restBreakEnd = normalizeOptionalIso(req.body?.rest_break_end);

    if (!requestedDate) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    if (!driverId) {
      return res.status(400).json({ error: 'driver_id is required' });
    }

    if (!adjustmentReason) {
      return res.status(400).json({ error: 'adjustment_reason is required' });
    }

    if (!clockIn) {
      return res.status(400).json({ error: 'clock_in is required' });
    }

    if (Number.isNaN(new Date(clockIn).getTime())) {
      return res.status(400).json({ error: 'clock_in must be a valid datetime' });
    }

    if (clockOut && Number.isNaN(new Date(clockOut).getTime())) {
      return res.status(400).json({ error: 'clock_out must be a valid datetime' });
    }

    if (clockOut && new Date(clockOut).getTime() <= new Date(clockIn).getTime()) {
      return res.status(400).json({ error: 'clock_out must be later than clock_in' });
    }

    const lunchPairError = validateBreakPair({ start: lunchStart, end: lunchEnd, label: 'lunch' });
    if (lunchPairError) {
      return res.status(400).json({ error: lunchPairError });
    }

    const restBreakPairError = validateBreakPair({ start: restBreakStart, end: restBreakEnd, label: 'rest break' });
    if (restBreakPairError) {
      return res.status(400).json({ error: restBreakPairError });
    }

    try {
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id, name')
        .eq('account_id', req.account.account_id)
        .eq('id', driverId)
        .maybeSingle();

      if (driverError) {
        console.error('Live labor edit driver lookup failed:', driverError);
        return res.status(500).json({ error: 'Failed to update labor record' });
      }

      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      const { data: matchingRoutes, error: routesError } = await supabase
        .from('routes')
        .select('id, work_area_name')
        .eq('account_id', req.account.account_id)
        .eq('driver_id', driverId)
        .eq('date', requestedDate)
        .order('created_at', { ascending: true });

      if (routesError) {
        console.error('Live labor edit route lookup failed:', routesError);
        return res.status(500).json({ error: 'Failed to update labor record' });
      }

      const dateStart = `${requestedDate}T00:00:00.000Z`;
      const dateEndExclusive = new Date(`${requestedDate}T00:00:00.000Z`);
      dateEndExclusive.setUTCDate(dateEndExclusive.getUTCDate() + 1);
      const dateEndExclusiveIso = dateEndExclusive.toISOString();
      const { data: existingTimecards, error: timecardsError } = await supabase
        .from('timecards')
        .select('id, driver_id, route_id, clock_in, clock_out, hours_worked, manager_adjusted')
        .eq('driver_id', driverId)
        .gte('clock_in', dateStart)
        .lt('clock_in', dateEndExclusiveIso)
        .order('clock_in', { ascending: false });

      if (timecardsError) {
        console.error('Live labor edit timecard lookup failed:', timecardsError);
        return res.status(500).json({ error: 'Failed to update labor record' });
      }

      if ((existingTimecards || []).length > 1) {
        return res.status(409).json({
          error: 'This driver has multiple shifts on that date. Multi-shift editing is not supported yet.'
        });
      }

      const editableTimecard = existingTimecards?.[0] || null;
      const routeId = editableTimecard?.route_id || matchingRoutes?.[0]?.id || null;

      const { data: existingBreakRows, error: existingBreakRowsError } = editableTimecard?.id
        ? await supabase
            .from('timecard_breaks')
            .select('id, break_type, started_at, ended_at')
            .eq('timecard_id', editableTimecard.id)
            .order('started_at', { ascending: false })
        : { data: [], error: null };

      if (existingBreakRowsError) {
        console.error('Live labor edit existing break lookup failed:', existingBreakRowsError);
        return res.status(500).json({ error: 'Failed to update labor record' });
      }

      if (!routeId) {
        return res.status(400).json({
          error: 'No route assignment was found for this driver on that date, so ReadyRoute cannot create the labor record yet.'
        });
      }

      const workedHours = clockOut ? getWorkedHours(clockIn, clockOut, null, nowProvider()) : null;
      let timecardId = editableTimecard?.id || null;
      const beforeState = {
        timecard: editableTimecard,
        breaks: existingBreakRows || []
      };

      if (timecardId) {
        const { error: updateTimecardError } = await supabase
          .from('timecards')
          .update({
            route_id: routeId,
            clock_in: clockIn,
            clock_out: clockOut,
            hours_worked: workedHours,
            manager_adjusted: true
          })
          .eq('id', timecardId);

        if (updateTimecardError) {
          console.error('Live labor edit timecard update failed:', updateTimecardError);
          return res.status(500).json({ error: 'Failed to update labor record' });
        }
      } else {
        const { data: insertedTimecard, error: insertTimecardError } = await supabase
          .from('timecards')
          .insert({
            driver_id: driverId,
            route_id: routeId,
            clock_in: clockIn,
            clock_out: clockOut,
            hours_worked: workedHours,
            manager_adjusted: true
          })
          .select('id')
          .maybeSingle();

        if (insertTimecardError) {
          console.error('Live labor edit timecard insert failed:', insertTimecardError);
          return res.status(500).json({ error: 'Failed to update labor record' });
        }

        timecardId = insertedTimecard?.id || null;
      }

      const { error: deleteBreaksError } = await supabase
        .from('timecard_breaks')
        .delete()
        .eq('timecard_id', timecardId);

      if (deleteBreaksError) {
        console.error('Live labor edit break reset failed:', deleteBreaksError);
        return res.status(500).json({ error: 'Failed to update labor record' });
      }

      const explicitBreakRows = buildExplicitBreakRows({
        accountId: req.account.account_id,
        driverId,
        routeId,
        timecardId,
        lunchStart,
        lunchEnd,
        restBreakStart,
        restBreakEnd
      });
      const syntheticBreakRows = explicitBreakRows.length
        ? explicitBreakRows
        : buildSyntheticBreakRows({
            accountId: req.account.account_id,
            driverId,
            routeId,
            timecardId,
            clockIn,
            clockOut,
            breakMinutes,
            lunchMinutes
          });

      if (syntheticBreakRows.length) {
        const { error: insertBreaksError } = await supabase
          .from('timecard_breaks')
          .insert(syntheticBreakRows);

        if (insertBreaksError) {
          console.error('Live labor edit break insert failed:', insertBreaksError);
          return res.status(500).json({ error: 'Failed to update labor record' });
        }
      }

      const afterState = {
        timecard: {
          id: timecardId,
          driver_id: driverId,
          route_id: routeId,
          clock_in: clockIn,
          clock_out: clockOut,
          hours_worked: workedHours,
          manager_adjusted: true
        },
        breaks: syntheticBreakRows
      };

      const { error: insertAdjustmentError } = await supabase
        .from('labor_adjustments')
        .insert({
          account_id: req.account.account_id,
          manager_user_id: req.account.manager_user_id,
          driver_id: driverId,
          route_id: routeId,
          timecard_id: timecardId,
          work_date: requestedDate,
          adjustment_reason: adjustmentReason,
          before_state: beforeState,
          after_state: afterState
        });

      if (insertAdjustmentError) {
        console.error('Live labor edit audit insert failed:', insertAdjustmentError);
        return res.status(500).json({ error: 'Failed to save labor audit trail' });
      }

      const snapshotResult = await syncDailyLaborSnapshotForDate({
        supabase,
        accountId: req.account.account_id,
        workDate: requestedDate,
        now: nowProvider()
      });

      if (snapshotResult.error) {
        console.error('Live labor edit snapshot sync failed:', snapshotResult.error);
        return res.status(500).json({ error: 'Failed to update labor snapshot' });
      }

      return res.status(200).json({
        ok: true,
        timecard_id: timecardId,
        date: requestedDate,
        driver_id: driverId,
        route_id: routeId,
        adjustment_reason: adjustmentReason,
        snapshot_updated: Boolean(snapshotResult.finalized),
        message: `Labor updated for ${driver.name} on ${requestedDate}.`
      });
    } catch (error) {
      console.error('Manager live labor edit endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update labor record' });
    }
  });

  router.get('/timecards/daily', requireManager, async (req, res) => {
    const requestedDate = parseDateParam(req.query?.date, nowProvider);

    if (!requestedDate) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    try {
      const { data: snapshot, error: snapshotError } = await supabase
        .from('daily_labor_snapshots')
        .select('id, work_date, finalized_at, finalized_by_system, driver_count, shift_count, total_worked_hours, total_payable_hours, total_break_minutes, total_lunch_minutes, estimated_payroll')
        .eq('account_id', req.account.account_id)
        .eq('work_date', requestedDate)
        .maybeSingle();

      if (snapshotError) {
        console.error('Daily labor snapshot lookup failed:', snapshotError);
        return res.status(500).json({ error: 'Failed to load daily labor snapshot' });
      }

      if (!snapshot?.id) {
        return res.status(200).json({ snapshot: null, drivers: [] });
      }

      const { data: driverRows, error: driverRowsError } = await supabase
        .from('daily_driver_labor')
        .select('id, driver_id, work_date, hourly_rate, shift_count, worked_hours, payable_hours, break_minutes, lunch_minutes, estimated_pay')
        .eq('batch_id', snapshot.id);

      if (driverRowsError) {
        console.error('Daily labor driver rows lookup failed:', driverRowsError);
        return res.status(500).json({ error: 'Failed to load daily labor snapshot' });
      }

      const driverIds = (driverRows || []).map((row) => row.driver_id);
      const { data: timecards, error: timecardsError } = driverIds.length
        ? await supabase
            .from('timecards')
            .select('id, driver_id, route_id, clock_in, clock_out, hours_worked')
            .in('driver_id', driverIds)
            .gte('clock_in', `${requestedDate}T00:00:00.000Z`)
            .lt('clock_in', `${requestedDate}T23:59:59.999Z`)
            .order('clock_in', { ascending: false })
        : { data: [], error: null };

      if (timecardsError) {
        console.error('Daily labor timecards lookup failed:', timecardsError);
        return res.status(500).json({ error: 'Failed to load daily labor snapshot' });
      }

      const timecardIds = (timecards || []).map((timecard) => timecard.id);
      const routeIds = [...new Set((timecards || []).map((timecard) => timecard.route_id).filter(Boolean))];
      const { data: breakRows, error: breaksError } = timecardIds.length
        ? await supabase
            .from('timecard_breaks')
            .select('id, timecard_id, break_type, started_at, ended_at')
            .in('timecard_id', timecardIds)
            .order('started_at', { ascending: false })
        : { data: [], error: null };

      if (breaksError) {
        console.error('Daily labor break lookup failed:', breaksError);
        return res.status(500).json({ error: 'Failed to load daily labor snapshot' });
      }

      const { data: adjustmentRows, error: adjustmentRowsError } = driverIds.length
        ? await supabase
            .from('labor_adjustments')
            .select('id, manager_user_id, driver_id, route_id, timecard_id, work_date, adjustment_reason, before_state, after_state, created_at')
            .eq('account_id', req.account.account_id)
            .eq('work_date', requestedDate)
            .in('driver_id', driverIds)
            .order('created_at', { ascending: false })
        : { data: [], error: null };

      if (adjustmentRowsError) {
        console.error('Daily labor adjustments lookup failed:', adjustmentRowsError);
        return res.status(500).json({ error: 'Failed to load daily labor snapshot' });
      }

      const { data: routeRows, error: routeRowsError } = routeIds.length
        ? await supabase
            .from('routes')
            .select('id, work_area_name')
            .eq('account_id', req.account.account_id)
            .in('id', routeIds)
        : { data: [], error: null };

      if (routeRowsError) {
        console.error('Daily labor route lookup failed:', routeRowsError);
        return res.status(500).json({ error: 'Failed to load daily labor snapshot' });
      }

      const { data: drivers, error: driversError } = driverIds.length
        ? await supabase
            .from('drivers')
            .select('id, name, email')
            .eq('account_id', req.account.account_id)
            .in('id', driverIds)
        : { data: [], error: null };

      if (driversError) {
        console.error('Daily labor driver lookup failed:', driversError);
        return res.status(500).json({ error: 'Failed to load daily labor snapshot' });
      }

      const driverById = new Map((drivers || []).map((driver) => [driver.id, driver]));
      const breaksByTimecardId = (breakRows || []).reduce((map, breakRow) => {
        const current = map.get(breakRow.timecard_id) || [];
        current.push(breakRow);
        map.set(breakRow.timecard_id, current);
        return map;
      }, new Map());
      const adjustmentsByDriverId = (adjustmentRows || []).reduce((map, adjustment) => {
        const current = map.get(adjustment.driver_id) || [];
        current.push(buildLaborAdjustmentSummary(adjustment));
        map.set(adjustment.driver_id, current);
        return map;
      }, new Map());
      const routeById = new Map((routeRows || []).map((route) => [route.id, route]));
      const currentTime = nowProvider();
      const rows = (driverRows || []).map((row) => ({
        ...row,
        driver_name: driverById.get(row.driver_id)?.name || 'Driver',
        email: driverById.get(row.driver_id)?.email || null,
        adjustments: adjustmentsByDriverId.get(row.driver_id) || [],
        timecards: (timecards || [])
          .filter((timecard) => timecard.driver_id === row.driver_id)
          .map((timecard) => buildTimecardDetail(timecard, breaksByTimecardId.get(timecard.id) || [], routeById, currentTime)),
        compliance_flags: [...new Set(
          (timecards || [])
            .filter((timecard) => timecard.driver_id === row.driver_id)
            .flatMap((timecard) =>
              buildTimecardDetail(timecard, breaksByTimecardId.get(timecard.id) || [], routeById, currentTime).compliance_flags || []
            )
        )]
      }));

      return res.status(200).json({
        snapshot,
        drivers: rows
      });
    } catch (error) {
      console.error('Manager daily labor endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load daily labor snapshot' });
    }
  });

  router.get('/records', requireManager, async (req, res) => {
    const requestedDate = parseDateParam(req.query?.date, nowProvider);

    if (!requestedDate) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    try {
      const currentTime = nowProvider();
      const rangeEnd = getCurrentDateString(currentTime);
      const rangeStart = getCurrentDateString(getDateDaysAgo(currentTime, 29));

      let recentRoutesQuery = await supabase
        .from('routes')
        .select('id, date, archived_at, work_area_name, source, is_test, test_data')
        .eq('account_id', req.account.account_id)
        .gte('date', rangeStart)
        .lte('date', rangeEnd);

      if (recentRoutesQuery.error && isMissingTestDataColumn(recentRoutesQuery.error)) {
        recentRoutesQuery = await supabase
          .from('routes')
          .select('id, date, archived_at, work_area_name, source')
          .eq('account_id', req.account.account_id)
          .gte('date', rangeStart)
          .lte('date', rangeEnd);
      }

      if (recentRoutesQuery.error) {
        console.error('Manager records recent routes lookup failed:', recentRoutesQuery.error);
        return res.status(500).json({ error: 'Failed to load records' });
      }

      const recentRoutes = filterProductionRows(recentRoutesQuery.data || [], ['work_area_name', 'source']);

      const { data: recentSnapshots, error: recentSnapshotsError } = await supabase
        .from('daily_labor_snapshots')
        .select('id, work_date, driver_count, total_worked_hours, estimated_payroll')
        .eq('account_id', req.account.account_id)
        .gte('work_date', rangeStart)
        .lte('work_date', rangeEnd);

      if (recentSnapshotsError) {
        console.error('Manager records recent snapshots lookup failed:', recentSnapshotsError);
        return res.status(500).json({ error: 'Failed to load records' });
      }

      const { data: recentAdjustments, error: recentAdjustmentsError } = await supabase
        .from('labor_adjustments')
        .select('id, work_date')
        .eq('account_id', req.account.account_id)
        .gte('work_date', rangeStart)
        .lte('work_date', rangeEnd);

      if (recentAdjustmentsError) {
        console.error('Manager records recent adjustments lookup failed:', recentAdjustmentsError);
        return res.status(500).json({ error: 'Failed to load records' });
      }

      let routesQuery = await supabase
        .from('routes')
        .select('id, driver_id, vehicle_id, work_area_name, date, source, total_stops, completed_stops, status, sa_number, contractor_name, created_at, completed_at, archived_at, is_test, test_data')
        .eq('account_id', req.account.account_id)
        .eq('date', requestedDate)
        .order('created_at', { ascending: true });

      if (routesQuery.error && isMissingTestDataColumn(routesQuery.error)) {
        routesQuery = await supabase
          .from('routes')
          .select('id, driver_id, vehicle_id, work_area_name, date, source, total_stops, completed_stops, status, sa_number, contractor_name, created_at, completed_at, archived_at')
          .eq('account_id', req.account.account_id)
          .eq('date', requestedDate)
          .order('created_at', { ascending: true });
      }

      if (routesQuery.error) {
        console.error('Manager records routes lookup failed:', routesQuery.error);
        return res.status(500).json({ error: 'Failed to load records' });
      }

      const routes = filterProductionRows(routesQuery.data || [], ['work_area_name', 'source', 'contractor_name']);
      const driverIds = [...new Set((routes || []).map((route) => route.driver_id).filter(Boolean))];
      const vehicleIds = [...new Set((routes || []).map((route) => route.vehicle_id).filter(Boolean))];

      const { data: drivers, error: driversError } = driverIds.length
        ? await supabase
            .from('drivers')
            .select('id, name, email, is_test, test_data')
            .eq('account_id', req.account.account_id)
            .in('id', driverIds)
        : { data: [], error: null };

      let productionDrivers = [];
      if (driversError && isMissingTestDataColumn(driversError)) {
        const fallbackDriversQuery = await supabase
          .from('drivers')
          .select('id, name, email')
          .eq('account_id', req.account.account_id)
          .in('id', driverIds);

        if (fallbackDriversQuery.error) {
          console.error('Manager records drivers lookup failed:', fallbackDriversQuery.error);
          return res.status(500).json({ error: 'Failed to load records' });
        }
        productionDrivers = filterProductionRows(fallbackDriversQuery.data || [], ['name', 'email']);
      } else if (driversError) {
        console.error('Manager records drivers lookup failed:', driversError);
        return res.status(500).json({ error: 'Failed to load records' });
      } else {
        productionDrivers = filterProductionRows(drivers || [], ['name', 'email']);
      }

      const { data: vehicles, error: vehiclesError } = vehicleIds.length
        ? await supabase
            .from('vehicles')
            .select('id, name, is_test, test_data')
            .eq('account_id', req.account.account_id)
            .in('id', vehicleIds)
        : { data: [], error: null };

      let productionVehicles = [];
      if (vehiclesError && isMissingTestDataColumn(vehiclesError)) {
        const fallbackVehiclesQuery = await supabase
          .from('vehicles')
          .select('id, name')
          .eq('account_id', req.account.account_id)
          .in('id', vehicleIds);

        if (fallbackVehiclesQuery.error) {
          console.error('Manager records vehicles lookup failed:', fallbackVehiclesQuery.error);
          return res.status(500).json({ error: 'Failed to load records' });
        }
        productionVehicles = filterProductionRows(fallbackVehiclesQuery.data || [], ['name']);
      } else if (vehiclesError) {
        console.error('Manager records vehicles lookup failed:', vehiclesError);
        return res.status(500).json({ error: 'Failed to load records' });
      } else {
        productionVehicles = filterProductionRows(vehicles || [], ['name']);
      }

      const { data: snapshot, error: snapshotError } = await supabase
        .from('daily_labor_snapshots')
        .select('id, work_date, finalized_at, finalized_by_system, driver_count, shift_count, total_worked_hours, total_payable_hours, total_break_minutes, total_lunch_minutes, estimated_payroll')
        .eq('account_id', req.account.account_id)
        .eq('work_date', requestedDate)
        .maybeSingle();

      if (snapshotError) {
        console.error('Manager records daily snapshot lookup failed:', snapshotError);
        return res.status(500).json({ error: 'Failed to load records' });
      }

      const { data: adjustmentRows, error: adjustmentRowsError } = await supabase
        .from('labor_adjustments')
        .select('id, manager_user_id, driver_id, route_id, timecard_id, work_date, adjustment_reason, before_state, after_state, created_at')
        .eq('account_id', req.account.account_id)
        .eq('work_date', requestedDate)
        .order('created_at', { ascending: false });

      if (adjustmentRowsError) {
        console.error('Manager records adjustment lookup failed:', adjustmentRowsError);
        return res.status(500).json({ error: 'Failed to load records' });
      }

      const adjustmentDriverIds = [...new Set((adjustmentRows || []).map((row) => row.driver_id).filter(Boolean))];
      const { data: adjustmentDrivers, error: adjustmentDriversError } = adjustmentDriverIds.length
        ? await supabase
            .from('drivers')
            .select('id, name, email, is_test, test_data')
            .eq('account_id', req.account.account_id)
            .in('id', adjustmentDriverIds)
        : { data: [], error: null };

      let productionAdjustmentDrivers = [];
      if (adjustmentDriversError && isMissingTestDataColumn(adjustmentDriversError)) {
        const fallbackAdjustmentDriversQuery = await supabase
          .from('drivers')
          .select('id, name, email')
          .eq('account_id', req.account.account_id)
          .in('id', adjustmentDriverIds);

        if (fallbackAdjustmentDriversQuery.error) {
          console.error('Manager records adjustment driver lookup failed:', fallbackAdjustmentDriversQuery.error);
          return res.status(500).json({ error: 'Failed to load records' });
        }
        productionAdjustmentDrivers = filterProductionRows(fallbackAdjustmentDriversQuery.data || [], ['name', 'email']);
      } else if (adjustmentDriversError) {
        console.error('Manager records adjustment driver lookup failed:', adjustmentDriversError);
        return res.status(500).json({ error: 'Failed to load records' });
      } else {
        productionAdjustmentDrivers = filterProductionRows(adjustmentDrivers || [], ['name', 'email']);
      }

      const driverById = new Map([...productionDrivers, ...productionAdjustmentDrivers].map((driver) => [driver.id, driver]));
      const vehicleById = new Map(productionVehicles.map((vehicle) => [vehicle.id, vehicle]));

      const recentByDate = new Map();
      for (let offset = 0; offset < 30; offset += 1) {
        const date = getCurrentDateString(getDateDaysAgo(currentTime, offset));
        recentByDate.set(date, {
          date,
          route_count: 0,
          archived_route_count: 0,
          adjustment_count: 0,
          driver_count: 0,
          worked_hours: 0,
          estimated_payroll: 0
        });
      }

      recentRoutes.forEach((route) => {
        const entry = recentByDate.get(route.date);
        if (!entry) {
          return;
        }

        entry.route_count += 1;
        if (route.archived_at) {
          entry.archived_route_count += 1;
        }
      });

      (recentSnapshots || []).forEach((snapshotRow) => {
        const entry = recentByDate.get(snapshotRow.work_date);
        if (!entry) {
          return;
        }

        entry.driver_count = Number(snapshotRow.driver_count || 0);
        entry.worked_hours = Number(snapshotRow.total_worked_hours || 0);
        entry.estimated_payroll = Number(snapshotRow.estimated_payroll || 0);
      });

      (recentAdjustments || []).forEach((adjustment) => {
        const entry = recentByDate.get(adjustment.work_date);
        if (!entry) {
          return;
        }

        entry.adjustment_count += 1;
      });

      return res.status(200).json({
        range_start: rangeStart,
        range_end: rangeEnd,
        selected_date: requestedDate,
        recent_days: [...recentByDate.values()].sort((a, b) => b.date.localeCompare(a.date)),
        snapshot: snapshot || null,
        routes: routes
          .filter((route) => !isProductionTestArtifact(driverById.get(route.driver_id), ['name', 'email']))
          .filter((route) => !isProductionTestArtifact(vehicleById.get(route.vehicle_id), ['name']))
          .map((route) => ({
            ...route,
            driver_name: driverById.get(route.driver_id)?.name || null,
            driver_email: driverById.get(route.driver_id)?.email || null,
            vehicle_name: vehicleById.get(route.vehicle_id)?.name || null
          })),
        adjustments: (adjustmentRows || [])
          .filter((row) => !isProductionTestArtifact(driverById.get(row.driver_id), ['name', 'email']))
          .map((row) => ({
            ...buildLaborAdjustmentSummary(row),
            driver_name: driverById.get(row.driver_id)?.name || 'Driver',
            driver_email: driverById.get(row.driver_id)?.email || null
          }))
      });
    } catch (error) {
      console.error('Manager records endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load records' });
    }
  });

  router.patch('/routes/:route_id/assign', requireManager, async (req, res) => {
    const routeId = req.params.route_id;
    const { driver_id: driverId, vehicle_id: vehicleId } = req.body || {};

    if (driverId === undefined && vehicleId === undefined) {
      return res.status(400).json({ error: 'driver_id or vehicle_id is required' });
    }

    try {
      const { data: route, error: routeError } = await supabase
        .from('routes')
        .select('id, account_id, work_area_name, date, archived_at')
        .eq('id', routeId)
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (routeError) {
        console.error('Manager route assignment lookup failed:', routeError);
        return res.status(500).json({ error: 'Failed to load route for assignment' });
      }

      if (!route || !isDisplayableManagerRoute(route)) {
        return res.status(404).json({ error: 'Route not found' });
      }

      let assignedDriver = null;
      let assignedVehicle = null;

      if (driverId) {
        const { data: driver, error: driverError } = await supabase
          .from('drivers')
          .select('id, name')
          .eq('id', driverId)
          .eq('account_id', req.account.account_id)
          .eq('is_active', true)
          .maybeSingle();

        if (driverError) {
          console.error('Manager route assignment driver lookup failed:', driverError);
          return res.status(500).json({ error: 'Failed to validate driver assignment' });
        }

        if (!driver) {
          return res.status(400).json({ error: 'Driver is not available for this account' });
        }

        assignedDriver = driver;
      }

      if (vehicleId) {
        const { data: vehicle, error: vehicleError } = await supabase
          .from('vehicles')
          .select('id, name')
          .eq('id', vehicleId)
          .eq('account_id', req.account.account_id)
          .maybeSingle();

        if (vehicleError) {
          console.error('Manager route assignment vehicle lookup failed:', vehicleError);
          return res.status(500).json({ error: 'Failed to validate vehicle assignment' });
        }

        if (!vehicle) {
          return res.status(400).json({ error: 'Vehicle is not available for this account' });
        }

        assignedVehicle = vehicle;
      }

      const updatePayload = {};

      if (driverId !== undefined) {
        updatePayload.driver_id = driverId || null;
      }

      if (vehicleId !== undefined) {
        updatePayload.vehicle_id = vehicleId || null;
      }

      const { data: updatedRoute, error: updateError } = await supabase
        .from('routes')
        .update(updatePayload)
        .eq('id', routeId)
        .select('id, date, driver_id, vehicle_id, work_area_name, total_stops, completed_stops, status')
        .single();

      if (updateError) {
        console.error('Manager route assignment update failed:', updateError);
        return res.status(500).json({ error: 'Failed to update route assignment' });
      }

      let updatedDriver = null;

      if (updatedRoute.driver_id) {
        if (assignedDriver?.id === updatedRoute.driver_id) {
          updatedDriver = assignedDriver;
        } else {
          const { data: driver, error: driverError } = await supabase
            .from('drivers')
            .select('id, name')
            .eq('id', updatedRoute.driver_id)
            .eq('account_id', req.account.account_id)
            .maybeSingle();

          if (driverError) {
            console.error('Manager route assignment driver name lookup failed:', driverError);
            return res.status(500).json({ error: 'Failed to load updated driver assignment' });
          }

          updatedDriver = driver || null;
        }
      }

      const responseRoute = {
        ...updatedRoute,
        driver_name: updatedDriver?.name || null
      };

      let updatedVehicle = assignedVehicle?.id === updatedRoute.vehicle_id ? assignedVehicle : null;

      if (!updatedVehicle && updatedRoute.vehicle_id) {
        const { data: vehicle, error: vehicleError } = await supabase
          .from('vehicles')
          .select('id, name')
          .eq('id', updatedRoute.vehicle_id)
          .eq('account_id', req.account.account_id)
          .maybeSingle();

        if (vehicleError) {
          console.error('Manager route assignment vehicle name lookup failed:', vehicleError);
        } else {
          updatedVehicle = vehicle || null;
        }
      }

      await recordRouteSyncEvents(supabase, [
        {
          account_id: req.account.account_id,
          route_id: updatedRoute.id,
          work_date: updatedRoute.date || route.date || getCurrentDateString(nowProvider()),
          event_type: 'route_assignment_updated',
          event_status: !updatedRoute.driver_id || !updatedRoute.vehicle_id ? 'warning' : 'info',
          summary: `Route ${updatedRoute.work_area_name || updatedRoute.id} assignment updated`,
          details: {
            driver_id: updatedRoute.driver_id || null,
            vehicle_id: updatedRoute.vehicle_id || null,
            completed_stops: Number(updatedRoute.completed_stops || 0),
            total_stops: Number(updatedRoute.total_stops || 0),
            route_status: updatedRoute.status || null
          },
          manager_user_id: req.account.manager_user_id
        }
      ]);

      if (updatedRoute.driver_id && updatedRoute.vehicle_id) {
        await notifyDriverRouteInspectionAssigned(supabase, {
          accountId: req.account.account_id,
          driverId: updatedRoute.driver_id,
          route: updatedRoute,
          vehicle: updatedVehicle
        });
      }

      return res.status(200).json({ ok: true, route: responseRoute });
    } catch (error) {
      console.error('Manager route assignment endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update route assignment' });
    }
  });

  router.post('/routes/archive-date', requireManager, async (req, res) => {
    const requestedDate = parseDateParam(req.body?.date, nowProvider);

    if (!requestedDate) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    const today = getCurrentDateString(nowProvider());

    if (requestedDate >= today) {
      return res.status(400).json({
        error: 'Only past dates can be archived from Morning Setup. Today stays active so dispatch data is not hidden by accident.'
      });
    }

    try {
      const { data: routes, error: routesError } = await supabase
        .from('routes')
        .select('id, work_area_name, archived_at')
        .eq('account_id', req.account.account_id)
        .eq('date', requestedDate)
        .is('archived_at', null);

      if (routesError) {
        console.error('Archive routes lookup failed:', routesError);
        return res.status(500).json({ error: 'Failed to load routes for archive' });
      }

      const routeIds = (routes || []).map((route) => route.id);

      if (!routeIds.length) {
        return res.status(200).json({ archived_count: 0, archived_work_areas: [] });
      }

      const archivedAt = nowProvider().toISOString();
      const { data: archivedRoutes, error: archiveError } = await supabase
        .from('routes')
        .update({
          archived_at: archivedAt,
          archived_reason: 'manager_archived_date'
        })
        .in('id', routeIds)
        .eq('account_id', req.account.account_id)
        .select('id, work_area_name');

      if (archiveError) {
        console.error('Archive routes update failed:', archiveError);
        return res.status(500).json({ error: 'Failed to archive routes for this date' });
      }

      return res.status(200).json({
        archived_count: (archivedRoutes || []).length,
        archived_work_areas: (archivedRoutes || []).map((route) => route.work_area_name).filter(Boolean),
        archived_at: archivedAt
      });
    } catch (error) {
      console.error('Archive routes by date endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to archive routes for this date' });
    }
  });

  router.get('/routes/stops/:stop_id', requireManager, async (req, res) => {
    const stopId = req.params.stop_id;

    try {
      const { data: stopRecord, error: recordError } = await supabase
        .from('stops')
        .select(
          'id, route_id, sequence_order, address, contact_name, address_line2, business_name, company_name, primary_phone, alternate_phone, email, customer_instructions, delivery_instructions, consignee, shipper, lat, lng, status, is_business, has_note, stop_type, has_pickup, has_delivery, has_time_commit, ready_time, close_time, sid, geocode_source, geocode_accuracy, exception_code, delivery_type_code, pod_photo_url, pod_signature_url, signature_url, signer_name, age_confirmed, notes, scanned_at, completed_at, routes!inner(account_id)'
        )
        .eq('id', stopId)
        .eq('routes.account_id', req.account.account_id)
        .maybeSingle();

      if (recordError) {
        console.error('Manager stop detail lookup failed:', recordError);
        return res.status(500).json({ error: 'Failed to load stop detail' });
      }

      if (!stopRecord) {
        return res.status(404).json({ error: 'Stop not found' });
      }

      const { data: packages, error: packagesError } = await fetchPackagesByStopIds(
        supabase,
        [stopId],
        'id, stop_id, tracking_number, service_code, requires_signature, requires_adult_signature, hazmat'
      );

      if (packagesError) {
        console.error('Manager stop detail package lookup failed:', packagesError);
        return res.status(500).json({ error: 'Failed to load stop packages' });
      }

      const { data: siblingStops, error: siblingStopsError } = await supabase
        .from('stops')
        .select('id, route_id, sequence_order, address, contact_name, address_line2, status, notes')
        .eq('route_id', stopRecord.route_id)
        .order('sequence_order');

      if (siblingStopsError) {
        console.error('Manager stop detail sibling lookup failed:', siblingStopsError);
        return res.status(500).json({ error: 'Failed to load nearby stop context' });
      }

      const stopRows = [
        {
          ...stopRecord,
          routes: undefined,
          packages: createPackagesByStopId(packages).get(stopRecord.id) || []
        },
        ...(siblingStops || [])
          .filter((siblingStop) => siblingStop.id !== stopId)
          .map((siblingStop) => ({
            ...siblingStop,
            packages: []
          }))
      ];

      const notedStops = await attachStopNotesToStops(supabase, req.account.account_id, stopRows, createAddressHash);
      const correctedStops = await applyLocationCorrectionsToStops(supabase, req.account.account_id, notedStops);
      const apartmentStops = await attachApartmentIntelligenceToStops(
        supabase,
        req.account.account_id,
        correctedStops.map((stop) => addDerivedStopFields(stop))
      );
      const propertyStops = await attachPropertyIntelToStops(supabase, req.account.account_id, apartmentStops);

      return res.status(200).json({
        stop: propertyStops[0]
      });
    } catch (error) {
      console.error('Manager stop detail endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load stop detail' });
    }
  });

  router.get('/routes/:route_id/stops', requireManager, async (req, res) => {
    const routeId = req.params.route_id;
    const date = parseDateParam(req.query.date, nowProvider);

    if (!date) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    try {
      const { data: route, error: routeError } = await supabase
        .from('routes')
        .select('id, account_id, driver_id, vehicle_id, work_area_name, date, total_stops, completed_stops, status, dispatch_state, dispatched_at, sync_state, last_manifest_sync_at, last_manifest_change_at, manifest_stop_count, manifest_package_count, last_manifest_sync_error, sa_number, contractor_name, archived_at')
        .eq('id', routeId)
        .eq('account_id', req.account.account_id)
        .eq('date', date)
        .maybeSingle();

      if (routeError) {
        console.error('Manager route detail lookup failed:', routeError);
        return res.status(500).json({ error: 'Failed to load route detail' });
      }

      if (!route || !isDisplayableManagerRoute(route)) {
        return res.status(404).json({ error: 'Route not found' });
      }

      const [{ data: stops, error: stopsError }] = await Promise.all([
        supabase
          .from('stops')
          .select(
            'id, route_id, sequence_order, address, contact_name, address_line2, business_name, company_name, primary_phone, alternate_phone, email, customer_instructions, delivery_instructions, consignee, shipper, lat, lng, status, is_business, has_note, stop_type, has_pickup, has_delivery, has_time_commit, ready_time, close_time, sid, geocode_source, geocode_accuracy, exception_code, delivery_type_code, pod_photo_url, notes, completed_at'
          )
          .eq('route_id', routeId)
          .order('sequence_order')
      ]);

      if (stopsError) {
        console.error('Manager route detail stops lookup failed:', stopsError);
        return res.status(500).json({ error: getManifestSchemaError(stopsError) || 'Failed to load route stops' });
      }

      const stopIds = (stops || []).map((stop) => stop.id);
      let packagesByStopId = new Map();

      if (stopIds.length > 0) {
        const { data: packages, error: packagesError } = await fetchPackagesByStopIds(
          supabase,
          stopIds,
          'id, stop_id, tracking_number, service_code, requires_signature, requires_adult_signature, hazmat'
        );

        if (packagesError) {
          console.error('Manager route detail packages lookup failed:', packagesError);
          return res.status(500).json({ error: 'Failed to load route packages' });
        }

        packagesByStopId = createPackagesByStopId(packages);
      }

      let driver = null;
      let vehicle = null;

      if (route.driver_id) {
        const { data: driverRow, error: driverError } = await supabase
          .from('drivers')
          .select('id, name')
          .eq('id', route.driver_id)
          .eq('account_id', req.account.account_id)
          .maybeSingle();

        if (driverError) {
          console.error('Manager route detail driver lookup failed:', driverError);
          return res.status(500).json({ error: 'Failed to load route driver' });
        }

        driver = driverRow || null;
      }

      if (route.vehicle_id) {
        const { data: vehicleRow, error: vehicleError } = await supabase
          .from('vehicles')
          .select('id, name')
          .eq('id', route.vehicle_id)
          .eq('account_id', req.account.account_id)
          .maybeSingle();

        if (vehicleError) {
          console.error('Manager route detail vehicle lookup failed:', vehicleError);
          return res.status(500).json({ error: 'Failed to load route vehicle' });
        }

        vehicle = vehicleRow || null;
      }

      const completedStops = (stops || []).filter((stop) => stop.completed_at);
      const firstScan = completedStops.reduce((earliest, stop) => {
        if (!stop.completed_at) {
          return earliest;
        }

        if (!earliest || new Date(stop.completed_at).getTime() < new Date(earliest).getTime()) {
          return stop.completed_at;
        }

        return earliest;
      }, null);

      const notedStops = await attachStopNotesToStops(supabase, req.account.account_id, stops || [], createAddressHash);
      const correctedStops = await applyLocationCorrectionsToStops(supabase, req.account.account_id, notedStops);
      const apartmentStops = await attachApartmentIntelligenceToStops(
        supabase,
        req.account.account_id,
        correctedStops.map((stop) =>
          addDerivedStopFields({
            id: stop.id,
            sequence_order: stop.sequence_order,
            address: stop.address,
            contact_name: stop.contact_name || null,
            address_line2: stop.address_line2 || null,
            business_name: stop.business_name || null,
            company_name: stop.company_name || null,
            primary_phone: stop.primary_phone || null,
            alternate_phone: stop.alternate_phone || null,
            email: stop.email || null,
            customer_instructions: stop.customer_instructions || null,
            delivery_instructions: stop.delivery_instructions || null,
            consignee: stop.consignee || null,
            shipper: stop.shipper || null,
            lat: stop.lat,
            lng: stop.lng,
            status: stop.status,
            has_note: Boolean(stop.has_note),
            stop_type: stop.stop_type || null,
            has_pickup: Boolean(stop.has_pickup),
            has_delivery: Boolean(stop.has_delivery),
            has_time_commit: Boolean(stop.has_time_commit),
            ready_time: stop.ready_time || null,
            close_time: stop.close_time || null,
            sid: stop.sid || null,
            geocode_source: stop.geocode_source || 'manifest',
            geocode_accuracy: stop.geocode_accuracy || 'manifest',
            exception_code: stop.exception_code || null,
            delivery_type_code: stop.delivery_type_code || null,
            pod_photo_url: stop.pod_photo_url || null,
            notes: stop.notes || null,
            completed_at: stop.completed_at || null,
            packages: packagesByStopId.get(stop.id) || []
          })
        )
      );
      const enrichedStops = await attachPropertyIntelToStops(supabase, req.account.account_id, apartmentStops);
      const pickupStopSummary = getPickupStopSummary(enrichedStops);
      const deliveryStopSummary = getDeliveryStopSummary(enrichedStops);
      const combinedStopSummary = getCombinedStopSummary(enrichedStops);

      return res.status(200).json({
        route: {
          id: route.id,
          work_area_name: route.work_area_name,
          date: route.date,
          status: route.status,
          dispatch_state: route.dispatch_state || null,
          dispatched_at: route.dispatched_at || null,
          sync_state: route.sync_state || null,
          last_manifest_sync_at: route.last_manifest_sync_at || null,
          last_manifest_change_at: route.last_manifest_change_at || null,
          manifest_stop_count: route.manifest_stop_count ?? null,
          manifest_package_count: route.manifest_package_count ?? null,
          last_manifest_sync_error: route.last_manifest_sync_error || null,
          driver_id: route.driver_id || null,
          driver_name: driver?.name || null,
          vehicle_id: route.vehicle_id || null,
          vehicle_name: vehicle?.name || null,
          total_stops: Number(route.total_stops || 0),
          completed_stops: Number(route.completed_stops || 0),
          delivery_stops: deliveryStopSummary.total,
          delivery_stops_completed: deliveryStopSummary.completed,
          delivery_stop_count: deliveryStopSummary.total,
          pickup_stops: pickupStopSummary.total,
          pickup_stops_completed: pickupStopSummary.completed,
          pickup_stop_count: pickupStopSummary.total,
          combined_stops: combinedStopSummary.total,
          combined_stops_completed: combinedStopSummary.completed,
          combined_stop_count: combinedStopSummary.total,
          stops_per_hour: getStopsPerHour({
            completedStops: Number(route.completed_stops || 0),
            firstScan,
            currentTime: nowProvider()
          }),
          sa_number: route.sa_number || null,
          contractor_name: route.contractor_name || null
        },
        stops: enrichedStops,
        coordinate_recovery: {
          attempted: 0,
          recovered: 0,
          unresolved: 0,
          status: 'disabled'
        }
      });
    } catch (error) {
      console.error('Manager route detail endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load route detail' });
    }
  });

  router.get('/routes/:route_id/driver-position', requireManager, async (req, res) => {
    const routeId = req.params.route_id;
    const today = getCurrentDateString(nowProvider());

    try {
      const { data: route, error: routeError } = await supabase
        .from('routes')
        .select('id, account_id, driver_id, work_area_name, date, archived_at')
        .eq('id', routeId)
        .eq('account_id', req.account.account_id)
        .eq('date', today)
        .maybeSingle();

      if (routeError) {
        console.error('Manager driver-position route lookup failed:', routeError);
        return res.status(500).json({ error: 'Failed to load route for driver position' });
      }

      if (!route || !isDisplayableManagerRoute(route)) {
        return res.status(404).json({ error: 'Route not found' });
      }

      if (!route.driver_id) {
        return res.status(200).json(null);
      }

      const [{ data: driver, error: driverError }, { data: positions, error: positionsError }] = await Promise.all([
        supabase
          .from('drivers')
          .select('id, name')
          .eq('id', route.driver_id)
          .eq('account_id', req.account.account_id)
          .maybeSingle(),
        supabase
          .from('driver_positions')
          .select('driver_id, lat, lng, timestamp')
          .eq('driver_id', route.driver_id)
          .eq('route_id', routeId)
          .order('timestamp', { ascending: false })
          .limit(1)
      ]);

      if (driverError) {
        console.error('Manager driver-position driver lookup failed:', driverError);
        return res.status(500).json({ error: 'Failed to load route driver' });
      }

      if (positionsError) {
        console.error('Manager driver-position lookup failed:', positionsError);
        return res.status(500).json({ error: 'Failed to load driver position' });
      }

      const recentPosition = getRecentPosition(positions?.[0] || null, nowProvider());

      if (!recentPosition) {
        return res.status(200).json(null);
      }

      return res.status(200).json({
        lat: recentPosition.lat,
        lng: recentPosition.lng,
        timestamp: recentPosition.timestamp,
        driver_name: driver?.name || null
      });
    } catch (error) {
      console.error('Manager driver-position endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load driver position' });
    }
  });

  router.patch('/routes/stops/:stop_id/note', requireManager, async (req, res) => {
    const stopId = req.params.stop_id;
    const normalizedNoteText = String(req.body?.note_text || '').trim();

    try {
      const { data: stop, error: stopError } = await supabase
        .from('stops')
        .select('id, address, address_line2, route_id, routes!inner(account_id)')
        .eq('id', stopId)
        .eq('routes.account_id', req.account.account_id)
        .maybeSingle();

      if (stopError) {
        console.error('Manager stop note authorization lookup failed:', stopError);
        return res.status(500).json({ error: 'Failed to validate stop note assignment' });
      }

      if (!stop) {
        return res.status(404).json({ error: 'Stop not found' });
      }

      await saveStopNote(supabase, req.account.account_id, stop, normalizedNoteText, createAddressHash);

      const { error: stopUpdateError } = await supabase
        .from('stops')
        .update({ has_note: Boolean(normalizedNoteText) })
        .eq('id', stopId);

      if (stopUpdateError) {
        console.error('Manager stop has_note update failed:', stopUpdateError);
        return res.status(500).json({ error: 'Failed to save stop note' });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Manager stop note endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save stop note' });
    }
  });

  router.patch('/routes/stops/:stop_id/property-intel', requireManager, async (req, res) => {
    const stopId = req.params.stop_id;

    try {
      const { data: stop, error: stopError } = await supabase
        .from('stops')
        .select('id, address, address_line2, contact_name, route_id, routes!inner(id, account_id)')
        .eq('id', stopId)
        .eq('routes.account_id', req.account.account_id)
        .maybeSingle();

      if (stopError) {
        console.error('Manager property intel stop lookup failed:', stopError);
        return res.status(500).json({ error: 'Failed to load stop for property intel' });
      }

      if (!stop) {
        return res.status(404).json({ error: 'Stop not found' });
      }

      await savePropertyIntel(supabase, req.account.account_id, stop, {
        property_name: req.body?.property_name,
        property_type: req.body?.property_type,
        building: req.body?.building,
        access_code: req.body?.access_code,
        access_code_source: req.body?.access_code_source || 'manager',
        access_note: req.body?.access_note,
        parking_note: req.body?.parking_note,
        entry_note: req.body?.entry_note,
        business_hours: req.body?.business_hours,
        shared_note: req.body?.shared_note,
        warning_flags: req.body?.warning_flags
      });

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Manager property intel save endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save property intel' });
    }
  });

  router.get('/routes/:route_id/road-flags', requireManager, async (req, res) => {
    const routeId = req.params.route_id;
    const date = parseDateParam(req.query.date, nowProvider);

    if (!date) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    try {
      const { data: route, error: routeError } = await supabase
        .from('routes')
        .select('id, account_id, work_area_name, date, archived_at')
        .eq('id', routeId)
        .eq('account_id', req.account.account_id)
        .eq('date', date)
        .maybeSingle();

      if (routeError) {
        console.error('Manager road-flags route lookup failed:', routeError);
        return res.status(500).json({ error: 'Failed to load route for road flags' });
      }

      if (!route || !isDisplayableManagerRoute(route)) {
        return res.status(404).json({ error: 'Route not found' });
      }

      const { data: stops, error: stopsError } = await supabase
        .from('stops')
        .select('lat, lng')
        .eq('route_id', routeId);

      if (stopsError) {
        console.error('Manager road-flags stop lookup failed:', stopsError);
        return res.status(500).json({ error: getManifestSchemaError(stopsError) || 'Failed to load route stops' });
      }

      const boundary = getCoordinateBoundary(stops || []);

      if (!boundary) {
        return res.status(200).json({ road_flags: [] });
      }

      const { data: roadRules, error: roadRulesError } = await supabase
        .from('road_rules')
        .select('id, flag_type, lat_start, lng_start, lat_end, lng_end, notes, created_by, created_at')
        .eq('account_id', req.account.account_id)
        .order('created_at', { ascending: false });

      if (roadRulesError) {
        console.error('Manager road-flags lookup failed:', roadRulesError);
        return res.status(500).json({ error: 'Failed to load road flags' });
      }

      const matchingFlags = (roadRules || []).filter((rule) => {
        const coordinates = [
          [Number(rule.lat_start), Number(rule.lng_start)],
          [Number(rule.lat_end), Number(rule.lng_end)]
        ].filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

        if (!coordinates.length) {
          return false;
        }

        return coordinates.some(
          ([lat, lng]) =>
            lat >= boundary.minLat &&
            lat <= boundary.maxLat &&
            lng >= boundary.minLng &&
            lng <= boundary.maxLng
        );
      });

      const driverIds = [...new Set(matchingFlags.map((rule) => rule.created_by).filter(Boolean))];
      let driverNameById = new Map();

      if (driverIds.length > 0) {
        const { data: drivers, error: driversError } = await supabase
          .from('drivers')
          .select('id, name')
          .eq('account_id', req.account.account_id)
          .in('id', driverIds);

        if (driversError) {
          console.error('Manager road-flags driver lookup failed:', driversError);
          return res.status(500).json({ error: 'Failed to load road flag drivers' });
        }

        driverNameById = new Map((drivers || []).map((driver) => [driver.id, driver.name]));
      }

      return res.status(200).json({
        road_flags: matchingFlags.map((rule) => ({
          id: rule.id,
          flag_type: rule.flag_type,
          lat_start: rule.lat_start,
          lng_start: rule.lng_start,
          lat_end: rule.lat_end,
          lng_end: rule.lng_end,
          notes: rule.notes || null,
          driver_name: rule.created_by ? driverNameById.get(rule.created_by) || null : null,
          created_at: rule.created_at
        }))
      });
    } catch (error) {
      console.error('Manager road-flags endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load road flags' });
    }
  });

  router.get('/routes', requireManager, async (req, res) => {
    const date = parseDateParam(req.query.date, nowProvider);

    if (!date) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    try {
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, company_name, fedex_csp_id, operations_timezone, dispatch_window_start_hour, dispatch_window_end_hour, manifest_sync_interval_minutes')
        .eq('id', req.account.account_id)
        .maybeSingle();

      if (accountError) {
        console.error('Manager route account lookup failed:', accountError);
        return res.status(500).json({ error: 'Failed to load route sync settings' });
      }

      const fedexAccounts = await listFedexAccountsForAccount(supabase, req.account.account_id);
      const fedexConnectionSummary = summarizeFedexAccounts(fedexAccounts.accounts, account?.fedex_csp_id || null);

      let routesQuery = await supabase
        .from('routes')
        .select('id, account_id, driver_id, vehicle_id, work_area_name, date, source, total_stops, completed_stops, status, dispatch_state, dispatched_at, sync_state, last_manifest_sync_at, last_manifest_change_at, manifest_stop_count, manifest_package_count, manifest_fingerprint, last_manifest_sync_error, created_at, completed_at, archived_at, is_test, test_data')
        .eq('account_id', req.account.account_id)
        .eq('date', date)
        .is('archived_at', null)
        .order('id');

      if (routesQuery.error && isMissingTestDataColumn(routesQuery.error)) {
        routesQuery = await supabase
          .from('routes')
          .select('id, account_id, driver_id, vehicle_id, work_area_name, date, source, total_stops, completed_stops, status, dispatch_state, dispatched_at, sync_state, last_manifest_sync_at, last_manifest_change_at, manifest_stop_count, manifest_package_count, manifest_fingerprint, last_manifest_sync_error, created_at, completed_at, archived_at')
          .eq('account_id', req.account.account_id)
          .eq('date', date)
          .is('archived_at', null)
          .order('id');
      }

      if (routesQuery.error) {
        console.error('Manager routes lookup failed:', routesQuery.error);
        return res.status(500).json({ error: 'Failed to load routes' });
      }

      const visibleRoutes = sortRoutesByWorkArea(
        filterProductionRows(routesQuery.data || [], ['work_area_name', 'source'])
          .filter(isDisplayableManagerRoute)
      );
      const routeIds = visibleRoutes.map((route) => route.id);
      const driverIds = [...new Set(visibleRoutes.map((route) => route.driver_id).filter(Boolean))];
      const vehicleIds = [...new Set(visibleRoutes.map((route) => route.vehicle_id).filter(Boolean))];
      const currentTime = nowProvider();
      let stopsByRouteId = new Map();
      let packagesByStopId = new Map();
      let lastPositionByDriverId = new Map();
      let driversById = new Map();
      let vehiclesById = new Map();
      let routeEventsByRouteId = new Map();

      if (routeIds.length > 0) {
        const { data: stops, error: stopsError } = await supabase
          .from('stops')
          .select(
            'id, route_id, sequence_order, address, contact_name, address_line2, business_name, company_name, primary_phone, alternate_phone, email, customer_instructions, delivery_instructions, consignee, shipper, lat, lng, status, notes, exception_code, delivery_type_code, signer_name, signature_url, age_confirmed, pod_photo_url, pod_signature_url, scanned_at, completed_at, has_time_commit, stop_type, has_pickup, has_delivery, is_pickup'
          )
          .in('route_id', routeIds)
          .order('sequence_order');

        if (stopsError) {
          console.error('Manager route stops lookup failed:', stopsError);
          return res.status(500).json({ error: getManifestSchemaError(stopsError) || 'Failed to load route stops' });
        }

        stopsByRouteId = (stops || []).reduce((map, stop) => {
          const current = map.get(stop.route_id) || [];
          current.push(stop);
          map.set(stop.route_id, current);
          return map;
        }, new Map());

        const stopIds = (stops || []).map((stop) => stop.id);

        if (stopIds.length > 0) {
          const { data: packages, error: packagesError } = await fetchPackagesByStopIds(
            supabase,
            stopIds,
            'id, stop_id'
          );

          if (packagesError) {
            console.error('Manager routes package lookup failed:', packagesError);
            return res.status(500).json({ error: 'Failed to load route packages' });
          }

          packagesByStopId = createPackagesByStopId(packages || []);
        }
      }

      if (routeIds.length > 0 && driverIds.length > 0) {
        const livePositionCutoff = new Date(currentTime.getTime() - LIVE_ROUTE_POSITION_MAX_AGE_MS).toISOString();
        const { data: positionRows, error: positionsError } = await supabase
          .from('driver_positions')
          .select('driver_id, route_id, lat, lng, timestamp')
          .in('route_id', routeIds)
          .gte('timestamp', livePositionCutoff)
          .order('timestamp', { ascending: false });

        if (positionsError) {
          console.error('Manager routes position lookup failed:', positionsError);
          return res.status(500).json({ error: 'Failed to load route positions' });
        }

        lastPositionByDriverId = createLastPositionMap(positionRows || []);
      }

      if (driverIds.length > 0) {
        let driversQuery = await supabase
          .from('drivers')
          .select('id, name, email, is_test, test_data')
          .eq('account_id', req.account.account_id)
          .in('id', driverIds);

        if (driversQuery.error && isMissingTestDataColumn(driversQuery.error)) {
          driversQuery = await supabase
            .from('drivers')
            .select('id, name, email')
            .eq('account_id', req.account.account_id)
            .in('id', driverIds);
        }

        if (driversQuery.error) {
          console.error('Manager routes driver lookup failed:', driversQuery.error);
          return res.status(500).json({ error: 'Failed to load route driver names' });
        }

        driversById = new Map(
          filterProductionRows(driversQuery.data || [], ['name', 'email'])
            .map((driver) => [driver.id, driver])
        );
      }

      if (vehicleIds.length > 0) {
        let vehiclesQuery = await supabase
          .from('vehicles')
          .select('id, name, plate, is_test, test_data')
          .eq('account_id', req.account.account_id)
          .in('id', vehicleIds);

        if (vehiclesQuery.error && isMissingTestDataColumn(vehiclesQuery.error)) {
          vehiclesQuery = await supabase
            .from('vehicles')
            .select('id, name, plate')
            .eq('account_id', req.account.account_id)
            .in('id', vehicleIds);
        }

        if (vehiclesQuery.error) {
          console.error('Manager routes vehicle lookup failed:', vehiclesQuery.error);
          return res.status(500).json({ error: 'Failed to load route vehicle names' });
        }

        vehiclesById = new Map(
          filterProductionRows(vehiclesQuery.data || [], ['name', 'plate'])
            .map((vehicle) => [vehicle.id, vehicle])
        );
      }

      const productionVisibleRoutes = visibleRoutes
        .filter((route) => !isProductionTestArtifact(driversById.get(route.driver_id), ['name', 'email']))
        .filter((route) => !isProductionTestArtifact(vehiclesById.get(route.vehicle_id), ['name', 'plate']));
      const latestSyncAt = getLatestTimestamp(
        productionVisibleRoutes.map((route) => route.last_manifest_sync_at || route.created_at)
      );
      const routesBySyncState = productionVisibleRoutes.reduce((summary, route) => {
        const syncState = presentRouteSyncState(route);
        summary[syncState] = (summary[syncState] || 0) + 1;
        return summary;
      }, {});
      const visibleRouteIds = productionVisibleRoutes.map((route) => route.id);

      if (visibleRouteIds.length > 0) {
        const { data: routeEvents, error: routeEventsError } = await supabase
          .from('route_sync_events')
          .select('id, route_id, event_type, event_status, summary, details, manager_user_id, created_at')
          .in('route_id', visibleRouteIds)
          .order('created_at', { ascending: false });

        if (routeEventsError) {
          console.error('Manager route event lookup failed:', routeEventsError);
          return res.status(500).json({ error: 'Failed to load route audit history' });
        }

        routeEventsByRouteId = (routeEvents || []).reduce((map, event) => {
          const current = map.get(event.route_id) || [];

          if (current.length < 5) {
            current.push(event);
          }

          map.set(event.route_id, current);
          return map;
        }, new Map());
      }

      return res.status(200).json({
        account: {
          id: req.account.account_id,
          company_name: account?.company_name || req.account.company_name || null
        },
        sync_status: {
          routes_today: Number(productionVisibleRoutes.length),
          routes_assigned: productionVisibleRoutes.filter((route) => Boolean(route.driver_id)).length,
          routes_dispatched: productionVisibleRoutes.filter((route) => route.dispatch_state === 'dispatched').length,
          routes_changed: Number((routesBySyncState.staged_changed || 0) + (routesBySyncState.changed_after_dispatch || 0)),
          routes_blocked: Number((routesBySyncState.dispatch_blocked || 0) + (routesBySyncState.needs_attention || 0)),
          last_sync_at: latestSyncAt
        },
        route_sync_settings: presentRouteSyncSettings(account || {}, date, nowProvider()),
        fedex_connection: fedexConnectionSummary,
        routes: productionVisibleRoutes.map((route) => {
          const routeStops = stopsByRouteId.get(route.id) || [];
          const stopsById = new Map(routeStops.map((stop) => [stop.id, stop]));
          const routePackages = routeStops.flatMap((stop) => packagesByStopId.get(stop.id) || []);
          const packageSummary = getPackageStatusSummary(routePackages, stopsById);
          const pickupStopSummary = getPickupStopSummary(routeStops);
          const deliveryStopSummary = getDeliveryStopSummary(routeStops);
          const combinedStopSummary = getCombinedStopSummary(routeStops);
          const exceptionCount = routeStops.filter((stop) =>
            Boolean(stop.exception_code) ||
            ['attempted', 'incomplete', 'pickup_attempted'].includes(stop.status)
          ).length;
          const completedRouteStops = routeStops.filter((stop) => stop.completed_at);
          const firstScan = completedRouteStops.reduce((earliest, stop) => {
            if (!stop.completed_at) {
              return earliest;
            }

            if (!earliest || new Date(stop.completed_at).getTime() < new Date(earliest).getTime()) {
              return stop.completed_at;
            }

            return earliest;
          }, null);
          const lastPosition = route.driver_id ? lastPositionByDriverId.get(route.driver_id) || null : null;
          const lastPositionTimestamp = lastPosition
            ? lastPosition.timestamp || lastPosition.recorded_at || lastPosition.created_at || null
            : null;
          const isOnline = Boolean(
            lastPositionTimestamp &&
            currentTime.getTime() - new Date(lastPositionTimestamp).getTime() < LIVE_ROUTE_POSITION_MAX_AGE_MS
          );

          return {
            ...summarizeCoordinateHealth(routeStops),
            ...route,
            sync_state: presentRouteSyncState(route),
            post_dispatch_change_policy: getPostDispatchChangePolicy(route),
            audit_events: routeEventsByRouteId.get(route.id) || [],
            driver_name: route.driver_id ? driversById.get(route.driver_id)?.name || null : null,
            vehicle_name: route.vehicle_id ? vehiclesById.get(route.vehicle_id)?.name || null : null,
            vehicle_plate: route.vehicle_id ? vehiclesById.get(route.vehicle_id)?.plate || null : null,
            time_commits_total: getTimeCommitCounts(routeStops).total,
            time_commits_completed: getTimeCommitCounts(routeStops).completed,
            delivery_stops: deliveryStopSummary.total,
            delivery_stops_completed: deliveryStopSummary.completed,
            delivery_stop_count: deliveryStopSummary.total,
            pickup_stops: pickupStopSummary.total,
            pickup_stops_completed: pickupStopSummary.completed,
            pickup_stop_count: pickupStopSummary.total,
            combined_stops: combinedStopSummary.total,
            combined_stops_completed: combinedStopSummary.completed,
            combined_stop_count: combinedStopSummary.total,
            delivered_packages: packageSummary.completed,
            total_packages: routePackages.length,
            exception_count: exceptionCount,
            exceptions: exceptionCount,
            impacts: Number(route.impacts || 0),
            stops_per_hour: getStopsPerHour({
              completedStops: Number(route.completed_stops || 0),
              firstScan,
              currentTime
            }),
            last_position: lastPosition
              ? {
                  lat: lastPosition.lat,
                  lng: lastPosition.lng,
                  timestamp: lastPositionTimestamp
                }
              : null,
            is_online: isOnline,
            stops: routeStops.map(omitBroadStopContactFields)
          };
        })
      });
    } catch (error) {
      console.error('Manager routes endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load routes' });
    }
  });

  router.post('/routes/dispatch', requireManager, async (req, res) => {
    const date = parseDateParam(req.body?.date, nowProvider);
    const routeIds = Array.isArray(req.body?.route_ids)
      ? req.body.route_ids.map((value) => String(value || '').trim()).filter(Boolean)
      : [];

    if (!date) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    try {
      let routesQuery = await supabase
        .from('routes')
        .select('id, driver_id, vehicle_id, work_area_name, status, completed_stops, dispatch_state, sync_state, last_manifest_change_at, dispatched_at, archived_at, is_test, test_data')
        .eq('account_id', req.account.account_id)
        .eq('date', date)
        .is('archived_at', null)
        .order('id');

      if (routesQuery.error && isMissingTestDataColumn(routesQuery.error)) {
        routesQuery = await supabase
          .from('routes')
          .select('id, driver_id, vehicle_id, work_area_name, status, completed_stops, dispatch_state, sync_state, last_manifest_change_at, dispatched_at, archived_at')
          .eq('account_id', req.account.account_id)
          .eq('date', date)
          .is('archived_at', null)
          .order('id');
      }

      if (routesQuery.error) {
        console.error('Route dispatch lookup failed:', routesQuery.error);
        return res.status(500).json({ error: 'Failed to load routes for dispatch' });
      }

      let visibleRoutes = sortRoutesByWorkArea(
        filterProductionRows(routesQuery.data || [], ['work_area_name'])
          .filter(isDisplayableManagerRoute)
      );

      if (routeIds.length > 0) {
        const routeIdSet = new Set(routeIds);
        visibleRoutes = sortRoutesByWorkArea(visibleRoutes.filter((route) => routeIdSet.has(route.id)));
      }

      if (!visibleRoutes.length) {
        return res.status(400).json({ error: 'No routes are available to dispatch for this date.' });
      }

      const blockedRoutes = visibleRoutes.filter((route) => shouldBlockDispatchForSyncState(presentRouteSyncState(route)));
      const warningRoutes = visibleRoutes.filter((route) => ['staged_changed', 'changed_after_dispatch'].includes(presentRouteSyncState(route)));

      if (blockedRoutes.length > 0) {
        return res.status(409).json({
          error: 'Some routes are not ready to dispatch yet.',
          blocked_routes: blockedRoutes.map((route) => ({
            id: route.id,
            work_area_name: route.work_area_name,
            sync_state: presentRouteSyncState(route),
            needs_driver: !route.driver_id,
            needs_vehicle: !route.vehicle_id
          }))
        });
      }

      const stagedRouteIds = visibleRoutes
        .filter((route) => route.dispatch_state !== 'dispatched')
        .map((route) => route.id);

      if (!stagedRouteIds.length) {
        return res.status(200).json({
          dispatched_count: 0,
          already_dispatched: true,
          dispatched_route_ids: [],
          dispatched_work_areas: []
        });
      }

      const dispatchedAt = nowProvider().toISOString();
      const { data: updatedRoutes, error: updateError } = await supabase
        .from('routes')
        .update({
          dispatch_state: 'dispatched',
          dispatched_at: dispatchedAt,
          dispatched_by_manager_user_id: req.account.manager_user_id
        })
        .in('id', stagedRouteIds)
        .eq('account_id', req.account.account_id)
        .select('id, work_area_name, dispatched_at');

      if (updateError) {
        console.error('Route dispatch update failed:', updateError);
        return res.status(500).json({ error: 'Failed to dispatch routes' });
      }

      await recordRouteSyncEvents(
        supabase,
        visibleRoutes
          .filter((route) => stagedRouteIds.includes(route.id))
          .map((route) => ({
            account_id: req.account.account_id,
            route_id: route.id,
            work_date: date,
            event_type: 'routes_dispatched',
            event_status: ['staged_changed', 'changed_after_dispatch'].includes(presentRouteSyncState(route)) ? 'warning' : 'info',
            summary: `Route ${route.work_area_name || route.id} dispatched to drivers`,
            details: {
              sync_state: presentRouteSyncState(route),
              post_dispatch_change_policy: getPostDispatchChangePolicy(route),
              had_warning_at_dispatch: ['staged_changed', 'changed_after_dispatch'].includes(presentRouteSyncState(route))
            },
            manager_user_id: req.account.manager_user_id
          }))
      );

      return res.status(200).json({
        dispatched_count: (updatedRoutes || []).length,
        dispatched_at: dispatchedAt,
        dispatched_route_ids: (updatedRoutes || []).map((route) => route.id),
        dispatched_work_areas: (updatedRoutes || []).map((route) => route.work_area_name),
        warning_routes: warningRoutes.map((route) => ({
          id: route.id,
          work_area_name: route.work_area_name,
          sync_state: presentRouteSyncState(route),
          post_dispatch_change_policy: getPostDispatchChangePolicy(route)
        }))
      });
    } catch (error) {
      console.error('Route dispatch endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to dispatch routes' });
    }
  });

  return router;
}

module.exports = createManagerRouter();
module.exports.createManagerRouter = createManagerRouter;
