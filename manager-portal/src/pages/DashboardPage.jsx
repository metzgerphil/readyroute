import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import DashboardFleetMap from '../components/dashboard/DashboardFleetMap';
import DriverRow from '../components/DriverRow';
import OverviewRoutesSection from '../components/OverviewRoutesSection';
import api from '../services/api';
import {
  buildFallbackDashboard,
  buildRouteCentroidMarkers,
  formatSyncTimestamp,
  getBannerState,
  getDispatchHealthSummary,
  getDistanceMiles,
  getDriverInitials,
  getDriverPinColor,
  getFleetStopsPerHour,
  getFriendlyDashboardDate,
  getMapCoverageSummary,
  getMissingRoutesState,
  getPendingTimeCommitMetadata,
  getRemainingDeliveries,
  getRemainingPickups,
  getRemainingStops,
  getRouteCentroid,
  getRouteColorMap,
  getValidCoordinatePoints
} from '../utils/dashboardHelpers';
import { getTodayString, saveStoredOperationsDate } from '../utils/operationsDate';

const EMPTY_ARRAY = [];

function SkeletonCard() {
  return (
    <div className="stat-card skeleton-card">
      <div className="skeleton-line skeleton-label" />
      <div className="skeleton-line skeleton-value" />
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('map');
  const [compactBannerKey, setCompactBannerKey] = useState(null);
  const [vehiclePickerRouteId, setVehiclePickerRouteId] = useState(null);
  const dashboardDate = searchParams.get('date') || getTodayString();
  const isSelectedDateToday = dashboardDate === getTodayString();

  useEffect(() => {
    saveStoredOperationsDate(dashboardDate);
  }, [dashboardDate]);

  useEffect(() => {
    if (searchParams.has('date')) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', dashboardDate);
    setSearchParams(nextParams, { replace: true });
  }, [dashboardDate, searchParams, setSearchParams]);

  const dashboardQuery = useQuery({
    queryKey: ['manager-dashboard', dashboardDate],
    queryFn: async () => {
      const response = await api.get('/manager/dashboard', {
        params: {
          date: dashboardDate
        }
      });
      return response.data;
    },
    refetchInterval: 10000
  });

  const vehiclesQuery = useQuery({
    queryKey: ['fleet-vehicles'],
    queryFn: async () => {
      const response = await api.get('/vehicles');
      return response.data?.vehicles || [];
    }
  });

  const routesOverviewQuery = useQuery({
    queryKey: ['dashboard-overview-routes', dashboardDate],
    queryFn: async () => {
      const response = await api.get('/manager/routes', { params: { date: dashboardDate } });
      return response.data?.routes || [];
    }
  });

  const overviewRoutes = useMemo(() => routesOverviewQuery.data || EMPTY_ARRAY, [routesOverviewQuery.data]);
  const overviewRouteIdsKey = overviewRoutes.map((route) => route.id).join(',');

  const routeDetailMapQuery = useQuery({
    queryKey: ['dashboard-route-detail-map', dashboardDate, overviewRouteIdsKey],
    queryFn: async () => {
      const responses = await Promise.allSettled(
        overviewRoutes.map(async (route) => {
          const response = await api.get(`/manager/routes/${route.id}/stops`, { params: { date: dashboardDate } });
          return response.data;
        })
      );

      const fulfilled = responses
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);
      const rejected = responses.filter((result) => result.status === 'rejected');

      if (rejected.length > 0) {
        console.warn('Dashboard route detail fetch skipped failed routes:', rejected);
      }

      return fulfilled;
    },
    enabled: overviewRoutes.length > 0
  });

  const assignVehicleMutation = useMutation({
    mutationFn: async ({ routeId, vehicleId }) => {
      await api.patch(`/manager/routes/${routeId}/assign`, { vehicle_id: vehicleId });
      return { routeId, vehicleId };
    },
    onSuccess: ({ routeId, vehicleId }) => {
      const vehicle = (vehiclesQuery.data || []).find((entry) => entry.id === vehicleId) || null;
      queryClient.setQueryData(['manager-dashboard', dashboardDate], (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          drivers: (current.drivers || []).map((row) => (
            row.route_id === routeId
              ? {
                  ...row,
                  vehicle_id: vehicleId,
                  vehicle_name: vehicle?.name || null,
                  vehicle_plate: vehicle?.plate || null
                }
              : row
          ))
        };
      });
      setVehiclePickerRouteId(null);
    }
  });

  const dashboard = dashboardQuery.data;
  const fallbackDashboard = useMemo(
    () => buildFallbackDashboard(overviewRoutes, dashboardDate),
    [overviewRoutes, dashboardDate]
  );
  const dispatchHealth = useMemo(
    () => getDispatchHealthSummary(overviewRoutes),
    [overviewRoutes]
  );
  const activeDashboard = isSelectedDateToday ? (dashboard || fallbackDashboard) : fallbackDashboard;
  const routeRows = useMemo(() => activeDashboard?.drivers || EMPTY_ARRAY, [activeDashboard?.drivers]);
  const syncStatus = activeDashboard?.sync_status;
  const bannerState =
    dashboardQuery.isLoading && overviewRoutes.length === 0
      ? 'loading'
      : getBannerState(syncStatus, dispatchHealth);
  const activeBannerKey = `${bannerState}:${syncStatus?.routes_today ?? ''}:${syncStatus?.routes_assigned ?? ''}`;
  const isCompactBanner = bannerState === 'active' && compactBannerKey === activeBannerKey;
  const missingRoutesState = useMemo(
    () => getMissingRoutesState(syncStatus, dashboard?.date || dashboardDate),
    [dashboard?.date, dashboardDate, syncStatus]
  );

  useEffect(() => {
    if (bannerState !== 'active') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCompactBannerKey(activeBannerKey);
    }, 10000);

    return () => window.clearTimeout(timeoutId);
  }, [activeBannerKey, bannerState]);

  const routeDetailsById = useMemo(
    () =>
      new Map(
        (routeDetailMapQuery.data || [])
          .filter((item) => item?.route?.id)
          .map((item) => [item.route.id, item])
      ),
    [routeDetailMapQuery.data]
  );

  const driverPositionMarkers = useMemo(
    () =>
      routeRows
        .filter((row) => row.name)
        .map((row) => {
          const routeDetail = routeDetailsById.get(row.route_id);
          const routeStops = routeDetail?.stops || [];
          const nextPendingStop = routeStops.find((stop) => stop.status === 'pending') || null;
          const fallbackCenter = getRouteCentroid(routeStops);
          const livePosition = row.last_position?.lat != null && row.last_position?.lng != null
            ? { lat: Number(row.last_position.lat), lng: Number(row.last_position.lng) }
            : null;
          const livePositionIsUsable = Boolean(
            row.is_online &&
            row.route_status === 'in_progress' &&
            livePosition &&
            fallbackCenter &&
            getDistanceMiles(livePosition, fallbackCenter) <= 50
          );
          const position = fallbackCenter
            ? (livePositionIsUsable ? livePosition : fallbackCenter)
            : null;
          const timeCommitMeta = getPendingTimeCommitMetadata(routeDetail);

          if (!position) {
            return null;
          }

          return {
            lat: position.lat,
            lng: position.lng,
            title: `${row.work_area_name || '--'} — ${row.name}`,
            driverName: row.name,
            workAreaName: row.work_area_name || '--',
            completedStops: Number(row.completed_stops || 0),
            totalStops: Number(row.total_stops || 0),
            stopsPerHourLabel: `${row.stops_per_hour ?? '--'} stops/hr`,
            nextStopAddress: nextPendingStop?.address || row.current_stop_address || 'No active stop',
            nextStopTimeCommit:
              nextPendingStop?.has_time_commit && nextPendingStop?.ready_time && nextPendingStop?.close_time
                ? `${nextPendingStop.ready_time}–${nextPendingStop.close_time}`
                : null,
            pendingTimeCommitCount: timeCommitMeta.pendingCount,
            hasUrgentTimeCommit: timeCommitMeta.hasUrgentTimeCommit,
            initials: getDriverInitials(row.name),
            color: getDriverPinColor(row.route_status)
          };
        })
        .filter(Boolean),
    [routeRows, routeDetailsById]
  );

  const routeColorMap = useMemo(
    () => getRouteColorMap(overviewRoutes),
    [overviewRoutes]
  );

  const mappableRouteDetails = useMemo(
    () =>
      (routeDetailMapQuery.data || []).filter((item) =>
        getValidCoordinatePoints(
          (item?.stops || []).map((stop) => ({
            lat: Number(stop?.lat),
            lng: Number(stop?.lng)
          }))
        ).length > 0
      ),
    [routeDetailMapQuery.data]
  );

  const routeCentroidMarkers = useMemo(
    () => buildRouteCentroidMarkers(mappableRouteDetails, routeColorMap),
    [mappableRouteDetails, routeColorMap]
  );

  const activeMapMarkers = driverPositionMarkers.length > 0 ? driverPositionMarkers : routeCentroidMarkers;
  const dashboardBoundsPoints = useMemo(
    () =>
      mappableRouteDetails.flatMap((item) =>
        getValidCoordinatePoints(
          (item?.stops || []).map((stop) => ({
            lat: Number(stop?.lat),
            lng: Number(stop?.lng)
          }))
        )
      ),
    [mappableRouteDetails]
  );
  const routeLegendItems = useMemo(
    () =>
      overviewRoutes.map((route) => ({
        workAreaName: route.work_area_name,
        color: routeColorMap.get(route.work_area_name) || '#ff6200',
        stopCount: route.total_stops || 0,
        mapStatus: route.map_status || 'needs_pins',
        missingStops: Number(route.missing_stops || 0)
      })),
    [overviewRoutes, routeColorMap]
  );
  const mapCoverageSummary = useMemo(
    () =>
      getMapCoverageSummary({
        totalRoutes: overviewRoutes.length,
        mappableRouteDetails,
        driverPositionMarkers,
        routeCentroidMarkers,
        overviewRoutes
      }),
    [overviewRoutes, mappableRouteDetails, driverPositionMarkers, routeCentroidMarkers]
  );

  function handleSyncRoutes() {
    navigate(`/manifest?date=${dashboardDate}&action=sync`);
  }

  function handleAssignDrivers() {
    navigate(`/manifest?date=${dashboardDate}`);
  }

  return (
    <section className="page-section">
      {bannerState !== 'loading' ? <div className={`sync-banner ${bannerState}${bannerState === 'active' && isCompactBanner ? ' compact' : ''}`}>
        {bannerState === 'missing' ? (
          <>
            <div>
              <h2>{missingRoutesState.title}</h2>
              <p>{missingRoutesState.detail}</p>
            </div>
            <button className="sync-banner-button" onClick={handleSyncRoutes} type="button">
              Sync FedEx Routes Now
            </button>
          </>
        ) : null}

        {bannerState === 'needs-attention' ? (
          <>
            <div>
              <h2>
                {dispatchHealth.dispatchReadyRoutes.length} of {syncStatus?.routes_today || 0} routes dispatch-ready
              </h2>
              <p>
                {Math.max(0, Number(syncStatus?.routes_today || 0) - Number(syncStatus?.routes_assigned || 0))} need driver assignment
                {' · '}
                {dispatchHealth.routesNeedingPinReview.length} need pin review
                {' · '}
                {dispatchHealth.missingPinStops} missing stop pins
              </p>
            </div>
            <button className="sync-banner-button" onClick={handleAssignDrivers} type="button">
              Open Morning Setup
            </button>
          </>
        ) : null}

        {bannerState === 'active' ? (
          <div className="sync-banner-status">
            <strong>All {syncStatus?.routes_today || 0} routes dispatch-ready</strong>
            <span>{syncStatus?.drivers_on_road || 0} drivers on road</span>
          </div>
        ) : null}
      </div> : null}

      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>{getFriendlyDashboardDate(dashboard?.date)}</p>
        </div>
      </div>

      {dashboardQuery.isLoading && bannerState !== 'missing' ? <div className="card">Loading dashboard...</div> : null}
      {dashboardQuery.isError ? (
        <div className="card">
          {dashboardQuery.error?.response?.data?.error || 'Dashboard failed to load. Refresh and try again.'}
        </div>
      ) : null}

      {dashboardQuery.isLoading ? (
        <div className="stats-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {bannerState === 'missing' && !dashboardQuery.isLoading ? (
        <div className="card empty-routes-card">
          <div className="empty-routes-card-copy">
            <div className="card-title">Waiting For Route Sync</div>
            <p>
              ReadyRoute will show today&apos;s stop counts, dispatch readiness, and CSA map coverage here as soon as
              the day&apos;s FedEx routes are available.
            </p>
          </div>
          <div className="empty-routes-card-grid">
            <div className="empty-routes-stat">
              <strong>{syncStatus?.last_sync_at ? formatSyncTimestamp(syncStatus.last_sync_at) : 'No sync recorded yet'}</strong>
              <span>Most recent route sync</span>
            </div>
            <div className="empty-routes-stat">
              <strong>Automatic when routes are loaded</strong>
              <span>Dashboard cards and CSA map</span>
            </div>
            <div className="empty-routes-stat">
              <strong>Manual fallback available</strong>
              <span>Upload XLS, GPX, or both from Manifest</span>
            </div>
          </div>
          <div className="empty-routes-actions">
            <button className="primary-cta" onClick={handleSyncRoutes} type="button">
              Open Route Sync
            </button>
            <button className="secondary-button" onClick={() => navigate(`/fleet-map?date=${dashboardDate}`)} type="button">
              View Fleet Map
            </button>
          </div>
        </div>
      ) : null}

      {activeDashboard && bannerState !== 'missing' ? (
        <>
          <div className="stats-grid dashboard-compact-stats">
            <div className="stat-card dashboard-metric-card delivery">
              <div className="stat-label">Total Deliveries</div>
              <div className="stat-value">{activeDashboard.delivery_stops ?? activeDashboard.total_delivery_stops ?? activeDashboard.total_stops ?? 0}</div>
            </div>
            <div className="stat-card dashboard-metric-card delivery">
              <div className="stat-label">Completed Deliveries</div>
              <div className="stat-value">{activeDashboard.delivery_stops_completed ?? 0}</div>
            </div>
            <div className="stat-card dashboard-metric-card delivery">
              <div className="stat-label">Remaining Deliveries</div>
              <div className="stat-value">{(activeDashboard.delivery_stops ?? activeDashboard.total_delivery_stops) != null ? getRemainingDeliveries(activeDashboard) : getRemainingStops(activeDashboard)}</div>
            </div>
            <div className="stat-card dashboard-metric-card pickup">
              <div className="stat-label">Total Pickups</div>
              <div className="stat-value">{activeDashboard.pickup_stops ?? activeDashboard.total_pickup_stops ?? 0}</div>
            </div>
            <div className="stat-card dashboard-metric-card pickup">
              <div className="stat-label">Completed Pickups</div>
              <div className="stat-value">{activeDashboard.pickup_stops_completed ?? 0}</div>
            </div>
            <div className="stat-card dashboard-metric-card pickup">
              <div className="stat-label">Remaining Pickups</div>
              <div className="stat-value">{getRemainingPickups(activeDashboard)}</div>
            </div>
            <div className="stat-card dashboard-metric-card speed">
              <div className="stat-label">Fleet Stops/Hr</div>
              <div className="stat-value">{getFleetStopsPerHour(routeRows)}</div>
            </div>
          </div>

          <div className="card dispatch-health-card">
            <div className="dispatch-health-header">
              <div className="card-title">Dispatch Readiness</div>
              <div className="driver-meta">
                {dispatchHealth.dispatchReadyRoutes.length} of {dispatchHealth.totalRoutes} routes ready to roll
              </div>
            </div>
            <div className="dispatch-health-grid">
              <div className="dispatch-health-stat">
                <div className="dispatch-health-value">{dispatchHealth.dispatchReadyRoutes.length}</div>
                <div className="dispatch-health-label">Dispatch-ready</div>
              </div>
              <div className="dispatch-health-stat">
                <div className="dispatch-health-value">{dispatchHealth.routesNeedingAssignment.length}</div>
                <div className="dispatch-health-label">Need driver</div>
              </div>
              <div className="dispatch-health-stat">
                <div className="dispatch-health-value">{dispatchHealth.routesNeedingVehicle.length}</div>
                <div className="dispatch-health-label">Need vehicle</div>
              </div>
              <div className="dispatch-health-stat">
                <div className="dispatch-health-value">{dispatchHealth.routesNeedingPinReview.length}</div>
                <div className="dispatch-health-label">Need pin review</div>
              </div>
              <div className="dispatch-health-stat">
                <div className="dispatch-health-value">{dispatchHealth.routesWithWarnings.length}</div>
                <div className="dispatch-health-label">Route warnings</div>
              </div>
            </div>
            {dispatchHealth.routesNeedingAssignment.length > 0 ||
            dispatchHealth.routesNeedingVehicle.length > 0 ||
            dispatchHealth.routesNeedingPinReview.length > 0 ||
            dispatchHealth.routesWithWarnings.length > 0 ? (
              <div className="dispatch-health-route-list">
                {dispatchHealth.routesNeedingAssignment.map((route) => (
                  <button
                    className="dispatch-health-chip assignment"
                    key={`assignment-${route.id}`}
                    onClick={() => navigate(`/manifest?date=${dashboardDate}`)}
                    type="button"
                  >
                    {route.work_area_name}: assign driver
                  </button>
                ))}
                {dispatchHealth.routesNeedingVehicle.map((route) => (
                  <button
                    className="dispatch-health-chip vehicle"
                    key={`vehicle-${route.id}`}
                    onClick={() => navigate(`/manifest?date=${dashboardDate}`)}
                    type="button"
                  >
                    {route.work_area_name}: assign vehicle
                  </button>
                ))}
                {dispatchHealth.routesNeedingPinReview.map((route) => (
                  <button
                    className={`dispatch-health-chip ${route.map_status === 'needs_pins' ? 'pins' : 'partial'}`}
                    key={`pins-${route.id}`}
                    onClick={() => navigate(`/routes/${route.id}?date=${dashboardDate}`)}
                    type="button"
                  >
                    {route.work_area_name}: {route.map_status === 'needs_pins' ? 'needs pins' : `${route.missing_stops || 0} pins missing`}
                  </button>
                ))}
                {dispatchHealth.routesWithWarnings.map((route) => (
                  <button
                    className="dispatch-health-chip warning"
                    key={`warning-${route.id}`}
                    onClick={() => navigate(`/routes/${route.id}?date=${dashboardDate}`)}
                    type="button"
                  >
                    {route.work_area_name}: review route warnings
                  </button>
                ))}
              </div>
            ) : (
              <div className="success-banner">All visible routes have drivers, vehicles, and usable map coverage.</div>
            )}
          </div>

          <div className="card">
            <div className="dashboard-toolbar">
              <div className="card-title">Fleet View</div>
              <div className="toggle-group">
                <button
                  className={viewMode === 'map' ? 'toggle-button active' : 'toggle-button'}
                  onClick={() => setViewMode('map')}
                  type="button"
                >
                  Map View
                </button>
                <button
                  className={viewMode === 'list' ? 'toggle-button active' : 'toggle-button'}
                  onClick={() => setViewMode('list')}
                  type="button"
                >
                  List View
                </button>
              </div>
            </div>

            {viewMode === 'list' ? (
              <div className="driver-table">
                <div className="driver-table-header">
                  <span>Route</span>
                  <span>Vehicle</span>
                  <span>Driver</span>
                  <span>Status</span>
                  <span>Completed</span>
                  <span>Remaining</span>
                  <span>Stops/Hr</span>
                  <span>Last Ping</span>
                  <span>Online</span>
                </div>
                <div className="driver-table-body">
                  {routeRows.map((driver) => (
                    <DriverRow
                      driver={driver}
                      key={driver.route_id || `${driver.work_area_name}-${driver.driver_id || 'unassigned'}`}
                      onAssign={handleAssignDrivers}
                      onAssignVehicle={(vehicleId, openPicker = false) => {
                        if (openPicker) {
                          setVehiclePickerRouteId(driver.route_id);
                          return;
                        }

                        if (!vehicleId || !driver.route_id) {
                          return;
                        }

                        assignVehicleMutation.mutate({ routeId: driver.route_id, vehicleId });
                      }}
                      onClick={() => driver.name && driver.route_id && navigate(`/routes/${driver.route_id}?date=${dashboardDate}`)}
                      showVehiclePicker={vehiclePickerRouteId === driver.route_id}
                      vehicles={(vehiclesQuery.data || []).filter((vehicle) => vehicle.is_active !== false)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="dashboard-map-shell">
                <div className="dashboard-map-meta">
                  <div>
                    <div className="card-title">CSA Map</div>
                    <div className="driver-meta">
                      {driverPositionMarkers.length > 0
                        ? `Showing live driver markers for ${mapCoverageSummary.liveMarkerCount} route${mapCoverageSummary.liveMarkerCount === 1 ? '' : 's'} and route footprints for ${mapCoverageSummary.footprintCount} mapped route${mapCoverageSummary.footprintCount === 1 ? '' : 's'}`
                        : `Showing route footprints for ${mapCoverageSummary.footprintCount} mapped route${mapCoverageSummary.footprintCount === 1 ? '' : 's'} until drivers come online`}
                    </div>
                  </div>
                  {routeLegendItems.length > 0 ? (
                    <div className="dashboard-map-legend">
                      {routeLegendItems.map((item) => (
                        <div className={`dashboard-map-legend-item ${item.mapStatus === 'needs_pins' ? 'muted' : ''}`} key={item.workAreaName}>
                          <span className="dashboard-map-legend-dot" style={{ background: item.color }} />
                          <span>
                            {item.workAreaName}
                            {item.mapStatus === 'partially_mapped' ? ` · ${item.missingStops} missing` : ''}
                            {item.mapStatus === 'needs_pins' ? ' · needs pins' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {mapCoverageSummary.excludedRouteCount > 0 ? (
                  <div className="info-banner dashboard-map-health-banner">
                    {mapCoverageSummary.excludedRouteCount} route{mapCoverageSummary.excludedRouteCount === 1 ? '' : 's'} excluded from the map until pins are available:
                    {' '}
                    {mapCoverageSummary.excludedRoutes.map((route) => route.work_area_name).join(', ')}
                  </div>
                ) : null}
                {driverPositionMarkers.length > 0 ? (
                  <div className="info-banner dashboard-map-health-banner">
                    Live driver pings are only shown when they stay close to the actual route footprint. Everything else falls back to stop-based route centers to keep the CSA map truthful.
                  </div>
                ) : null}
                <DashboardFleetMap
                  center={activeMapMarkers[0] ? { lat: Number(activeMapMarkers[0].lat), lng: Number(activeMapMarkers[0].lng) } : null}
                  boundsPoints={dashboardBoundsPoints}
                  markers={activeMapMarkers}
                />
              </div>
            )}
          </div>

          <OverviewRoutesSection
            date={dashboardDate}
            routes={routesOverviewQuery.isLoading ? null : overviewRoutes}
          />
        </>
      ) : null}
    </section>
  );
}
