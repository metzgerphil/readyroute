import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import api from '../services/api';
import { PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import { getTodayString, loadStoredOperationsDate, saveStoredOperationsDate } from '../utils/operationsDate';

function formatMinutes(value) {
  return `${Number(value || 0)} min`;
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function formatShortTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function formatDateTimeLocalInput(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function localInputToIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function formatDisplayDate(value) {
  if (!value) {
    return 'Selected day';
  }

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function getBreaks(row) {
  return (row?.timecards || []).flatMap((timecard) => timecard.breaks || []);
}

function getBreakByType(row, type) {
  return getBreaks(row).find((breakRow) => breakRow.break_type === type) || null;
}

function formatLunchSummary(row) {
  const latestTimecard = row.latest_timecard || null;
  const lunchBreak = getBreakByType(row, 'lunch');
  const lunchMinutes = Number(row.lunch_minutes || 0);
  const workedHours = Number(row.worked_hours || 0);

  if (!latestTimecard) {
    return 'Not yet';
  }

  if (lunchBreak?.started_at && !lunchBreak?.ended_at) {
    return 'Started';
  }

  if (lunchMinutes <= 0) {
    if (!latestTimecard.clock_out) {
      return workedHours >= 6 ? 'Missing' : 'Not yet';
    }

    return workedHours >= 6 ? 'Missing' : 'Not required';
  }

  if (lunchMinutes < 30 && workedHours >= 6) {
    return 'Under 30 min';
  }

  return formatMinutes(lunchMinutes);
}

function formatClockOutSummary(row, selectedDate) {
  const latestTimecard = row.latest_timecard || null;

  if (!latestTimecard?.clock_in) {
    return 'Not yet';
  }

  if (latestTimecard.clock_out) {
    return formatShortTime(latestTimecard.clock_out);
  }

  return selectedDate === getTodayString() ? 'Active' : 'Missing';
}

function formatTimelineBreak(row, type, missingLabel = 'Missing') {
  const breakRow = type === 'lunch'
    ? getBreakByType(row, 'lunch')
    : getBreaks(row).find((item) => item.break_type !== 'lunch') || null;

  if (breakRow?.started_at && breakRow?.ended_at) {
    return `${formatShortTime(breakRow.started_at)} to ${formatShortTime(breakRow.ended_at)}, ${formatMinutes(getBreakDurationMinutes(breakRow))}`;
  }

  if (breakRow?.started_at) {
    return `${formatShortTime(breakRow.started_at)} to not ended`;
  }

  if (type === 'lunch') {
    return formatLunchSummary(row) === 'Not yet' ? 'Not yet' : missingLabel;
  }

  return missingLabel;
}

function formatShiftSummary(row, selectedDate) {
  const latestTimecard = row.latest_timecard || null;

  if (!latestTimecard?.clock_in) {
    return 'Not started';
  }

  const start = formatShortTime(latestTimecard.clock_in);

  if (latestTimecard.clock_out) {
    return `${start} to ${formatShortTime(latestTimecard.clock_out)}`;
  }

  return `${start} to ${selectedDate === getTodayString() ? 'active' : 'missing'}`;
}

function formatAssignment(row) {
  const routeName = row.assigned_route?.work_area_name || row.latest_timecard?.route_name || null;
  const vehicleName = row.assigned_route?.vehicle_name || null;

  if (!routeName && !vehicleName) {
    return 'No assigned route';
  }

  if (routeName && vehicleName) {
    return (
      <>
        <span>Route {routeName}</span>
        <small>{vehicleName}</small>
      </>
    );
  }

  return routeName ? `Route ${routeName}` : vehicleName;
}

function getRestMinutes(row) {
  return Math.max(0, Number(row?.break_minutes || 0) - Number(row?.lunch_minutes || 0));
}

function getBreakDurationMinutes(breakRow) {
  if (breakRow?.minutes !== null && breakRow?.minutes !== undefined) {
    return Number(breakRow.minutes || 0);
  }

  if (!breakRow?.started_at || !breakRow?.ended_at) {
    return 0;
  }

  const start = new Date(breakRow.started_at).getTime();
  const end = new Date(breakRow.ended_at).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return Math.round((end - start) / (1000 * 60));
}

function getDatePairMinutes(startValue, endValue) {
  if (!startValue || !endValue) {
    return null;
  }

  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  return Math.round((end - start) / (1000 * 60));
}

function getLaborReview(row, selectedDate) {
  const latestTimecard = row.latest_timecard || null;
  const hasAssignment = Boolean(row.assigned_route);
  const isToday = selectedDate === getTodayString();
  const lunchBreak = getBreakByType(row, 'lunch');
  const lunchMinutes = Number(row.lunch_minutes || 0);
  const workedHours = Number(row.worked_hours || 0);
  const warnings = [];

  if (row.approval_status === 'approved') {
    return {
      label: 'Approved',
      tone: 'active',
      needsReview: false,
      warnings,
      action: 'View'
    };
  }

  if (!latestTimecard) {
    if (hasAssignment) {
      warnings.push('Assigned route but never clocked in.');
    } else {
      warnings.push('Labor record needs manager review.');
    }

    return {
      label: hasAssignment ? 'Assigned, Not Started' : 'Needs Review',
      tone: 'warning',
      needsReview: true,
      warnings,
      action: hasAssignment ? 'Review' : 'Resolve'
    };
  }

  if (!hasAssignment && latestTimecard.clock_in) {
    warnings.push('Driver clocked in without an assigned route.');
  }

  if (!latestTimecard.clock_out) {
    if (!isToday) {
      warnings.push('Clock out is missing.');
    }
  }

  if (workedHours >= 14) {
    warnings.push('Shift is unusually long.');
  }

  if (lunchBreak?.started_at && !lunchBreak?.ended_at) {
    warnings.push('Lunch started but was not ended.');
  } else if (workedHours >= 6 && lunchMinutes <= 0) {
    warnings.push('Lunch is missing.');
  } else if (workedHours >= 6 && lunchMinutes < 30) {
    warnings.push('Lunch is under 30 minutes.');
  }

  if (!latestTimecard.clock_out && !warnings.length) {
    return {
      label: 'In Progress',
      tone: 'info',
      needsReview: false,
      warnings,
      action: 'View'
    };
  }

  if (warnings.length) {
    let label = 'Needs Review';
    if (warnings.some((warning) => warning.includes('without an assigned route'))) label = 'Clocked In Without Route';
    if (warnings.some((warning) => warning.includes('Clock out'))) label = 'Missing Clock Out';
    if (warnings.some((warning) => warning.includes('never clocked in'))) label = 'Assigned, Not Started';
    if (warnings.some((warning) => warning.includes('unusually long'))) label = 'Shift Unusually Long';
    if (warnings.some((warning) => warning.includes('not ended'))) label = 'Lunch Started But Not Ended';
    if (warnings.some((warning) => warning.includes('Lunch is missing'))) label = 'Missing Lunch';
    if (warnings.some((warning) => warning.includes('under 30'))) label = 'Lunch Under 30 Minutes';

    return {
      label,
      tone: 'warning',
      needsReview: true,
      warnings,
      action: 'Resolve'
    };
  }

  return {
    label: 'Complete',
    tone: 'active',
    needsReview: false,
    warnings,
    action: 'Approve'
  };
}

function getLaborRecordRows({ laborRows, routes }) {
  const rowsByDriverId = new Map();
  const assignedRoutesByDriverId = new Map();

  (routes || []).forEach((route) => {
    if (!route.driver_id) {
      return;
    }

    if (!assignedRoutesByDriverId.has(route.driver_id)) {
      assignedRoutesByDriverId.set(route.driver_id, route);
    }
  });

  (laborRows || []).forEach((row) => {
    const hasLaborActivity = Boolean(row.latest_timecard) || Number(row.shift_count || 0) > 0;
    const hasManagerRecord = Boolean(row.adjustments?.length);
    const assignedRoute = assignedRoutesByDriverId.get(row.driver_id) || null;

    if (!assignedRoute && !hasLaborActivity && !hasManagerRecord) {
      return;
    }

    rowsByDriverId.set(row.driver_id, {
      ...row,
      assigned_route: assignedRoute,
      approval_status: row.approval_status || null
    });
  });

  return [...rowsByDriverId.values()].sort((a, b) => {
    const aRoute = a.assigned_route?.work_area_name || a.latest_timecard?.route_name || '';
    const bRoute = b.assigned_route?.work_area_name || b.latest_timecard?.route_name || '';

    if (aRoute && bRoute && aRoute !== bRoute) {
      return String(aRoute).localeCompare(String(bRoute), undefined, { numeric: true });
    }

    return String(a.driver_name || '').localeCompare(String(b.driver_name || ''));
  });
}

function summarizeLaborState(state) {
  const timecard = state?.timecard || {};
  const breaks = state?.breaks || [];
  const lunchMinutes = breaks
    .filter((breakRow) => breakRow.break_type === 'lunch')
    .reduce((sum, breakRow) => sum + getBreakDurationMinutes(breakRow), 0);
  const restMinutes = breaks
    .filter((breakRow) => breakRow.break_type !== 'lunch')
    .reduce((sum, breakRow) => sum + getBreakDurationMinutes(breakRow), 0);

  return [
    `Clock in: ${formatShortTime(timecard.clock_in)}`,
    `Clock out: ${formatShortTime(timecard.clock_out)}`,
    `Lunch: ${formatMinutes(lunchMinutes)}`,
    `Rest break: ${formatMinutes(restMinutes)}`
  ].join(' · ');
}

function getBreakStateByType(state, type) {
  return (state?.breaks || []).find((breakRow) => breakRow.break_type === type) || null;
}

function getAuditFieldChanges(beforeState, afterState) {
  const fields = [
    {
      label: 'Clock in',
      before: beforeState?.timecard?.clock_in,
      after: afterState?.timecard?.clock_in,
      formatter: formatDateTime
    },
    {
      label: 'Clock out',
      before: beforeState?.timecard?.clock_out,
      after: afterState?.timecard?.clock_out,
      formatter: formatDateTime
    },
    {
      label: 'Lunch start',
      before: getBreakStateByType(beforeState, 'lunch')?.started_at,
      after: getBreakStateByType(afterState, 'lunch')?.started_at,
      formatter: formatDateTime
    },
    {
      label: 'Lunch end',
      before: getBreakStateByType(beforeState, 'lunch')?.ended_at,
      after: getBreakStateByType(afterState, 'lunch')?.ended_at,
      formatter: formatDateTime
    },
    {
      label: 'Rest break start',
      before: getBreakStateByType(beforeState, 'rest')?.started_at,
      after: getBreakStateByType(afterState, 'rest')?.started_at,
      formatter: formatDateTime
    },
    {
      label: 'Rest break end',
      before: getBreakStateByType(beforeState, 'rest')?.ended_at,
      after: getBreakStateByType(afterState, 'rest')?.ended_at,
      formatter: formatDateTime
    }
  ];

  return fields
    .filter((field) => String(field.before || '') !== String(field.after || ''))
    .map((field) => ({
      label: field.label,
      before: field.formatter(field.before),
      after: field.formatter(field.after)
    }));
}

function getCorrectionActions(review) {
  const actions = [];

  if (review.warnings.some((warning) => warning.includes('Lunch'))) {
    actions.push('Resolve missing lunch');
  }

  if (review.warnings.some((warning) => warning.includes('Clock out'))) {
    actions.push('Add clock out');
  }

  actions.push('Edit full record');
  actions.push('Add manager note');

  if (!review.needsReview) {
    actions.push('Approve record');
  }

  return actions;
}

function getCorrectionFields(modeTitle) {
  switch (modeTitle) {
    case 'Resolve missing lunch':
      return ['lunch_start', 'lunch_end'];
    case 'Add clock out':
      return ['clock_out'];
    case 'Add manager note':
    case 'Approve record':
      return [];
    case 'Edit full record':
    default:
      return ['clock_in', 'lunch_start', 'lunch_end', 'rest_break_start', 'rest_break_end', 'clock_out'];
  }
}

const emptyLaborForm = {
  driver_id: '',
  driver_name: '',
  clock_in: '',
  clock_out: '',
  lunch_start: '',
  lunch_end: '',
  rest_break_start: '',
  rest_break_end: '',
  break_minutes: '0',
  lunch_minutes: '0',
  adjustment_reason: ''
};

export default function RecordsPage() {
  const queryClient = useQueryClient();
  const { selectedCsaId } = useSelectedCsa();
  const [selectedDate, setSelectedDate] = useState(loadStoredOperationsDate() || getTodayString());
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [drawerMode, setDrawerMode] = useState('view');
  const [correctionModeTitle, setCorrectionModeTitle] = useState('Edit correction');
  const [laborForm, setLaborForm] = useState(emptyLaborForm);
  const [laborErrorMessage, setLaborErrorMessage] = useState('');
  const [showAllAttention, setShowAllAttention] = useState(false);

  function handleDateChange(nextDate) {
    setSelectedDate(nextDate);
    saveStoredOperationsDate(nextDate);
    setShowAllAttention(false);
  }

  const recordsQuery = useQuery({
    queryKey: ['manager-records', selectedCsaId, selectedDate],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/records', {
        params: {
          date: selectedDate
        }
      });
      return response.data || null;
    }
  });

  const liveLaborQuery = useQuery({
    queryKey: ['manager-live-labor', selectedCsaId, selectedDate],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/timecards/live', {
        params: {
          date: selectedDate
        }
      });
      return response.data || null;
    }
  });

  const recentDays = useMemo(() => recordsQuery.data?.recent_days || [], [recordsQuery.data?.recent_days]);
  const routes = useMemo(() => recordsQuery.data?.routes || [], [recordsQuery.data?.routes]);
  const adjustments = useMemo(() => recordsQuery.data?.adjustments || [], [recordsQuery.data?.adjustments]);
  const laborRows = useMemo(() => liveLaborQuery.data?.drivers || [], [liveLaborQuery.data?.drivers]);
  const laborRecordRows = useMemo(
    () => getLaborRecordRows({ laborRows, routes }),
    [laborRows, routes]
  );
  const selectedLaborRow = useMemo(
    () => laborRecordRows.find((row) => row.driver_id === selectedDriverId) || null,
    [laborRecordRows, selectedDriverId]
  );
  const laborReviews = useMemo(
    () => laborRecordRows.map((row) => ({ row, review: getLaborReview(row, selectedDate) })),
    [laborRecordRows, selectedDate]
  );
  const assignedDriverCount = laborRecordRows.filter((row) => row.assigned_route).length;
  const clockedInCount = laborRecordRows.filter((row) => row.latest_timecard?.clock_in).length;
  const attentionRows = laborReviews.filter(({ review }) => review.needsReview && review.warnings.length);
  const needsReviewCount = attentionRows.length;
  const approvedCount = laborReviews.filter(({ review }) => review.label === 'Approved').length;
  const visibleAttentionRows = showAllAttention ? attentionRows : attentionRows.slice(0, 5);

  const updateLabor = useMutation({
    mutationFn: async () => {
      const editedLunchMinutes = getDatePairMinutes(laborForm.lunch_start, laborForm.lunch_end);
      const editedRestMinutes = getDatePairMinutes(laborForm.rest_break_start, laborForm.rest_break_end);
      const response = await api.put('/manager/timecards/live', {
        date: selectedDate,
        driver_id: laborForm.driver_id,
        clock_in: localInputToIso(laborForm.clock_in),
        clock_out: localInputToIso(laborForm.clock_out),
        lunch_start: localInputToIso(laborForm.lunch_start),
        lunch_end: localInputToIso(laborForm.lunch_end),
        rest_break_start: localInputToIso(laborForm.rest_break_start),
        rest_break_end: localInputToIso(laborForm.rest_break_end),
        break_minutes: editedRestMinutes ?? Number(laborForm.break_minutes || 0),
        lunch_minutes: editedLunchMinutes ?? Number(laborForm.lunch_minutes || 0),
        adjustment_reason: laborForm.adjustment_reason.trim()
      });
      return response.data || null;
    },
    onSuccess: () => {
      setLaborErrorMessage('');
      setLaborForm((current) => ({ ...current, adjustment_reason: '' }));
      setDrawerMode('view');
      setCorrectionModeTitle('Edit correction');
      queryClient.invalidateQueries({ queryKey: ['manager-live-labor', selectedCsaId, selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['manager-records', selectedCsaId, selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['manager-daily-labor', selectedCsaId, selectedDate] });
    },
    onError: (error) => {
      setLaborErrorMessage(error.response?.data?.error || 'Unable to update labor record.');
    }
  });

  function openLaborReview(row) {
    const latestTimecard = row.latest_timecard || null;
    const lunchBreak = getBreakByType(row, 'lunch');
    const restBreak = getBreaks(row).find((breakRow) => breakRow.break_type !== 'lunch') || null;
    setSelectedDriverId(row.driver_id);
    setDrawerMode('view');
    setCorrectionModeTitle('Edit correction');
    setLaborErrorMessage('');
    setLaborForm({
      driver_id: row.driver_id,
      driver_name: row.driver_name,
      clock_in: formatDateTimeLocalInput(latestTimecard?.clock_in),
      clock_out: formatDateTimeLocalInput(latestTimecard?.clock_out),
      lunch_start: formatDateTimeLocalInput(lunchBreak?.started_at),
      lunch_end: formatDateTimeLocalInput(lunchBreak?.ended_at),
      rest_break_start: formatDateTimeLocalInput(restBreak?.started_at),
      rest_break_end: formatDateTimeLocalInput(restBreak?.ended_at),
      break_minutes: String(getRestMinutes(row)),
      lunch_minutes: String(row.lunch_minutes ?? 0),
      adjustment_reason: ''
    });
  }

  function closeLaborReview() {
    setSelectedDriverId('');
    setDrawerMode('view');
    setCorrectionModeTitle('Edit correction');
    setLaborForm(emptyLaborForm);
    setLaborErrorMessage('');
  }

  function startCorrectionMode(actionLabel) {
    setDrawerMode('edit');
    setCorrectionModeTitle(actionLabel);
    setLaborErrorMessage('');

    if (actionLabel === 'Add manager note') {
      setLaborForm((current) => ({ ...current, adjustment_reason: '' }));
    }

    if (actionLabel === 'Approve record') {
      setLaborForm((current) => ({ ...current, adjustment_reason: 'Manager approved record.' }));
    }
  }

  function updateLaborField(field, value) {
    setLaborForm((current) => ({ ...current, [field]: value }));
  }

  function handleLaborSubmit(event) {
    event.preventDefault();
    setLaborErrorMessage('');

    if (!laborForm.clock_in) {
      setLaborErrorMessage('Clock in time is required.');
      return;
    }

    if (!laborForm.adjustment_reason.trim()) {
      setLaborErrorMessage('A reason is required for manager corrections.');
      return;
    }

    if (laborForm.clock_out) {
      const clockInIso = localInputToIso(laborForm.clock_in);
      const clockOutIso = localInputToIso(laborForm.clock_out);

      if (!clockInIso || !clockOutIso) {
        setLaborErrorMessage('Clock in and clock out must be valid datetimes.');
        return;
      }

      if (new Date(clockOutIso).getTime() <= new Date(clockInIso).getTime()) {
        setLaborErrorMessage('Clock out must be later than clock in.');
        return;
      }
    }

    const visibleCorrectionFields = getCorrectionFields(correctionModeTitle);

    if (correctionModeTitle === 'Resolve missing lunch' && (!laborForm.lunch_start || !laborForm.lunch_end)) {
      setLaborErrorMessage('Lunch start and lunch end are required to resolve missing lunch.');
      return;
    }

    if (correctionModeTitle === 'Add clock out' && !laborForm.clock_out) {
      setLaborErrorMessage('Clock out is required to resolve missing clock out.');
      return;
    }

    const pairedDateFields = [
      ['lunch_start', 'lunch_end', 'Lunch start and lunch end must both be filled in.'],
      ['rest_break_start', 'rest_break_end', 'Rest break start and rest break end must both be filled in.']
    ].filter(([startField, endField]) => visibleCorrectionFields.includes(startField) || visibleCorrectionFields.includes(endField));

    for (const [startField, endField, message] of pairedDateFields) {
      if ((laborForm[startField] && !laborForm[endField]) || (!laborForm[startField] && laborForm[endField])) {
        setLaborErrorMessage(message);
        return;
      }

      if (laborForm[startField] && laborForm[endField]) {
        const startIso = localInputToIso(laborForm[startField]);
        const endIso = localInputToIso(laborForm[endField]);

        if (!startIso || !endIso) {
          setLaborErrorMessage(message.replace('filled in', 'valid datetimes'));
          return;
        }

        if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
          setLaborErrorMessage(message.replace('must both be filled in', 'end must be later than start'));
          return;
        }
      }
    }

    updateLabor.mutate();
  }

  const selectedLaborReview = selectedLaborRow ? getLaborReview(selectedLaborRow, selectedDate) : null;
  const visibleCorrectionFields = getCorrectionFields(correctionModeTitle);
  const correctionReasonEntered = Boolean(laborForm.adjustment_reason.trim());
  const timeInputMin = `${selectedDate}T00:00`;
  const timeInputMax = `${selectedDate}T23:59`;
  const timeInputPlaceholder = `Select a time on ${formatDisplayDate(selectedDate)}`;

  return (
    <section className="page-section records-page">
      <PageHeader
        title="Records"
        description="Review historical driver labor, finalized daily records, route history, and manager corrections."
        actions={(
          <label className="weekly-date-picker records-date-picker">
            <span className="field-label">Selected Day</span>
            <input
              className="date-field"
              max={getTodayString()}
              min={recordsQuery.data?.range_start || ''}
              onChange={(event) => handleDateChange(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </label>
        )}
      />

      <div className="records-layout">
        <div className="card records-sidebar">
          <div>
            <div className="card-title">Last 30 Days</div>
            <div className="driver-meta">Select a day to review route and labor records.</div>
          </div>
          <div className="records-day-list">
            {recentDays.map((day) => (
              <button
                className={`records-day-button${selectedDate === day.date ? ' active' : ''}`}
                key={day.date}
                onClick={() => handleDateChange(day.date)}
                type="button"
              >
                <strong>{formatDisplayDate(day.date)}</strong>
                <span>{day.route_count} routes</span>
                <span>{day.adjustment_count} corrections</span>
              </button>
            ))}
          </div>
        </div>

        <div className="records-main">
          <div className="card records-daily-summary-card">
            <div className="section-title-row">
              <div>
                <div className="card-title">{formatDisplayDate(selectedDate)}</div>
                <div className="driver-meta">Daily Summary</div>
              </div>
            </div>

            {recordsQuery.isLoading ? (
              <div className="driver-meta">Loading records...</div>
            ) : recordsQuery.isError ? (
              <div className="error-banner">Unable to load records.</div>
            ) : (
              <>
                <div className="records-summary-grid records-labor-summary-grid">
                  <StatCard label="Assigned Drivers" value={assignedDriverCount} detail="Routes assigned today" />
                  <StatCard label="Clocked In" value={clockedInCount} detail="Drivers with clock activity" tone={clockedInCount ? 'info' : 'default'} />
                  <StatCard label="Needs Review" value={needsReviewCount} detail="Records needing manager action" tone={needsReviewCount ? 'warning' : 'default'} />
                  <StatCard label="Approved" value={approvedCount} detail="Reviewed records" tone={approvedCount ? 'active' : 'default'} />
                </div>

                {attentionRows.length ? (
                  <div className="records-labor-alert">
                    <strong>{attentionRows.length} driver{attentionRows.length === 1 ? '' : 's'} need attention</strong>
                    <div className="records-attention-chip-list">
                      {visibleAttentionRows.map(({ row, review }) => (
                        <button
                          className="records-attention-chip"
                          key={row.driver_id}
                          onClick={() => openLaborReview(row)}
                          type="button"
                        >
                          {row.driver_name}: {review.label}
                        </button>
                      ))}
                      {!showAllAttention && attentionRows.length > 5 ? (
                        <button className="records-attention-view-all" onClick={() => setShowAllAttention(true)} type="button">
                          View all needs review
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  null
                )}
              </>
            )}
          </div>

          <div className="card records-history-card">
            <div className="section-title-row">
              <div>
                <div className="card-title">Driver Labor Records</div>
                <div className="driver-meta">Daily labor review, corrections, and finalized record source for {selectedDate}.</div>
              </div>
            </div>

            {liveLaborQuery.isLoading ? (
              <div className="driver-meta">Loading driver labor records...</div>
            ) : liveLaborQuery.isError ? (
              <div className="error-banner">Unable to load driver labor records.</div>
            ) : laborRecordRows.length ? (
              <div className="records-labor-table">
                <div className="records-labor-table-header">
                  <span>Status</span>
                  <span>Driver</span>
                  <span>Assignment</span>
                  <span>Shift</span>
                  <span>Lunch</span>
                  <span>Action</span>
                </div>
                {laborReviews.map(({ row, review }) => {
                  return (
                    <button className="records-labor-table-row" key={row.driver_id} onClick={() => openLaborReview(row)} type="button">
                      <span><StatusBadge tone={review.tone}>{review.label}</StatusBadge></span>
                      <strong>{row.driver_name}</strong>
                      <span>{formatAssignment(row)}</span>
                      <span>{formatShiftSummary(row, selectedDate)}</span>
                      <span>{formatLunchSummary(row)}</span>
                      <span>
                        <span className="secondary-inline-button records-row-action">
                          {review.action}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="labor-empty-state records-labor-empty-state">
                <strong>No driver labor records yet for this day.</strong>
                <span>Labor records will appear when routes are assigned, drivers clock in, or a manager creates a record.</span>
              </div>
            )}
          </div>

          <div className="card records-history-card">
            <div className="section-title-row">
              <div>
                <div className="card-title">Route History</div>
                <div className="driver-meta">All routes recorded for {selectedDate}, including archived ones.</div>
              </div>
            </div>

            {routes.length ? (
              <div className="records-route-table">
                <div className="records-route-table-header">
                  <span>Route</span>
                  <span>Driver</span>
                  <span>Vehicle</span>
                  <span>Stops</span>
                  <span>Source</span>
                  <span>Status</span>
                </div>
                {routes.map((route) => (
                  <div className="records-route-table-row" key={route.id}>
                    <div className="records-route-primary">
                      <strong>Route {route.work_area_name}</strong>
                      <span>SA#: {route.sa_number || '—'} · {route.contractor_name || 'No contractor'}</span>
                    </div>
                    <span>{route.driver_name || 'No driver assigned'}</span>
                    <span>{route.vehicle_name || 'No vehicle assigned'}</span>
                    <span>{route.completed_stops || 0} / {route.total_stops || 0}</span>
                    <span>{route.source || 'manual'}</span>
                    <StatusBadge tone={route.archived_at ? 'neutral' : 'active'}>
                      {route.archived_at ? 'Archived' : route.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="labor-empty-state">No routes recorded for this day.</div>
            )}
          </div>

          <div className="card">
            <div className="section-title-row">
              <div>
                <div className="card-title">Manager Corrections</div>
                <div className="driver-meta">Edit history log for labor corrections made on {selectedDate}.</div>
              </div>
            </div>

            {adjustments.length ? (
              <div className="labor-audit-list">
                {adjustments.map((adjustment) => (
                  <div className="labor-audit-card" key={adjustment.id}>
                    <strong>{adjustment.driver_name} · {formatDateTime(adjustment.created_at)}</strong>
                    <span>{adjustment.adjustment_reason}</span>
                    <small>Driver: {adjustment.driver_name}</small>
                    <small>Date: {formatDisplayDate(adjustment.work_date || selectedDate)}</small>
                    <small>Manager: {adjustment.manager_user_id ? `ID ${String(adjustment.manager_user_id).slice(0, 8)}` : 'Recorded manager'}</small>
                    {getAuditFieldChanges(adjustment.before_state, adjustment.after_state).length ? (
                      getAuditFieldChanges(adjustment.before_state, adjustment.after_state).map((change) => (
                        <small key={`${adjustment.id}-${change.label}`}>
                          {change.label}: {change.before} → {change.after}
                        </small>
                      ))
                    ) : (
                      <>
                        <small>Original: {summarizeLaborState(adjustment.before_state)}</small>
                        <small>New: {summarizeLaborState(adjustment.after_state)}</small>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="labor-empty-state">No manager corrections recorded for this day.</div>
            )}
          </div>
        </div>
      </div>

      {selectedLaborRow ? (
        <div className="records-review-backdrop" role="presentation">
          <aside aria-label={`${selectedLaborRow.driver_name} labor record`} className="records-review-drawer">
            <div className="records-review-header">
              <div>
                <h2>{selectedLaborRow.driver_name}</h2>
                <p>{formatDisplayDate(selectedDate)}</p>
                <p>{formatAssignment(selectedLaborRow)}</p>
              </div>
              <StatusBadge className="records-review-status-chip" tone={selectedLaborReview?.tone || 'neutral'}>
                {selectedLaborReview?.label || 'Record'}
              </StatusBadge>
              <button aria-label="Close labor review" className="drawer-close-button" onClick={closeLaborReview} type="button">
                ×
              </button>
            </div>

            {drawerMode === 'view' ? (
              <>
                <div className="records-review-scroll">
                  <div className="records-review-section">
                    <div className="card-title">Timeline</div>
                    <div className="records-timeline-list">
                      <div><span>Clock in</span><strong>{formatShortTime(selectedLaborRow.latest_timecard?.clock_in)}</strong></div>
                      <div><span>Lunch</span><strong>{formatTimelineBreak(selectedLaborRow, 'lunch')}</strong></div>
                      <div><span>Rest break</span><strong>{formatTimelineBreak(selectedLaborRow, 'rest')}</strong></div>
                      <div><span>Clock out</span><strong>{formatClockOutSummary(selectedLaborRow, selectedDate)}</strong></div>
                    </div>
                  </div>

                  {selectedLaborReview?.warnings.length ? (
                    <div className="records-review-section">
                      <div className="card-title">Warnings</div>
                      <div className="labor-flag-list">
                        {selectedLaborReview.warnings.map((warning) => (
                          <span className="labor-flag-chip" key={warning}>{warning}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="records-review-section">
                    <div className="card-title">Manager actions</div>
                    <div className="records-action-list">
                      {getCorrectionActions(selectedLaborReview).map((action) => (
                        <button className="secondary-button" key={action} onClick={() => startCorrectionMode(action)} type="button">
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="records-review-section">
                    <div className="card-title">Correction history</div>
                    {selectedLaborRow.adjustments?.length ? (
                      <div className="labor-audit-list">
                        {selectedLaborRow.adjustments.map((adjustment) => (
                          <div className="labor-audit-card" key={adjustment.id}>
                            <strong>{formatDateTime(adjustment.created_at)}</strong>
                            <span>{adjustment.adjustment_reason}</span>
                            <small>Driver: {selectedLaborRow.driver_name}</small>
                            <small>Date: {formatDisplayDate(adjustment.work_date || selectedDate)}</small>
                            <small>Manager: {adjustment.manager_user_id ? `ID ${String(adjustment.manager_user_id).slice(0, 8)}` : 'Recorded manager'}</small>
                            {getAuditFieldChanges(adjustment.before_state, adjustment.after_state).length ? (
                              getAuditFieldChanges(adjustment.before_state, adjustment.after_state).map((change) => (
                                <small key={`${adjustment.id}-${change.label}`}>
                                  {change.label}: {change.before} → {change.after}
                                </small>
                              ))
                            ) : (
                              <>
                                <small>Original: {summarizeLaborState(adjustment.before_state)}</small>
                                <small>New: {summarizeLaborState(adjustment.after_state)}</small>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="labor-empty-state">No manager edits recorded yet.</div>
                    )}
                  </div>
                </div>

                <div className="records-review-actions">
                  <button className="secondary-button" onClick={closeLaborReview} type="button">Close</button>
                  <button className="secondary-button" onClick={() => startCorrectionMode('Edit full record')} type="button">Edit record</button>
                  <button className="primary-button" onClick={() => startCorrectionMode('Approve record')} type="button">Approve record</button>
                </div>
              </>
            ) : (
              <form className="records-review-form-shell" onSubmit={handleLaborSubmit}>
                <div className="records-review-scroll">
                  <div className="records-review-section records-correction-form">
                    <div>
                      <div className="card-title">{correctionModeTitle}</div>
                      <div className="driver-meta">Missing time fields stay blank. Corrections are limited to {formatDisplayDate(selectedDate)}.</div>
                    </div>

                    <div className="records-correction-grid full-width">
                      {visibleCorrectionFields.includes('clock_in') ? (
                        <label className="form-field">
                          <span>Clock in</span>
                          <input
                            max={timeInputMax}
                            min={timeInputMin}
                            onChange={(event) => updateLaborField('clock_in', event.target.value)}
                            placeholder={timeInputPlaceholder}
                            type="datetime-local"
                            value={laborForm.clock_in}
                          />
                        </label>
                      ) : null}
                      {visibleCorrectionFields.includes('lunch_start') ? (
                        <label className="form-field">
                          <span>Lunch start</span>
                          <input
                            max={timeInputMax}
                            min={timeInputMin}
                            onChange={(event) => updateLaborField('lunch_start', event.target.value)}
                            placeholder={timeInputPlaceholder}
                            type="datetime-local"
                            value={laborForm.lunch_start}
                          />
                        </label>
                      ) : null}
                      {visibleCorrectionFields.includes('lunch_end') ? (
                        <label className="form-field">
                          <span>Lunch end</span>
                          <input
                            max={timeInputMax}
                            min={timeInputMin}
                            onChange={(event) => updateLaborField('lunch_end', event.target.value)}
                            placeholder={timeInputPlaceholder}
                            type="datetime-local"
                            value={laborForm.lunch_end}
                          />
                        </label>
                      ) : null}
                      {visibleCorrectionFields.includes('rest_break_start') ? (
                        <label className="form-field">
                          <span>Rest break start</span>
                          <input
                            max={timeInputMax}
                            min={timeInputMin}
                            onChange={(event) => updateLaborField('rest_break_start', event.target.value)}
                            placeholder={timeInputPlaceholder}
                            type="datetime-local"
                            value={laborForm.rest_break_start}
                          />
                        </label>
                      ) : null}
                      {visibleCorrectionFields.includes('rest_break_end') ? (
                        <label className="form-field">
                          <span>Rest break end</span>
                          <input
                            max={timeInputMax}
                            min={timeInputMin}
                            onChange={(event) => updateLaborField('rest_break_end', event.target.value)}
                            placeholder={timeInputPlaceholder}
                            type="datetime-local"
                            value={laborForm.rest_break_end}
                          />
                        </label>
                      ) : null}
                      {visibleCorrectionFields.includes('clock_out') ? (
                        <label className="form-field">
                          <span>Clock out</span>
                          <input
                            max={timeInputMax}
                            min={timeInputMin}
                            onChange={(event) => updateLaborField('clock_out', event.target.value)}
                            placeholder={timeInputPlaceholder}
                            type="datetime-local"
                            value={laborForm.clock_out}
                          />
                        </label>
                      ) : null}
                    </div>
                    {visibleCorrectionFields.length ? null : (
                      <div className="records-note-only-callout">
                        This action records a manager note in the correction history.
                      </div>
                    )}
                    <label className="form-field">
                      <span>Reason for correction</span>
                      <textarea
                        onChange={(event) => updateLaborField('adjustment_reason', event.target.value)}
                        placeholder="A reason is required for manager corrections."
                        rows="3"
                        value={laborForm.adjustment_reason}
                      />
                    </label>

                    {laborErrorMessage ? <div className="error-banner">{laborErrorMessage}</div> : null}
                  </div>
                </div>

                <div className="records-review-actions">
                  <button className="secondary-button" onClick={() => setDrawerMode('view')} type="button">Cancel</button>
                  <button className="primary-button" disabled={updateLabor.isPending || !correctionReasonEntered} type="submit">
                    {updateLabor.isPending ? 'Saving...' : 'Save correction'}
                  </button>
                </div>
              </form>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
