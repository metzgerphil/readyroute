import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { EmptyState, PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import {
  buildOperationsDatePath,
  getTodayString,
  loadStoredOperationsDate,
  saveStoredOperationsDate
} from '../utils/operationsDate';
import { compareRouteLabels, sortRoutesByWorkArea } from '../utils/routeSort';

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
  return route?.work_area_name || route?.route_number || route?.route_name || route?.id || 'Route';
}

function formatStopType(stop) {
  const rawType = String(stop?.stop_type || '').toLowerCase();
  const hasPickup = Boolean(stop?.has_pickup || stop?.is_pickup || rawType === 'pickup');
  const hasDelivery = Boolean(stop?.has_delivery || rawType === 'delivery');

  if (hasPickup && hasDelivery) {
    return 'P&D';
  }

  if (hasPickup) {
    return 'Pickup';
  }

  return 'Delivery';
}

function formatTime(value) {
  if (!value) {
    return '—';
  }

  const rawValue = String(value).trim();
  const timeMatch = rawValue.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  }

  const date = new Date(rawValue);
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  }

  return rawValue;
}

function getCompletionTime(stop) {
  return stop?.completed_at || stop?.scanned_at || null;
}

function getStatusMeta(stop) {
  if (stop?.completed_at || ['delivered', 'completed', 'pickup_completed'].includes(stop?.status)) {
    return { label: 'Complete', tone: 'active' };
  }

  if (['attempted', 'incomplete', 'pickup_attempted'].includes(stop?.status) || stop?.exception_code) {
    return { label: 'Exception', tone: 'warning' };
  }

  return { label: 'Pending', tone: 'neutral' };
}

function buildTimeCommitRows(routes = []) {
  return sortRoutesByWorkArea(routes).flatMap((route) => {
    const stops = Array.isArray(route?.stops) ? route.stops : [];

    return stops
      .filter((stop) => stop?.has_time_commit)
      .map((stop) => ({
        id: `${route.id}-${stop.id || stop.sequence_order}`,
        route,
        routeId: route.id,
        routeName: formatRouteName(route),
        stop,
        stopType: formatStopType(stop),
        sid: stop?.sid || '—',
        address: [stop?.address, stop?.address_line2].filter(Boolean).join(', ') || 'Address unavailable',
        openTime: formatTime(stop?.ready_time),
        closeTime: formatTime(stop?.close_time),
        sequence: safeNumber(stop?.sequence_order),
        packageCount: safeNumber(stop?.package_count || stop?.packages?.length),
        eventTime: formatTime(getCompletionTime(stop)),
        status: getStatusMeta(stop)
      }));
  }).sort((left, right) => {
    const routeSort = compareRouteLabels(left.routeName, right.routeName);
    if (routeSort !== 0) {
      return routeSort;
    }

    return left.sequence - right.sequence;
  });
}

function TimeCommitsTable({ rows, date }) {
  return (
    <>
      <div className="time-commits-table">
        <div className="time-commits-table-header">
          <span>Route</span>
          <span>Stop Type</span>
          <span>SID</span>
          <span>Address</span>
          <span>Open</span>
          <span>Close</span>
          <span>Stop Sequence</span>
          <span>Pkgs</span>
          <span>Time</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {rows.map((row) => (
          <div className="time-commits-table-row" key={row.id}>
            <Link className="time-commits-route-link" to={buildOperationsDatePath(`/routes/${row.routeId}`, date)}>{row.routeName}</Link>
            <span>{row.stopType}</span>
            <span>{row.sid}</span>
            <span className="time-commits-address">{row.address}</span>
            <span>{row.openTime}</span>
            <span>{row.closeTime}</span>
            <span>{row.sequence || '—'}</span>
            <span>{row.packageCount || '—'}</span>
            <span>{row.eventTime}</span>
            <span><StatusBadge tone={row.status.tone}>{row.status.label}</StatusBadge></span>
            <span className="routes-row-actions">
              <Link className="secondary-inline-button" to={buildOperationsDatePath(`/routes/${row.routeId}`, date)}>
                View
              </Link>
            </span>
          </div>
        ))}
      </div>

      <div className="time-commits-card-list">
        {rows.map((row) => (
          <article className="card time-commits-card" key={row.id}>
            <div className="routes-operations-card-topline">
              <div>
                <strong>Route {row.routeName} · Stop {row.sequence || '—'}</strong>
                <span>{row.address}</span>
              </div>
              <StatusBadge tone={row.status.tone}>{row.status.label}</StatusBadge>
            </div>
            <div className="routes-operations-card-grid">
              <span>Type: {row.stopType}</span>
              <span>SID: {row.sid}</span>
              <span>Open: {row.openTime}</span>
              <span>Close: {row.closeTime}</span>
              <span>Packages: {row.packageCount || '—'}</span>
              <span>Time: {row.eventTime}</span>
            </div>
            <Link className="secondary-button" to={buildOperationsDatePath(`/routes/${row.routeId}`, date)}>
              View Stop Details
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}

export default function TimeCommitsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const date = searchParams.get('date') || loadStoredOperationsDate() || getTodayString();
  const [routeFilter, setRouteFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
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
    queryKey: ['operations-time-commits', selectedCsaId, date],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/routes', { params: { date } });
      const payload = response.data || { routes: [], sync_status: null, account: null };
      const sortedRoutes = sortRoutesByWorkArea(payload.routes || []);

      const routeDetails = await Promise.all(
        sortedRoutes.map(async (route) => {
          const detailResponse = await api.get(`/manager/routes/${route.id}/stops`, { params: { date } });
          return {
            ...route,
            stops: detailResponse.data?.stops || route.stops || []
          };
        })
      );

      return {
        ...payload,
        routes: routeDetails
      };
    }
  });

  const routes = useMemo(() => sortRoutesByWorkArea(routesQuery.data?.routes || []), [routesQuery.data?.routes]);
  const rows = useMemo(() => buildTimeCommitRows(routes), [routes]);
  const routeOptions = useMemo(() => (
    routes
      .filter((route) => rows.some((row) => row.routeId === route.id))
      .map((route) => ({ id: route.id, label: formatRouteName(route) }))
  ), [routes, rows]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (routeFilter !== 'all' && row.routeId !== routeFilter) {
      return false;
    }

    if (typeFilter !== 'all' && row.stopType.toLowerCase() !== typeFilter) {
      return false;
    }

    if (statusFilter !== 'all' && row.status.label.toLowerCase() !== statusFilter) {
      return false;
    }

    return true;
  }), [routeFilter, rows, statusFilter, typeFilter]);

  const completedCount = rows.filter((row) => row.status.label === 'Complete').length;
  const exceptionCount = rows.filter((row) => row.status.label === 'Exception').length;
  const pendingCount = rows.length - completedCount - exceptionCount;
  const pickupCount = rows.filter((row) => row.stopType === 'Pickup' || row.stopType === 'P&D').length;
  const accountName = selectedCsaName || routesQuery.data?.account?.company_name || '';

  function handleDateChange(nextDate) {
    saveStoredOperationsDate(nextDate);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', nextDate);
    setSearchParams(nextParams);
  }

  return (
    <section className="page-section time-commits-page">
      <PageHeader
        title="P&D Time Commits"
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
            <Link className="secondary-button" to={buildOperationsDatePath('/routes', date)}>
              Routes
            </Link>
          </>
        )}
      />

      <div className="routes-operations-summary-grid">
        <StatCard label="Time Commits" value={rows.length} detail="Manifest stops with commit windows" />
        <StatCard label="Pending" value={pendingCount} detail="Still open" tone={pendingCount ? 'info' : 'default'} />
        <StatCard label="Completed" value={completedCount} detail="Scanned or completed" tone={completedCount ? 'active' : 'default'} />
        <StatCard label="Pickup / P&D" value={pickupCount} detail={`${exceptionCount} exception${exceptionCount === 1 ? '' : 's'}`} tone={exceptionCount ? 'warning' : 'default'} />
      </div>

      <div className="card routes-operations-list-card">
        <div className="section-title-row time-commits-toolbar">
          <div>
            <div className="card-title">Time Commit Stops</div>
            <div className="driver-meta">{filteredRows.length} shown from {rows.length} total manifest commit stop{rows.length === 1 ? '' : 's'}.</div>
          </div>
          <div className="time-commits-filters" aria-label="P&D time commit filters">
            <label>
              <span className="field-label">Route</span>
              <select value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)}>
                <option value="all">All Routes</option>
                {routeOptions.map((route) => (
                  <option key={route.id} value={route.id}>Route {route.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Stop Type</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">All Types</option>
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup</option>
                <option value="p&d">P&D</option>
              </select>
            </label>
            <label>
              <span className="field-label">Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="complete">Complete</option>
                <option value="exception">Exception</option>
              </select>
            </label>
          </div>
        </div>

        {routesQuery.isLoading ? (
          <div className="driver-meta">Loading time commits...</div>
        ) : routesQuery.isError ? (
          <div className="error-banner">Unable to load P&D time commits.</div>
        ) : filteredRows.length ? (
          <TimeCommitsTable rows={filteredRows} date={date} />
        ) : rows.length ? (
          <EmptyState
            title="No time commits match these filters"
            description="Clear or adjust the filters to see the remaining manifest time commits."
          />
        ) : (
          <EmptyState
            title="No P&D time commits for this day"
            description="When manifests include pickup or delivery commit windows, they will appear here across all routes."
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
