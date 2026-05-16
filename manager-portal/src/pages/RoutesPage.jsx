import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import api from '../services/api';
import { EmptyState, PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import { getTodayString, loadStoredOperationsDate, saveStoredOperationsDate } from '../utils/operationsDate';
import { sortRoutesByWorkArea } from '../utils/routeSort';

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

function getRouteStatus(route) {
  if (route.dispatch_state === 'dispatched') {
    return { label: 'Dispatched', tone: 'active' };
  }

  if (route.sync_state === 'dispatch_blocked' || route.sync_state === 'needs_attention') {
    return { label: 'Needs review', tone: 'warning' };
  }

  if (route.sync_state === 'staged_changed' || route.sync_state === 'changed_after_dispatch') {
    return { label: 'Changed', tone: 'warning' };
  }

  if (route.sync_state === 'sync_failed') {
    return { label: 'Sync failed', tone: 'warning' };
  }

  if (route.sync_state === 'staged' || route.dispatch_state === 'staged') {
    return { label: 'Staged', tone: 'purple' };
  }

  if (route.status === 'in_progress') {
    return { label: 'In progress', tone: 'active' };
  }

  if (route.status === 'completed') {
    return { label: 'Complete', tone: 'active' };
  }

  return { label: route.sync_state || route.status || 'Available', tone: 'neutral' };
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
  return `${completed} / ${total}`;
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
          const status = getRouteStatus(route);

          return (
            <div className="routes-operations-table-row" key={route.id}>
              <strong className="routes-route-name">Route {formatRouteName(route)}</strong>
              <span>{route.driver_name || 'Unassigned'}</span>
              <span>{route.vehicle_name || route.vehicle_plate || 'Unassigned'}</span>
              <span>{getStopProgress(route)}</span>
              <span>{getPackageProgress(route)}</span>
              <span>{getPickupSummary(route)}</span>
              <span>{safeNumber(route.exception_count || route.exceptions) || '—'}</span>
              <span><StatusBadge tone={status.tone}>{status.label}</StatusBadge></span>
              <span className="routes-row-actions">
                <Link className="secondary-inline-button" to={`/routes/${route.id}?date=${date}`}>
                  View
                </Link>
              </span>
            </div>
          );
        })}
      </div>

      <div className="routes-operations-card-list">
        {routes.map((route) => {
          const status = getRouteStatus(route);

          return (
            <article className="card routes-operations-card" key={route.id}>
              <div className="routes-operations-card-topline">
                <div>
                  <strong>Route {formatRouteName(route)}</strong>
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
              <Link className="secondary-button" to={`/routes/${route.id}?date=${date}`}>
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
  const [date, setDate] = useState(loadStoredOperationsDate() || getTodayString());
  const { selectedCsaId, selectedCsaName } = useSelectedCsa();

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

  function handleDateChange(nextDate) {
    setDate(nextDate);
    saveStoredOperationsDate(nextDate);
  }

  return (
    <section className="page-section routes-operations-page">
      <PageHeader
        title="Routes"
        description={`${accountName ? `${accountName} · ` : ''}${formatDisplayDate(date)}`}
        actions={(
          <>
            <label className="weekly-date-picker routes-date-picker">
              <span className="field-label">Selected Day</span>
              <input
                className="date-field"
                onChange={(event) => handleDateChange(event.target.value)}
                type="date"
                value={date}
              />
            </label>
            <Link className="secondary-button" to={`/fleet-map?date=${date}`}>
              Fleet Map
            </Link>
            <Link className="primary-cta manifest-button" to={`/manifest?date=${date}`}>
              Add Routes
            </Link>
          </>
        )}
      />

      <div className="routes-operations-summary-grid">
        <StatCard label="Routes" value={routes.length} detail={`${assignedCount} assigned`} />
        <StatCard label="Dispatched" value={dispatchedCount} detail="Visible to drivers" tone={dispatchedCount ? 'active' : 'default'} />
        <StatCard label="Exceptions" value={exceptionCount} detail="Routes needing attention" tone={exceptionCount ? 'warning' : 'default'} />
        <StatCard label="Pickups" value={pickupCount} detail="From manifest data" tone={pickupCount ? 'info' : 'default'} />
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
          <div className="driver-meta">Loading routes...</div>
        ) : routesQuery.isError ? (
          <div className="error-banner">Unable to load routes.</div>
        ) : routes.length ? (
          <RoutesTable routes={routes} date={date} />
        ) : (
          <EmptyState
            title="No routes for this day"
            description="Upload today’s manifest or route files to start reviewing work areas."
            actions={(
              <Link className="primary-cta manifest-button" to={`/manifest?date=${date}`}>
                Add Routes
              </Link>
            )}
          />
        )}
      </div>
    </section>
  );
}
