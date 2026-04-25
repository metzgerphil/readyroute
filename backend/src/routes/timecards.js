const express = require('express');

const defaultSupabase = require('../lib/supabase');
const { requireDriver } = require('../middleware/auth');

function getUtcTimestamp() {
  return new Date().toISOString();
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

function getHoursWorked(clockIn, clockOut) {
  if (!clockIn || !clockOut) {
    return null;
  }

  const elapsedMilliseconds = new Date(clockOut).getTime() - new Date(clockIn).getTime();

  if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) {
    return null;
  }

  return Number((elapsedMilliseconds / (1000 * 60 * 60)).toFixed(2));
}

function getPayableHours(workedHours, lunchMinutes) {
  return Math.max(0, Number((Number(workedHours || 0) - Number(lunchMinutes || 0) / 60).toFixed(2)));
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

async function findOpenTimecard(supabase, driverId) {
  const { data, error } = await supabase
    .from('timecards')
    .select('id, driver_id, route_id, clock_in, clock_out, hours_worked')
    .eq('driver_id', driverId)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

async function findActiveBreak(supabase, timecardId) {
  const { data, error } = await supabase
    .from('timecard_breaks')
    .select('id, break_type, started_at, ended_at')
    .eq('timecard_id', timecardId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

async function closeBreakRecord(supabase, breakRecord, endedAt) {
  if (!breakRecord?.id || !endedAt) {
    return { error: null };
  }

  const { error } = await supabase
    .from('timecard_breaks')
    .update({ ended_at: endedAt })
    .eq('id', breakRecord.id);

  return { error };
}

async function resolveActiveBreakState(supabase, timecardId, now = new Date()) {
  const { data: activeBreak, error } = await findActiveBreak(supabase, timecardId);

  if (error || !activeBreak) {
    return {
      data: activeBreak || null,
      expired_break: null,
      error
    };
  }

  const scheduledEndAt = getScheduledBreakEnd(activeBreak.started_at, activeBreak.break_type);
  const scheduledEndMs = scheduledEndAt ? new Date(scheduledEndAt).getTime() : null;
  const nowMs = now.getTime();

  if (Number.isFinite(scheduledEndMs) && nowMs >= scheduledEndMs) {
    const { error: closeError } = await closeBreakRecord(supabase, activeBreak, scheduledEndAt);

    if (closeError) {
      return {
        data: null,
        expired_break: null,
        error: closeError
      };
    }

    return {
      data: null,
      expired_break: {
        ...activeBreak,
        ended_at: scheduledEndAt,
        scheduled_end_at: scheduledEndAt,
        auto_ended: true
      },
      error: null
    };
  }

  return {
    data: {
      ...activeBreak,
      scheduled_end_at: scheduledEndAt
    },
    expired_break: null,
    error: null
  };
}

async function findRouteForDriver(supabase, { routeId, driverId, accountId }) {
  return supabase
    .from('routes')
    .select('id, account_id, date')
    .eq('id', routeId)
    .eq('driver_id', driverId)
    .eq('account_id', accountId)
    .maybeSingle();
}

async function finalizeLaborDayIfComplete({ supabase, accountId, routeId, now = new Date() }) {
  const { data: route, error: routeError } = await supabase
    .from('routes')
    .select('id, date, account_id')
    .eq('id', routeId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (routeError) {
    return { error: routeError };
  }

  if (!route?.date) {
    return { finalized: false };
  }

  const { data: dayRoutes, error: dayRoutesError } = await supabase
    .from('routes')
    .select('id')
    .eq('account_id', accountId)
    .eq('date', route.date);

  if (dayRoutesError) {
    return { error: dayRoutesError };
  }

  const routeIds = (dayRoutes || []).map((dayRoute) => dayRoute.id);

  if (!routeIds.length) {
    return { finalized: false };
  }

  const { data: openTimecards, error: openTimecardsError } = await supabase
    .from('timecards')
    .select('id, route_id')
    .in('route_id', routeIds)
    .is('clock_out', null);

  if (openTimecardsError) {
    return { error: openTimecardsError };
  }

  if ((openTimecards || []).length > 0) {
    return { finalized: false };
  }

  const { data: drivers, error: driversError } = await supabase
    .from('drivers')
    .select('id, name, email, hourly_rate, is_active')
    .eq('account_id', accountId)
    .order('name');

  if (driversError) {
    return { error: driversError };
  }

  const driverIds = (drivers || []).map((driver) => driver.id);
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
          const workedHours = getHoursWorked(timecard.clock_in, timecard.clock_out) ?? Number(timecard.hours_worked || 0);
          const totalBreakMinutes = timecardBreaks.reduce(
            (sum, breakRow) => sum + getBreakMinutes(breakRow.started_at, breakRow.ended_at, now),
            0
          );
          const lunchMinutes = timecardBreaks
            .filter((breakRow) => breakRow.break_type === 'lunch')
            .reduce((sum, breakRow) => sum + getBreakMinutes(breakRow.started_at, breakRow.ended_at, now), 0);
          const payableHours = getPayableHours(workedHours, lunchMinutes);

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
        driver_name: driver.name,
        email: driver.email,
        hourly_rate: Number(driver.hourly_rate || 0),
        is_active: Boolean(driver.is_active),
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

  const finalizedAt = getUtcTimestamp();
  const { data: existingSnapshot, error: existingSnapshotError } = await supabase
    .from('daily_labor_snapshots')
    .select('id')
    .eq('account_id', accountId)
    .eq('work_date', route.date)
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
        work_date: route.date,
        finalized_at: finalizedAt,
        finalized_by_system: true,
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

  if (!snapshotId) {
    return { finalized: false };
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
          work_date: route.date,
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
    snapshot_id: snapshotId,
    work_date: route.date
  };
}

function createTimecardsRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;

  router.get('/status', requireDriver, async (req, res) => {
    try {
      const { data: activeTimecard, error: timecardError } = await findOpenTimecard(supabase, req.driver.driver_id);

      if (timecardError) {
        console.error('Timecard status lookup failed:', timecardError);
        return res.status(500).json({ error: 'Failed to load timecard status' });
      }

      let activeBreak = null;
      let expiredBreak = null;

      if (activeTimecard?.id) {
        const { data: foundBreak, expired_break: autoEndedBreak, error: breakError } = await resolveActiveBreakState(
          supabase,
          activeTimecard.id
        );

        if (breakError) {
          console.error('Break status lookup failed:', breakError);
          return res.status(500).json({ error: 'Failed to load timecard status' });
        }

        activeBreak = foundBreak || null;
        expiredBreak = autoEndedBreak || null;
      }

      return res.status(200).json({
        ok: true,
        active_timecard: activeTimecard || null,
        active_break: activeBreak,
        expired_break: expiredBreak
      });
    } catch (error) {
      console.error('Timecard status endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load timecard status' });
    }
  });

  router.post('/clock-in', requireDriver, async (req, res) => {
    const { route_id: routeId } = req.body || {};

    if (!routeId) {
      return res.status(400).json({ error: 'route_id is required' });
    }

    try {
      const { data: route, error: routeError } = await findRouteForDriver(supabase, {
        routeId,
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id
      });

      if (routeError) {
        console.error('Clock-in route lookup failed:', routeError);
        return res.status(500).json({ error: 'Failed to validate route for clock-in' });
      }

      if (!route) {
        return res.status(403).json({ error: 'Route not assigned to this driver' });
      }

      const { data: existingTimecard, error: existingTimecardError } = await findOpenTimecard(supabase, req.driver.driver_id);

      if (existingTimecardError) {
        console.error('Existing timecard lookup failed:', existingTimecardError);
        return res.status(500).json({ error: 'Failed to validate clock-in status' });
      }

      if (existingTimecard) {
        return res.status(200).json({
          ok: true,
          clock_in_at: existingTimecard.clock_in,
          timecard_id: existingTimecard.id,
          already_clocked_in: true
        });
      }

      const clockedInAt = getUtcTimestamp();
      const { data: insertedTimecard, error: insertError } = await supabase
        .from('timecards')
        .insert({
          driver_id: req.driver.driver_id,
          route_id: routeId,
          clock_in: clockedInAt
        })
        .select('id, clock_in')
        .maybeSingle();

      if (insertError) {
        console.error('Clock-in insert failed:', insertError);
        return res.status(500).json({ error: 'Failed to clock in driver' });
      }

      return res.status(201).json({
        ok: true,
        clock_in_at: insertedTimecard?.clock_in || clockedInAt,
        timecard_id: insertedTimecard?.id || null
      });
    } catch (error) {
      console.error('Clock-in endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to clock in driver' });
    }
  });

  router.post('/clock-out', requireDriver, async (req, res) => {
    try {
      const { data: activeTimecard, error: activeTimecardError } = await findOpenTimecard(supabase, req.driver.driver_id);

      if (activeTimecardError) {
        console.error('Clock-out timecard lookup failed:', activeTimecardError);
        return res.status(500).json({ error: 'Failed to clock out driver' });
      }

      if (!activeTimecard) {
        return res.status(404).json({ error: 'No active timecard found' });
      }

      const clockedOutAt = getUtcTimestamp();
      const { data: activeBreak, error: activeBreakError } = await resolveActiveBreakState(supabase, activeTimecard.id);

      if (activeBreakError) {
        console.error('Clock-out active break lookup failed:', activeBreakError);
        return res.status(500).json({ error: 'Failed to clock out driver' });
      }

      if (activeBreak?.id) {
        const { error: closeBreakError } = await closeBreakRecord(supabase, activeBreak, clockedOutAt);

        if (closeBreakError) {
          console.error('Clock-out break close failed:', closeBreakError);
          return res.status(500).json({ error: 'Failed to clock out driver' });
        }
      }

      const { error: updateError } = await supabase
        .from('timecards')
        .update({
          clock_out: clockedOutAt,
          hours_worked: getHoursWorked(activeTimecard.clock_in, clockedOutAt)
        })
        .eq('id', activeTimecard.id);

      if (updateError) {
        console.error('Clock-out update failed:', updateError);
        return res.status(500).json({ error: 'Failed to clock out driver' });
      }

      const finalizationResult = await finalizeLaborDayIfComplete({
        supabase,
        accountId: req.driver.account_id,
        routeId: activeTimecard.route_id
      });

      if (finalizationResult.error) {
        console.error('Daily labor finalization failed:', finalizationResult.error);
        return res.status(500).json({ error: 'Failed to finalize labor day' });
      }

      return res.status(200).json({
        ok: true,
        clock_out_at: clockedOutAt,
        timecard_id: activeTimecard.id,
        day_finalized: Boolean(finalizationResult.finalized),
        finalized_snapshot_id: finalizationResult.snapshot_id || null,
        finalized_work_date: finalizationResult.work_date || null
      });
    } catch (error) {
      console.error('Clock-out endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to clock out driver' });
    }
  });

  router.post('/breaks/start', requireDriver, async (req, res) => {
    const requestedType = String(req.body?.break_type || 'rest').trim().toLowerCase();
    const breakType = ['rest', 'lunch', 'other'].includes(requestedType) ? requestedType : 'rest';

    try {
      const { data: activeTimecard, error: activeTimecardError } = await findOpenTimecard(supabase, req.driver.driver_id);

      if (activeTimecardError) {
        console.error('Break start timecard lookup failed:', activeTimecardError);
        return res.status(500).json({ error: 'Failed to start break' });
      }

      if (!activeTimecard) {
        return res.status(400).json({ error: 'Clock in before starting a break' });
      }

      const { data: activeBreak, error: activeBreakError } = await resolveActiveBreakState(supabase, activeTimecard.id);

      if (activeBreakError) {
        console.error('Break start active break lookup failed:', activeBreakError);
        return res.status(500).json({ error: 'Failed to start break' });
      }

      if (activeBreak) {
        return res.status(409).json({ error: 'A break is already active' });
      }

      const startedAt = getUtcTimestamp();
      const { data: insertedBreak, error: insertError } = await supabase
        .from('timecard_breaks')
        .insert({
          account_id: req.driver.account_id,
          driver_id: req.driver.driver_id,
          route_id: activeTimecard.route_id,
          timecard_id: activeTimecard.id,
          break_type: breakType,
          started_at: startedAt
        })
        .select('id, break_type, started_at')
        .maybeSingle();

      if (insertError) {
        console.error('Break start insert failed:', insertError);
        return res.status(500).json({ error: 'Failed to start break' });
      }

      const scheduledEndAt = getScheduledBreakEnd(insertedBreak?.started_at || startedAt, breakType);

      return res.status(201).json({
        ok: true,
        active_break: {
          ...(insertedBreak || {
            id: null,
            break_type: breakType,
            started_at: startedAt
          }),
          scheduled_end_at: scheduledEndAt
        }
      });
    } catch (error) {
      console.error('Break start endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to start break' });
    }
  });

  router.post('/breaks/end', requireDriver, async (req, res) => {
    try {
      const { data: activeTimecard, error: activeTimecardError } = await findOpenTimecard(supabase, req.driver.driver_id);

      if (activeTimecardError) {
        console.error('Break end timecard lookup failed:', activeTimecardError);
        return res.status(500).json({ error: 'Failed to end break' });
      }

      if (!activeTimecard) {
        return res.status(400).json({ error: 'No active shift found' });
      }

      const { data: activeBreak, error: activeBreakError } = await resolveActiveBreakState(supabase, activeTimecard.id);

      if (activeBreakError) {
        console.error('Break end active break lookup failed:', activeBreakError);
        return res.status(500).json({ error: 'Failed to end break' });
      }

      if (!activeBreak) {
        return res.status(404).json({ error: 'No active break found' });
      }

      const endedAt = getUtcTimestamp();
      const { error: updateError } = await closeBreakRecord(supabase, activeBreak, endedAt);

      if (updateError) {
        console.error('Break end update failed:', updateError);
        return res.status(500).json({ error: 'Failed to end break' });
      }

      return res.status(200).json({
        ok: true,
        ended_break: {
          ...activeBreak,
          ended_at: endedAt
        }
      });
    } catch (error) {
      console.error('Break end endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to end break' });
    }
  });

  return router;
}

module.exports = createTimecardsRouter();
module.exports.createTimecardsRouter = createTimecardsRouter;
