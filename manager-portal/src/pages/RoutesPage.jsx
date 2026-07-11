import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { EmptyState, ErrorState, PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import {
  buildOperationsDatePath,
  getResolvedOperationsDate,
  saveStoredOperationsDate
} from '../utils/operationsDate';
import { getRouteStatusMeta } from '../utils/routeStatus';
import { sortRoutesByWorkArea } from '../utils/routeSort';

const ROUTES_SKELETON_ROWS = Array.from({ length: 5 }, (_, index) => index);
const ROUTES_SKELETON_CELLS = Array.from({ length: 9 }, (_, index) => index);

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

function safeNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRouteName(route) {
  return route.work_area_name || route.route_number || route.id || 'Route';
}

function getStopProgress(route) {
  const completed = safeNumber(route.completed_stops);
  const total = safeNumber(route.total_stops || route.stops?.length);
  return `${completed} / ${total}`;
}

function getPackageProgress(route) {
  const completed = safeNumber(route.delivered_packages);
  const total = safeNumber(route.total_packages || route.manifest_package_count);
  return total ? `${completed} / ${total}` : '—';
}

function getPickupSummary(route) {
  const total = safeNumber(route.pickup_stops || route.pickup_stop_count);
  if (!total) {
    return '—';
  }

  const completed = safeNumber(route.pickup_stops_completed);
  const combined = getCombinedStopCount(route);
  return `${completed} / ${total}${combined ? ` (${combined} also delivery)` : ''}`;
}

function getCombinedStopCount(route) {
  return safeNumber(route.combined_stops || route.combined_stop_count || route.total_combined_stops);
}

function RoutesLoadingSkeleton() {
  return (
    <div className="routes-loading-skeleton" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading routes</span>
      <div className="routes-loading-status" aria-hidden="true">
        <span className="routes-loading-spinner" />
        <span className="skeleton-line routes-loading-title" />
      </div>
      <div className="routes-operations-table routes-loading-table" aria-hidden="true">
        <div className="routes-operations-table-header routes-loading-row">
          {ROUTES_SKELETON_CELLS.map((cell) => (
            <span className="skeleton-line" key={`header-${cell}`} />
          ))}
        </div>
        {ROUTES_SKELETON_ROWS.map((row) => (
          <div className="routes-operations-table-row routes-loading-row" key={row}>
            {ROUTES_SKELETON_CELLS.map((cell) => (
              <span className="skeleton-line" key={`${row}-${cell}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoutesTable({ routes, date }) {
  return (
    <>
      <div className="routes-operations-table">
        <div className="routes-operations-table-header">
          <span>Route</span>
          <span>Driver</span>
          <span>Vehicle</span>
          <span>Stops</span>
          <span>Packages</span>
          <span>Pickups</span>
          <span>Exceptions</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {routes.map((route) => {
          const status = getRouteStatusMeta(route);
          const routeUrl = buildOperationsDatePath(`/routes/${route.id}`, date);

          return (
            <div className="routes-operations-table-row" key={route.id}>
              <Link className="routes-route-name" to={routeUrl}>Route {formatRouteName(route)}</Link>
              <span>{route.driver_name || 'Unassigned'}</span>
              <span>{route.vehicle_name || route.vehicle_plate || 'Unassigned'}</span>
              <span>{getStopProgress(route)}</span>
              <span>{getPackageProgress(route)}</span>
              <span>{getPickupSummary(route)}</span>
              <span>{safeNumber(route.exception_count || route.exceptions) || '—'}</span>
              <span><StatusBadge tone={status.tone}>{status.label}</StatusBadge></span>
              <span className="routes-row-actions">
                <Link className="secondary-inline-button" to={routeUrl}>
                  View
                </Link>
              </span>
            </div>
          );
        })}
      </div>

      <div className="routes-operations-card-list">
        {routes.map((route) => {
          const status = getRouteStatusMeta(route);
          const routeUrl = buildOperationsDatePath(`/routes/${route.id}`, date);

          return (
            <article className="card routes-operations-card" key={route.id}>
              <div className="routes-operations-card-topline">
                <div>
                  <Link className="routes-route-name" to={routeUrl}>Route {formatRouteName(route)}</Link>
                  <span>{route.driver_name || 'Unassigned driver'}</span>
                </div>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </div>
              <div className="routes-operations-card-grid">
                <span>Vehicle: {route.vehicle_name || route.vehicle_plate || 'Unassigned'}</span>
                <span>Stops: {getStopProgress(route)}</span>
                <span>Packages: {getPackageProgress(route)}</span>
                <span>Pickups: {getPickupSummary(route)}</span>
                <span>Exceptions: {safeNumber(route.exception_count || route.exceptions) || 'None'}</span>
              </div>
              <Link className="secondary-button" to={routeUrl}>
                View Route
              </Link>
            </article>
          );
        })}
      </div>
    </>
  );
}

export default function RoutesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const date = getResolvedOperationsDate(searchParams);
  const { selectedCsaId, selectedCsaName } = useSelectedCsa();

  useEffect(() => {
    saveStoredOperationsDate(date);

    if (searchParams.get('date') === date) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', date);
    setSearchParams(nextParams, { replace: true });
  }, [date, searchParams, setSearchParams]);

  const routesQuery = useQuery({
    queryKey: ['operations-routes', selectedCsaId, date],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/routes', { params: { date } });
      return response.data || { routes: [], sync_status: null, account: null };
    }
  });

  const routes = useMemo(() => sortRoutesByWorkArea(routesQuery.data?.routes || []), [routesQuery.data?.routes]);
  const syncStatus = routesQuery.data?.sync_status || {};
  const accountName = selectedCsaName || routesQuery.data?.account?.company_name || '';
  const assignedCount = safeNumber(syncStatus.routes_assigned || routes.filter((route) => route.driver_id).length);
  const dispatchedCount = safeNumber(syncStatus.routes_dispatched || routes.filter((route) => route.dispatch_state === 'dispatched').length);
  const exceptionCount = routes.reduce((sum, route) => sum + safeNumber(route.exception_count || route.exceptions), 0);
  const pickupCount = routes.reduce((sum, route) => sum + safeNumber(route.pickup_stops || route.pickup_stop_count), 0);
  const combinedStopCount = routes.reduce((sum, route) => sum + getCombinedStopCount(route), 0);

  function handleDateChange(nextDate) {
    saveStoredOperationsDate(nextDate);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', nextDate);
    setSearchParams(nextParams);
  }

  return (
    <section className="page-section routes-operations-page">
      <PageHeader
        title="Routes"
        description={`${accountName ? `${accountName} · ` : ''}${formatDisplayDate(date)}`}
        actions={(
          <div className="routes-header-toolbar">
            <label className="weekly-date-picker routes-date-picker">
              <span className="field-label">Selected Day</span>
              <input
                className="date-field"
                onChange={(event) => handleDateChange(event.target.value)}
                type="date"
                value={date}
              />
            </label>
            <Link className="secondary-button" to={buildOperationsDatePath('/fleet-map', date)}>
              Fleet Map
            </Link>
            <Link className="primary-cta manifest-button" to={buildOperationsDatePath('/manifest', date)}>
              Upload Manifest
            </Link>
          </div>
        )}
      />

      <div className="routes-operations-summary-grid">
        <StatCard label="Routes" value={routes.length} detail={`${assignedCount} assigned`} />
        <StatCard label="Dispatched" value={dispatchedCount} detail="Visible to drivers" tone={dispatchedCount ? 'active' : 'default'} />
        <StatCard label="Exceptions" value={exceptionCount} detail="Routes needing attention" tone={exceptionCount ? 'warning' : 'default'} />
        <StatCard
          label="Pickup Stops"
          value={pickupCount}
          detail={combinedStopCount ? `${combinedStopCount} also count as delivery stops` : 'From manifest data'}
          tone={pickupCount ? 'info' : 'default'}
        />
      </div>

      <div className="card routes-operations-list-card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Route Operations</div>
            <div className="driver-meta">Route assignments, progress, sync status, and exceptions for {formatDisplayDate(date)}.</div>
          </div>
          <div className="driver-meta">{routes.length} route{routes.length === 1 ? '' : 's'}</div>
        </div>

        {routesQuery.isLoading ? (
          <RoutesLoadingSkeleton />
        ) : routesQuery.isError ? (
          <ErrorState
            title="Unable to load routes"
            description="Route operations could not be loaded for this day."
            onRetry={() => routesQuery.refetch()}
          />
        ) : routes.length ? (
          <RoutesTable routes={routes} date={date} />
        ) : (
          <EmptyState
            variant="inline"
            title="No routes for this day"
            description="Upload today’s manifest or route files to start reviewing work areas."
            actions={(
              <Link className="primary-cta manifest-button" to={buildOperationsDatePath('/manifest', date)}>
                Upload Manifest
              </Link>
            )}
          />
        )}
      </div>
    </section>
  );
}
