const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const defaultSupabase = require('../lib/supabase');
const { requireManager } = require('../middleware/auth');
const { attachApartmentIntelligenceToStops } = require('../services/apartmentIntelligence');
const { isUsableCoordinate, summarizeCoordinateHealth } = require('../services/coordinates');
const { attachPropertyIntelToStops, savePropertyIntel } = require('../services/propertyIntel');
const { sendManagerInviteEmail: defaultSendManagerInviteEmail } = require('../services/managerInviteEmail');
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

function getCurrentDateString(now = new Date(), timeZone = process.env.APP_TIME_ZONE || 'America/Los_Angeles') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function parseIsoDateToUtcMidday(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
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
  const workedHours = getWorkedHours(timecard.clock_in, timecard.clock_out, timecard.hours_worked, now);
  const breakMinutes = (timecardBreaks || []).reduce(
    (sum, breakRow) => sum + getBreakMinutes(breakRow.started_at, breakRow.ended_at, now),
    0
  );
  const lunchMinutes = getLunchMinutes(timecardBreaks, now);
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
    breaks: (timecardBreaks || []).map((breakRow) => ({
      id: breakRow.id,
      break_type: breakRow.break_type,
      started_at: breakRow.started_at,
      ended_at: breakRow.ended_at,
      minutes: getBreakMinutes(breakRow.started_at, breakRow.ended_at, now)
    })),
    compliance_flags: getComplianceFlags({
      clockOut: timecard.clock_out,
      breaks: timecardBreaks,
      workedHours,
      lunchMinutes
    })
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

function isMissingManagerUsersTable(error) {
  return ['PGRST116', 'PGRST205', '42P01'].includes(error?.code);
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

async function getAccountManagerContext(supabase, accountId) {
  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, company_name, manager_email')
    .eq('id', accountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return account || null;
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

function isDisplayableManagerRoute(route) {
  return Boolean(String(route?.work_area_name || '').trim());
}

function getTimeCommitCounts(stops = []) {
  const timeCommitStops = (stops || []).filter((stop) => stop.has_time_commit);
  const completedStatuses = new Set(['delivered', 'attempted', 'incomplete']);
  const completed = timeCommitStops.filter((stop) => completedStatuses.has(stop.status)).length;

  return {
    total: timeCommitStops.length,
    completed
  };
}

function createPackagesByStopId(packages = []) {
  return (packages || []).reduce((map, pkg) => {
    const current = map.get(pkg.stop_id) || [];
    current.push({
      id: pkg.id,
      tracking_number: pkg.tracking_number,
      requires_signature: pkg.requires_signature,
      hazmat: pkg.hazmat
    });
    map.set(pkg.stop_id, current);
    return map;
  }, new Map());
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

function addDerivedStopFields(stop) {
  const isBusiness = detectBusinessContact(stop.contact_name, stop.address_line2, stop.stop_type);
  const isApartment = detectApartmentUnitStop({ ...stop, is_business: isBusiness });
  const secondaryAddressType = detectSecondaryAddressType(stop.address_line2);
  const unitLikeValue = extractUnitLikeValue(stop.address_line2);
  const floorLabel = extractFloorLabel(stop.address_line2);

  return {
    ...stop,
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

function createManagerRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const nowProvider = options.now || (() => new Date());
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const sendManagerInviteEmail = options.sendManagerInviteEmail || defaultSendManagerInviteEmail;

  router.get('/dashboard', requireManager, async (req, res) => {
    const today = getCurrentDateString(nowProvider());

    try {
      const { data: drivers, error: driversError } = await supabase
        .from('drivers')
        .select('id, name, is_active')
        .eq('account_id', req.account.account_id)
        .eq('is_active', true)
        .order('name');

      if (driversError) {
        console.error('Dashboard driver lookup failed:', driversError);
        return res.status(500).json({ error: 'Failed to load dashboard drivers' });
      }

      const { data: routes, error: routesError } = await supabase
        .from('routes')
        .select('id, driver_id, vehicle_id, date, status, total_stops, completed_stops, work_area_name, created_at')
        .eq('account_id', req.account.account_id)
        .eq('date', today)
        .order('id');

      if (routesError) {
        console.error('Dashboard route lookup failed:', routesError);
        return res.status(500).json({ error: 'Failed to load dashboard routes' });
      }

      const visibleRoutes = (routes || []).filter(isDisplayableManagerRoute);

      const { data: latestRouteSyncRow, error: latestRouteSyncError } = await supabase
        .from('routes')
        .select('created_at')
        .eq('account_id', req.account.account_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestRouteSyncError) {
        console.error('Dashboard latest route sync lookup failed:', latestRouteSyncError);
        return res.status(500).json({ error: 'Failed to load dashboard sync status' });
      }

      const routeIds = visibleRoutes.map((route) => route.id);
      const vehicleIds = [...new Set(visibleRoutes.map((route) => route.vehicle_id).filter(Boolean))];
      let stops = [];
      let positions = [];
      let vehicles = [];

      if (routeIds.length > 0) {
        const { data: stopRows, error: stopsError } = await supabase
          .from('stops')
          .select('id, route_id, sequence_order, status, completed_at, address, delivery_type_code, has_time_commit')
          .in('route_id', routeIds)
          .order('sequence_order');

        if (stopsError) {
          console.error('Dashboard stop lookup failed:', stopsError);
          return res.status(500).json({ error: getManifestSchemaError(stopsError) || 'Failed to load dashboard stops' });
        }

        stops = stopRows || [];

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
          .select('id, name, plate')
          .eq('account_id', req.account.account_id)
          .in('id', vehicleIds);

        if (vehiclesError) {
          console.error('Dashboard vehicle lookup failed:', vehiclesError);
          return res.status(500).json({ error: 'Failed to load dashboard vehicles' });
        }

        vehicles = vehicleRows || [];
      }

      const driverById = new Map((drivers || []).map((driver) => [driver.id, driver]));
      const vehicleById = new Map((vehicles || []).map((vehicle) => [vehicle.id, vehicle]));
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

      const driverSnapshot = visibleRoutes.map((route) => {
        const driver = route.driver_id ? driverById.get(route.driver_id) || null : null;
        const routeStops = stopsByRouteId.get(route.id) || [];
        const routeTimeCommitCounts = getTimeCommitCounts(routeStops);
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
        date: today,
        total_stops: totalStops,
        completed_stops: completedStops,
        time_commits_total: timeCommitTotals.total,
        time_commits_completed: timeCommitTotals.completed,
        sync_status: {
          routes_today: routesToday,
          routes_assigned: routesAssigned,
          drivers_on_road: driversOnRoad,
          last_sync_at: latestRouteSyncRow?.created_at || getLatestTimestamp((routes || []).map((route) => route.created_at))
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
      const { data: drivers, error } = await supabase
        .from('drivers')
        .select('id, account_id, name, email, phone, hourly_rate, is_active')
        .eq('account_id', req.account.account_id)
        .order('name');

      if (error) {
        console.error('Manager drivers lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load drivers' });
      }

      return res.status(200).json({ drivers: drivers || [] });
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

      if (managerUser && managerUser.password_hash) {
        return res.status(409).json({ error: 'That manager already has active access. Use password reset if they need a new password.' });
      }

      const invitedAt = nowProvider().toISOString();
      let sharedManagerIdentity = null;

      if (!managerUser) {
        const existingManagerIdentityQuery = await supabase
          .from('manager_users')
          .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at, created_at')
          .eq('email', email)
          .limit(25);

        if (existingManagerIdentityQuery.error) {
          if (isMissingManagerUsersTable(existingManagerIdentityQuery.error)) {
            return res.status(500).json({ error: 'Manager user invites are not available until the latest database migration is run' });
          }

          throw existingManagerIdentityQuery.error;
        }

        sharedManagerIdentity = (existingManagerIdentityQuery.data || []).find((row) =>
          row.account_id !== req.account.account_id && row.password_hash
        ) || null;
      }

      if (managerUser) {
        const { data: updatedManagerUser, error: updateError } = await supabase
          .from('manager_users')
          .update({
            full_name: fullName,
            is_active: true,
            invited_at: invitedAt,
            accepted_at: null
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

      console.log(`Manager invite link for ${managerUser.email}: ${inviteUrl}`);

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

      const { data: updatedManagerUser, error: updateError } = await supabase
        .from('manager_users')
        .update({
          invited_at: nowProvider().toISOString(),
          accepted_at: null,
          is_active: true
        })
        .eq('id', managerUser.id)
        .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at')
        .maybeSingle();

      if (updateError) {
        throw updateError;
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
      const emailResult = await sendManagerInviteEmail({
        to: updatedManagerUser.email,
        fullName: updatedManagerUser.full_name,
        inviteUrl,
        companyName: account?.company_name,
        inviterName: req.account.manager_name || req.account.manager_email || 'A ReadyRoute admin'
      });

      console.log(`Manager invite link for ${updatedManagerUser.email}: ${inviteUrl}`);

      return res.status(200).json({
        message: emailResult.delivered
          ? `Invite email sent to ${updatedManagerUser.email}.`
          : 'Invite link refreshed. Email delivery is not configured yet, so share the link securely.',
        invite_url: emailResult.delivered ? null : inviteUrl,
        email_delivery: emailResult.delivered ? 'sent' : 'not_configured',
        manager_user: toManagerAccessRecord(updatedManagerUser, account?.manager_email || null)
      });
    } catch (error) {
      console.error('Manager invite refresh failed:', error);
      return res.status(500).json({ error: 'Failed to refresh manager invite' });
    }
  });

  router.get('/vehicles', requireManager, async (req, res) => {
    try {
      const { data: vehicles, error } = await supabase
        .from('vehicles')
        .select('id, account_id, name, make, model, year, plate, current_mileage')
        .eq('account_id', req.account.account_id)
        .order('name');

      if (error) {
        console.error('Manager vehicles lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load vehicles' });
      }

      return res.status(200).json({ vehicles: vehicles || [] });
    } catch (error) {
      console.error('Manager vehicles endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load vehicles' });
    }
  });

  router.post('/drivers', requireManager, async (req, res) => {
    const { name, email, phone, hourly_rate: hourlyRate, pin } = req.body || {};
    const parsedHourlyRate = Number(hourlyRate);

    if (!name || !email || !phone || !pin || !Number.isFinite(parsedHourlyRate)) {
      return res.status(400).json({ error: 'name, email, phone, hourly_rate, and pin are required' });
    }

    if (!/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ error: 'PIN must be a 4-digit code' });
    }

    try {
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

      const pinHash = await bcrypt.hash(String(pin), 10);

      const { data: driver, error } = await supabase
        .from('drivers')
        .insert({
          account_id: req.account.account_id,
          name: String(name).trim(),
          email: normalizedEmail,
          phone: String(phone).trim(),
          hourly_rate: parsedHourlyRate,
          pin: pinHash,
          is_active: true
        })
        .select('id')
        .single();

      if (error) {
        console.error('Manager driver creation failed:', error);
        return res.status(500).json({ error: 'Failed to create driver' });
      }

      return res.status(201).json({ driver_id: driver.id });
    } catch (error) {
      console.error('Manager create driver endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to create driver' });
    }
  });

  router.put('/drivers/:driver_id', requireManager, async (req, res) => {
    const driverId = req.params.driver_id;
    const { name, phone, hourly_rate: hourlyRate } = req.body || {};
    const parsedHourlyRate = Number(hourlyRate);

    if (!name || !phone || !Number.isFinite(parsedHourlyRate)) {
      return res.status(400).json({ error: 'name, phone, and hourly_rate are required' });
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

      const { error: updateError } = await supabase
        .from('drivers')
        .update({
          name: String(name).trim(),
          phone: String(phone).trim(),
          hourly_rate: parsedHourlyRate
        })
        .eq('id', driverId);

      if (updateError) {
        console.error('Manager driver update failed:', updateError);
        return res.status(500).json({ error: 'Failed to update driver' });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Manager driver update endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update driver' });
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
      const routeById = new Map((routeRows || []).map((route) => [route.id, route]));
      const currentTime = nowProvider();
      const rows = (driverRows || []).map((row) => ({
        ...row,
        driver_name: driverById.get(row.driver_id)?.name || 'Driver',
        email: driverById.get(row.driver_id)?.email || null,
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

  router.patch('/routes/:route_id/assign', requireManager, async (req, res) => {
    const routeId = req.params.route_id;
    const { driver_id: driverId, vehicle_id: vehicleId } = req.body || {};

    if (driverId === undefined && vehicleId === undefined) {
      return res.status(400).json({ error: 'driver_id or vehicle_id is required' });
    }

    try {
      const { data: route, error: routeError } = await supabase
        .from('routes')
        .select('id, account_id')
        .eq('id', routeId)
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (routeError) {
        console.error('Manager route assignment lookup failed:', routeError);
        return res.status(500).json({ error: 'Failed to load route for assignment' });
      }

      if (!route) {
        return res.status(404).json({ error: 'Route not found' });
      }

      if (driverId) {
        const { data: driver, error: driverError } = await supabase
          .from('drivers')
          .select('id')
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
      }

      if (vehicleId) {
        const { data: vehicle, error: vehicleError } = await supabase
          .from('vehicles')
          .select('id')
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
        .select('id, driver_id, vehicle_id, work_area_name, total_stops, completed_stops, status')
        .single();

      if (updateError) {
        console.error('Manager route assignment update failed:', updateError);
        return res.status(500).json({ error: 'Failed to update route assignment' });
      }

      return res.status(200).json({ ok: true, route: updatedRoute });
    } catch (error) {
      console.error('Manager route assignment endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update route assignment' });
    }
  });

  router.get('/stops/:stop_id/signature', requireManager, async (req, res) => {
    const stopId = req.params.stop_id;

    try {
      const { data: stop, error } = await supabase
        .from('stops')
        .select(
          'id, route_id, signature_url, signer_name, age_confirmed, delivery_type_code, routes!inner(account_id)'
        )
        .eq('id', stopId)
        .eq('routes.account_id', req.account.account_id)
        .maybeSingle();

      if (error) {
        console.error('Manager signature stop lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load signature data' });
      }

      if (!stop) {
        return res.status(404).json({ error: 'Stop not found' });
      }

      return res.status(200).json({
        stop: {
          id: stop.id,
          route_id: stop.route_id,
          signature_url: stop.signature_url || null,
          signer_name: stop.signer_name || null,
          age_confirmed: Boolean(stop.age_confirmed),
          delivery_type_code: stop.delivery_type_code || null
        }
      });
    } catch (error) {
      console.error('Manager signature endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load signature data' });
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
        .select('id, account_id, driver_id, vehicle_id, work_area_name, date, total_stops, completed_stops, status, sa_number, contractor_name')
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
            'id, route_id, sequence_order, address, contact_name, address_line2, lat, lng, status, is_business, has_note, stop_type, has_pickup, has_delivery, has_time_commit, ready_time, close_time, sid, geocode_source, geocode_accuracy, exception_code, delivery_type_code, pod_photo_url, notes, completed_at'
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
        const { data: packages, error: packagesError } = await supabase
          .from('packages')
          .select('id, stop_id, tracking_number, requires_signature, hazmat')
          .in('stop_id', stopIds);

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

      return res.status(200).json({
        route: {
          id: route.id,
          work_area_name: route.work_area_name,
          date: route.date,
          status: route.status,
          driver_id: route.driver_id || null,
          driver_name: driver?.name || null,
          vehicle_id: route.vehicle_id || null,
          vehicle_name: vehicle?.name || null,
          total_stops: Number(route.total_stops || 0),
          completed_stops: Number(route.completed_stops || 0),
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
        .select('id, account_id, driver_id, work_area_name, date')
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
        .select('id, account_id, work_area_name, date')
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
        .select('fedex_csp_id')
        .eq('id', req.account.account_id)
        .maybeSingle();

      if (accountError) {
        console.error('Manager route account lookup failed:', accountError);
        return res.status(500).json({ error: 'Failed to load route sync settings' });
      }

      const { data: routes, error: routesError } = await supabase
        .from('routes')
        .select('id, account_id, driver_id, vehicle_id, work_area_name, date, source, total_stops, completed_stops, status, created_at, completed_at')
        .eq('account_id', req.account.account_id)
        .eq('date', date)
        .order('id');

      if (routesError) {
        console.error('Manager routes lookup failed:', routesError);
        return res.status(500).json({ error: 'Failed to load routes' });
      }

      const visibleRoutes = (routes || []).filter(isDisplayableManagerRoute);
      const routeIds = visibleRoutes.map((route) => route.id);
      const driverIds = [...new Set(visibleRoutes.map((route) => route.driver_id).filter(Boolean))];
      const vehicleIds = [...new Set(visibleRoutes.map((route) => route.vehicle_id).filter(Boolean))];
      let stopsByRouteId = new Map();
      const latestSyncAt = getLatestTimestamp(visibleRoutes.map((route) => route.created_at));
      let driversById = new Map();
      let vehiclesById = new Map();

      if (routeIds.length > 0) {
        const { data: stops, error: stopsError } = await supabase
          .from('stops')
          .select(
            'id, route_id, sequence_order, address, lat, lng, status, notes, exception_code, delivery_type_code, signer_name, signature_url, age_confirmed, pod_photo_url, pod_signature_url, scanned_at, completed_at, has_time_commit'
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
      }

      if (driverIds.length > 0) {
        const { data: drivers, error: driversError } = await supabase
          .from('drivers')
          .select('id, name')
          .eq('account_id', req.account.account_id)
          .in('id', driverIds);

        if (driversError) {
          console.error('Manager routes driver lookup failed:', driversError);
          return res.status(500).json({ error: 'Failed to load route driver names' });
        }

        driversById = new Map((drivers || []).map((driver) => [driver.id, driver]));
      }

      if (vehicleIds.length > 0) {
        const { data: vehicles, error: vehiclesError } = await supabase
          .from('vehicles')
          .select('id, name, plate')
          .eq('account_id', req.account.account_id)
          .in('id', vehicleIds);

        if (vehiclesError) {
          console.error('Manager routes vehicle lookup failed:', vehiclesError);
          return res.status(500).json({ error: 'Failed to load route vehicle names' });
        }

        vehiclesById = new Map((vehicles || []).map((vehicle) => [vehicle.id, vehicle]));
      }

      return res.status(200).json({
        sync_status: {
          routes_today: Number(visibleRoutes.length),
          routes_assigned: visibleRoutes.filter((route) => Boolean(route.driver_id)).length,
          last_sync_at: latestSyncAt
        },
        fedex_connection: {
          is_connected: Boolean(account?.fedex_csp_id),
          terminal_label: account?.fedex_csp_id || null
        },
        routes: visibleRoutes.map((route) => ({
          ...summarizeCoordinateHealth(stopsByRouteId.get(route.id) || []),
          ...route,
          driver_name: route.driver_id ? driversById.get(route.driver_id)?.name || null : null,
          vehicle_name: route.vehicle_id ? vehiclesById.get(route.vehicle_id)?.name || null : null,
          vehicle_plate: route.vehicle_id ? vehiclesById.get(route.vehicle_id)?.plate || null : null,
          time_commits_total: getTimeCommitCounts(stopsByRouteId.get(route.id) || []).total,
          time_commits_completed: getTimeCommitCounts(stopsByRouteId.get(route.id) || []).completed,
          stops: stopsByRouteId.get(route.id) || []
        }))
      });
    } catch (error) {
      console.error('Manager routes endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load routes' });
    }
  });

  return router;
}

module.exports = createManagerRouter();
module.exports.createManagerRouter = createManagerRouter;
