import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';
import './OverviewRoutesSection.css';

function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) {
    return '—';
  }

  const safeMinutes = Math.max(0, Math.round(Number(minutes)));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }

  return Number(value).toLocaleString();
}

function getProgressPercent(current, total) {
  if (!total) {
    return 0;
  }

  return Math.max(0, Math.min(100, (Number(current || 0) / Number(total || 0)) * 100));
}

function getPackageTotals(route) {
  const allStops = route.stops || [];
  const totalPackages = allStops.reduce((sum, stop) => sum + (stop.packages || []).length, 0);
  const processedPackages = allStops.reduce((sum, stop) => {
    if (stop.status === 'pending') {
      return sum;
    }

    return sum + (stop.packages || []).length;
  }, 0);

  return {
    total: totalPackages,
    delivered: processedPackages,
    left: Math.max(0, totalPackages - processedPackages)
  };
}

function getStopBreakdown(stops = []) {
  const deliveryStops = stops.filter((stop) => !stop.is_pickup);
  const pickupStops = stops.filter((stop) => stop.is_pickup);

  const countCompleted = (items) => items.filter((stop) => stop.status !== 'pending').length;

  return {
    deliveriesTotal: deliveryStops.length,
    deliveriesCompleted: countCompleted(deliveryStops),
    deliveriesLeft: Math.max(0, deliveryStops.length - countCompleted(deliveryStops)),
    pickupsTotal: pickupStops.length,
    pickupsCompleted: countCompleted(pickupStops),
    pickupsLeft: Math.max(0, pickupStops.length - countCompleted(pickupStops))
  };
}

function getDriveMinutes(route, now) {
  const startValue = route.clock_in_at || route.clock_in || route.started_at || null;

  if (!startValue) {
    return null;
  }

  const startedAt = new Date(startValue);

  if (Number.isNaN(startedAt.getTime())) {
    return null;
  }

  const endedAt = route.completed_at ? new Date(route.completed_at) : now;

  if (Number.isNaN(endedAt.getTime())) {
    return null;
  }

  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
}

function buildSummary(routes) {
  const now = new Date();
  const totals = routes.reduce(
    (summary, route) => {
      const packageTotals = getPackageTotals(route);
      const stopBreakdown = getStopBreakdown(route.stops || []);
      const driveMinutes = getDriveMinutes(route, now);

      summary.driversAssigned += route.driver_id ? 1 : 0;
      summary.driversActive += route.status === 'in_progress' ? 1 : 0;
      summary.driversTotal += 1;

      summary.deliveriesCompleted += stopBreakdown.deliveriesCompleted;
      summary.deliveriesTotal += stopBreakdown.deliveriesTotal;
      summary.pickupsCompleted += stopBreakdown.pickupsCompleted;
      summary.pickupsTotal += stopBreakdown.pickupsTotal;

      summary.deliveredPackages += packageTotals.delivered;
      summary.totalPackages += packageTotals.total;

      summary.timeCommitsActual += Number(route.time_commits_completed || 0);
      summary.timeCommitsPlanned += Number(route.time_commits_total || 0);
      summary.impacts += Number(route.impacts || 0);
      summary.exceptions += Number(route.exceptions || 0);

      if (route.actual_miles !== null && route.actual_miles !== undefined) {
        summary.actualMiles += Number(route.actual_miles || 0);
        summary.hasActualMiles = true;
      }

      if (route.estimated_miles !== null && route.estimated_miles !== undefined) {
        summary.estimatedMiles += Number(route.estimated_miles || 0);
        summary.hasEstimatedMiles = true;
      }

      if (driveMinutes !== null) {
        summary.driveMinutes += driveMinutes;
      }

      if (route.stops_per_hour !== null && route.stops_per_hour !== undefined) {
        summary.stopsPerHourValues.push(Number(route.stops_per_hour));
      }

      if (route.has_bad_address) {
        summary.hasBadAddress = true;
      }

      return summary;
    },
    {
      driversAssigned: 0,
      driversActive: 0,
      driversTotal: 0,
      deliveriesCompleted: 0,
      deliveriesTotal: 0,
      pickupsCompleted: 0,
      pickupsTotal: 0,
      deliveredPackages: 0,
      totalPackages: 0,
      timeCommitsActual: 0,
      timeCommitsPlanned: 0,
      impacts: 0,
      exceptions: 0,
      actualMiles: 0,
      estimatedMiles: 0,
      hasActualMiles: false,
      hasEstimatedMiles: false,
      driveMinutes: 0,
      stopsPerHourValues: [],
      hasBadAddress: false
    }
  );

  const averageStopsPerHour = totals.stopsPerHourValues.length
    ? (totals.stopsPerHourValues.reduce((sum, value) => sum + value, 0) / totals.stopsPerHourValues.length).toFixed(1)
    : '—';

  return {
    ...totals,
    deliveriesLeft: Math.max(0, totals.deliveriesTotal - totals.deliveriesCompleted),
    pickupsLeft: Math.max(0, totals.pickupsTotal - totals.pickupsCompleted),
    remainingPackages: Math.max(0, totals.totalPackages - totals.deliveredPackages),
    averageStopsPerHour
  };
}

function getRouteStats(route) {
  const stopBreakdown = getStopBreakdown(route.stops || []);
  const packageTotals = getPackageTotals(route);
  const driveMinutes = getDriveMinutes(route, new Date());

  return {
    ...stopBreakdown,
    packageTotals,
    driveMinutes,
    deliveriesProgress: getProgressPercent(stopBreakdown.deliveriesCompleted, stopBreakdown.deliveriesTotal),
    pickupsProgress: getProgressPercent(stopBreakdown.pickupsCompleted, stopBreakdown.pickupsTotal),
    packageProgress: getProgressPercent(packageTotals.delivered, packageTotals.total),
    milesProgress:
      route.actual_miles !== null &&
      route.actual_miles !== undefined &&
      route.estimated_miles !== null &&
      route.estimated_miles !== undefined
        ? getProgressPercent(route.actual_miles, route.estimated_miles)
        : 0
  };
}

function InfoLabel({ label, tooltip }) {
  return (
    <span className="overview-info-label">
      <span>{label}</span>
      <span className="overview-tooltip-wrap">
        <span className="overview-info-icon" aria-hidden="true">
          i
        </span>
        <span className="overview-tooltip-box" role="tooltip">
          {tooltip}
        </span>
      </span>
    </span>
  );
}

function StatCard({ title, primary, secondary, progress, footer, success = false, compact = false }) {
  return (
    <div className={`overview-stat-card${compact ? ' compact' : ''}`}>
      <div className="overview-stat-primary">{primary}</div>
      {secondary ? <div className="overview-stat-secondary">{secondary}</div> : null}
      {progress !== undefined ? (
        <div className="overview-progress-track">
          <div
            className={`overview-progress-fill${success ? ' success' : ''}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      {footer ? <div className="overview-stat-footer">{footer}</div> : null}
      <div className="overview-stat-label">{title}</div>
    </div>
  );
}

function ReassignModal({ drivers, isSaving, onClose, onSave, route }) {
  const [selectedDriverId, setSelectedDriverId] = useState(route?.driver_id || '');

  useEffect(() => {
    setSelectedDriverId(route?.driver_id || '');
  }, [route?.driver_id, route?.id]);

  if (!route) {
    return null;
  }

  return (
    <div className="overview-reassign-backdrop" role="presentation">
      <div className="overview-reassign-modal">
        <div className="overview-reassign-header">
          <div>
            <div className="overview-reassign-title">Reassign Driver</div>
            <div className="overview-reassign-subtitle">Route {route.work_area_name || route.id}</div>
          </div>
          <button className="overview-modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="overview-reassign-body">
          <label className="overview-field-label" htmlFor="overview-driver-select">
            Driver
          </label>
          <select
            className="text-field"
            id="overview-driver-select"
            onChange={(event) => setSelectedDriverId(event.target.value)}
            value={selectedDriverId}
          >
            <option value="">Select driver...</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </div>

        <div className="overview-reassign-actions">
          <button className="secondary-cta" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="primary-cta"
            disabled={!selectedDriverId || isSaving}
            onClick={() => onSave(selectedDriverId)}
            type="button"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonTable() {
  const tableColumns = '1fr 1.2fr 1fr 1fr 1fr 0.75fr 1fr 0.85fr 0.8fr 1fr 0.85fr';

  return (
    <div className="overview-table">
      <div className="overview-table-header" style={{ gridTemplateColumns: tableColumns }}>
        {['Name', 'Driver', 'Vehicle', 'Deliveries', 'Pick-Ups', 'TCs', 'Packages', 'Imps/Excs', 'Stops/Hour', 'Act/Est Miles', 'Est Drive'].map(
          (label) => (
            <div className="overview-table-head-cell" key={label}>
              {label}
            </div>
          )
        )}
      </div>
      {[0, 1, 2].map((row) => (
        <div className={`overview-table-row skeleton${row % 2 ? ' alt' : ''}`} key={row} style={{ gridTemplateColumns: tableColumns }}>
          {Array.from({ length: 11 }).map((_, cell) => (
            <div className="overview-table-cell" key={cell}>
              <div className="overview-skeleton-line" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function OverviewRoutesSection({ date, routes }) {
  const navigate = useNavigate();
  const [routeRows, setRouteRows] = useState(routes ?? null);
  const [isAlertDismissed, setIsAlertDismissed] = useState(false);
  const [reassigningRoute, setReassigningRoute] = useState(null);

  useEffect(() => {
    setRouteRows(routes ?? null);
  }, [routes]);

  useEffect(() => {
    setIsAlertDismissed(false);
  }, [date]);

  const driversQuery = useQuery({
    queryKey: ['overview-route-drivers'],
    queryFn: async () => {
      const response = await api.get('/manager/drivers');
      return response.data?.drivers || [];
    }
  });

  const assignMutation = useMutation({
    mutationFn: async ({ routeId, driverId }) => {
      await api.patch(`/manager/routes/${routeId}/assign`, { driver_id: driverId });
      return { routeId, driverId };
    },
    onSuccess: ({ routeId, driverId }) => {
      const selectedDriver = (driversQuery.data || []).find((driver) => driver.id === driverId) || null;

      setRouteRows((current) =>
        (current || []).map((route) =>
          route.id === routeId
            ? {
                ...route,
                driver_id: driverId,
                driver_name: selectedDriver?.name || route.driver_name || null
              }
            : route
        )
      );
      setReassigningRoute(null);
    }
  });

  const summary = useMemo(() => buildSummary(routeRows || []), [routeRows]);
  const dueBadAddress = summary.hasBadAddress && !isAlertDismissed;
  const tableColumns = '1fr 1.2fr 1fr 1fr 1fr 0.75fr 1fr 0.85fr 0.8fr 1fr 0.85fr';

  if (routeRows === null || routeRows === undefined) {
    return (
      <section className="overview-routes-section">
        <div className="overview-stats-shell">
          <div className="overview-stats-title">TODAY&apos;S ROUTES</div>
          <div className="overview-stats-grid">
            {Array.from({ length: 7 }).map((_, index) => (
              <div className="overview-stat-card skeleton" key={index}>
                <div className="overview-skeleton-line large" />
                <div className="overview-skeleton-line medium" />
                <div className="overview-skeleton-line small" />
              </div>
            ))}
          </div>
        </div>
        <div className="overview-table-shell">
          <SkeletonTable />
        </div>
      </section>
    );
  }

  if (!routeRows.length) {
    return (
      <section className="overview-routes-section">
        <div className="overview-stats-shell">
          <div className="overview-stats-title">TODAY&apos;S ROUTES</div>
          <div className="overview-empty-state">
            No routes loaded for today. Upload a manifest to get started.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overview-routes-section">
      <div className="overview-stats-shell">
        <div className="overview-stats-title">TODAY&apos;S ROUTES</div>

        {dueBadAddress ? (
          <div className="overview-alert-banner">
            <div>One or more routes contains a bad address. Review your manifest.</div>
            <button className="overview-alert-dismiss" onClick={() => setIsAlertDismissed(true)} type="button">
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="overview-stats-grid">
          <StatCard
            footer={`${summary.driversActive} on road`}
            primary={`${summary.driversAssigned} / ${summary.driversTotal}`}
            title="Drivers Assigned"
          />
          <StatCard
            footer={`Deliveries (${summary.averageStopsPerHour}/Hour)`}
            primary={`${summary.deliveriesCompleted}/${summary.deliveriesTotal}`}
            progress={getProgressPercent(summary.deliveriesCompleted, summary.deliveriesTotal)}
            secondary={`(${summary.deliveriesLeft} left)`}
            title="Deliveries"
          />
          <StatCard
            footer="Pick-Ups"
            primary={`${summary.pickupsCompleted}/${summary.pickupsTotal}`}
            progress={getProgressPercent(summary.pickupsCompleted, summary.pickupsTotal)}
            secondary={`(${summary.pickupsLeft} left)`}
            title="Pick-Ups"
          />
          <StatCard
            footer="Packages"
            primary={`${summary.deliveredPackages}/${summary.totalPackages}`}
            progress={getProgressPercent(summary.deliveredPackages, summary.totalPackages)}
            secondary={`(${summary.remainingPackages} left)`}
            title="Packages"
          />
          <StatCard
            footer={
              <InfoLabel
                label="TCs"
                tooltip="Time Commits — stops with a FedEx delivery or pickup time window from the manifest. Actual = completed within window. Planned = total stops with a time window today."
              />
            }
            primary={`${summary.timeCommitsActual} / ${summary.timeCommitsPlanned}`}
            title="TCs"
          />
          <StatCard
            footer={
              <InfoLabel
                label="Imps/Excs"
                tooltip="Impacts / Exceptions — Impacts are stops that negatively affected service score. Exceptions are stops where delivery could not be completed as expected. Both are reported via the FedEx scanner."
              />
            }
            primary={`${summary.impacts} / ${summary.exceptions}`}
            title="Imps/Excs"
          />
          <StatCard compact footer="Drive Time" primary={formatMinutes(summary.driveMinutes)} title="Drive Time" />
          <StatCard
            compact
            footer="Act/Est Miles"
            primary={
              summary.hasActualMiles || summary.hasEstimatedMiles
                ? `${formatNumber(summary.actualMiles)}/${formatNumber(summary.estimatedMiles)}`
                : '—'
            }
            progress={
              summary.hasActualMiles && summary.hasEstimatedMiles
                ? getProgressPercent(summary.actualMiles, summary.estimatedMiles)
                : 0
            }
            success={summary.hasActualMiles && summary.hasEstimatedMiles && summary.actualMiles >= summary.estimatedMiles}
            title="Act/Est Miles"
          />
        </div>
      </div>

      <div className="overview-table-shell">
        <div className="overview-table">
          <div className="overview-table-header" style={{ gridTemplateColumns: tableColumns }}>
            <div className="overview-table-head-cell col-name">Name</div>
            <div className="overview-table-head-cell col-driver">Driver</div>
            <div className="overview-table-head-cell col-vehicle">Vehicle</div>
            <div className="overview-table-head-cell col-stops">Deliveries</div>
            <div className="overview-table-head-cell col-stops">Pick-Ups</div>
            <div className="overview-table-head-cell col-tcs">
              <InfoLabel
                label="TCs"
                tooltip="Time Commits — stops with a FedEx delivery or pickup time window from the manifest. Actual = completed within window. Planned = total stops with a time window today."
              />
            </div>
            <div className="overview-table-head-cell col-packages">Packages</div>
            <div className="overview-table-head-cell col-impsexcs">
              <InfoLabel
                label="Imps/Excs"
                tooltip="Impacts / Exceptions — Impacts are stops that negatively affected service score. Exceptions are stops where delivery could not be completed as expected. Both are reported via the FedEx scanner."
              />
            </div>
            <div className="overview-table-head-cell col-sph">Stops/Hour</div>
            <div className="overview-table-head-cell col-miles">Act/Est Miles</div>
            <div className="overview-table-head-cell col-drive">Est Drive</div>
          </div>

          {routeRows.map((route, index) => {
            const stats = getRouteStats(route);
            const showMilesCheck =
              route.actual_miles !== null &&
              route.actual_miles !== undefined &&
              route.estimated_miles !== null &&
              route.estimated_miles !== undefined &&
              Number(route.actual_miles) >= Number(route.estimated_miles);

            return (
              <div className={`overview-table-row${index % 2 ? ' alt' : ''}`} key={route.id} style={{ gridTemplateColumns: tableColumns }}>
                <div className="overview-table-cell col-name">
                  <button className="overview-link route-link" onClick={() => navigate(`/routes/${route.id}`)} type="button">
                    {route.work_area_name || ''}
                  </button>
                  {route.has_bad_address ? <span className="overview-gear-badge">⚙</span> : null}
                </div>

                <div className="overview-table-cell col-driver">
                  {route.driver_id ? (
                    <div className="overview-driver-cell">
                      <button
                        className="overview-link"
                        onClick={() => navigate(`/drivers/${route.driver_id}`)}
                        type="button"
                      >
                        {route.driver_name || ''}
                      </button>
                      <button
                        className="overview-pencil-button"
                        onClick={() => setReassigningRoute(route)}
                        type="button"
                      >
                        ✎
                      </button>
                    </div>
                  ) : (
                    <button className="overview-link unassigned" onClick={() => setReassigningRoute(route)} type="button">
                      Unassigned
                    </button>
                  )}
                </div>

                <div className="overview-table-cell col-vehicle">
                  {route.vehicle_id && route.vehicle_name ? (
                    <button
                      className="overview-link"
                      onClick={() => navigate(`/vehicles/${route.vehicle_id}`)}
                      type="button"
                    >
                      {route.vehicle_name}
                    </button>
                  ) : (
                    <span className="overview-muted">None</span>
                  )}
                </div>

                <div className="overview-table-cell col-stops">
                  <div className="overview-metric-block">
                    <div className="overview-metric-primary">
                      {stats.deliveriesCompleted}/{stats.deliveriesTotal}
                    </div>
                    <div className="overview-metric-secondary">({stats.deliveriesLeft} left)</div>
                    <div className="overview-progress-track compact">
                      <div className="overview-progress-fill" style={{ width: `${stats.deliveriesProgress}%` }} />
                    </div>
                  </div>
                </div>

                <div className="overview-table-cell col-stops">
                  {stats.pickupsTotal ? (
                    <div className="overview-metric-block">
                      <div className="overview-metric-primary">
                        {stats.pickupsCompleted}/{stats.pickupsTotal}
                      </div>
                      <div className="overview-metric-secondary">({stats.pickupsLeft} left)</div>
                      <div className="overview-progress-track compact">
                        <div className="overview-progress-fill" style={{ width: `${stats.pickupsProgress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <div className="overview-metric-primary">—</div>
                  )}
                </div>

                <div className="overview-table-cell col-tcs">
                  <div className="overview-metric-primary">
                    {route.time_commits_completed || 0} / {route.time_commits_total || 0}
                  </div>
                </div>

                <div className="overview-table-cell col-packages">
                  <div className="overview-metric-block">
                    <div className="overview-metric-primary">
                      {stats.packageTotals.delivered}/{stats.packageTotals.total}
                    </div>
                    <div className="overview-metric-secondary">({stats.packageTotals.left} left)</div>
                    <div className="overview-progress-track compact">
                      <div className="overview-progress-fill" style={{ width: `${stats.packageProgress}%` }} />
                    </div>
                  </div>
                </div>

                <div className="overview-table-cell col-impsexcs">
                  <div className="overview-metric-primary bold">
                    {route.impacts || 0} / {route.exceptions || 0}
                  </div>
                </div>

                <div className="overview-table-cell col-sph">
                  <div className="overview-metric-primary">{route.stops_per_hour ?? '—'}</div>
                </div>

                <div className="overview-table-cell col-miles">
                  <div className="overview-metric-primary">
                    {route.actual_miles !== null && route.actual_miles !== undefined
                      ? `${formatNumber(route.actual_miles)} / ${formatNumber(route.estimated_miles)}`
                      : '—'}
                  </div>
                  {route.actual_miles !== null &&
                  route.actual_miles !== undefined &&
                  route.estimated_miles !== null &&
                  route.estimated_miles !== undefined ? (
                    <div className="overview-progress-track compact">
                      <div className="overview-progress-fill" style={{ width: `${stats.milesProgress}%` }} />
                    </div>
                  ) : null}
                  {showMilesCheck ? <div className="overview-checkmark">✓</div> : null}
                </div>

                <div className="overview-table-cell col-drive">
                  <div className="overview-metric-primary">
                    {route.estimated_drive_minutes !== null && route.estimated_drive_minutes !== undefined
                      ? formatMinutes(route.estimated_drive_minutes)
                      : stats.driveMinutes !== null
                        ? formatMinutes(stats.driveMinutes)
                        : '—'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ReassignModal
        drivers={(driversQuery.data || []).map((driver) => ({ id: driver.id, name: driver.name }))}
        isSaving={assignMutation.isPending}
        onClose={() => setReassigningRoute(null)}
        onSave={(driverId) => assignMutation.mutate({ routeId: reassigningRoute.id, driverId })}
        route={reassigningRoute}
      />
    </section>
  );
}
