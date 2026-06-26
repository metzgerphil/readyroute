import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { EmptyState, ErrorState, LoadingState } from '../components/PortalDesignSystem';
import { loadGoogleMaps } from '../lib/googleMapsLoader';
import { createDriverPositionMarker } from '../utils/stopMarkers';
import {
  buildOperationsDatePath,
  getResolvedOperationsDate,
  saveStoredOperationsDate
} from '../utils/operationsDate';
import { escapeHtml, toUsableMapPoint } from '../utils/routePageHelpers';
import './FleetMapPage.css';

const EMPTY_ARRAY = [];
const EMPTY_OBJECT = {};

function getFriendlyDate(dateValue) {
  return format(new Date(`${dateValue}T12:00:00`), 'MMMM d, yyyy');
}

function getStatusLabel(status) {
  switch (status) {
    case 'in_progress':
      return 'In Progress';
    case 'ready':
      return 'Ready';
    case 'complete':
      return 'Complete';
    case 'pending':
    default:
      return 'Pending';
  }
}

function getDisplayStatusLabel(route) {
  if (route.status === 'pending' && route.driver_id) {
    return 'Assigned';
  }

  return getStatusLabel(route.status);
}

function getProgressText(route) {
  return `${Number(route.completed_stops || 0)} / ${Number(route.total_stops || 0)} stops`;
}

const ROUTE_COLORS = [
  '#FF6200',
  '#2563eb',
  '#16a34a',
  '#9333ea',
  '#dc2626',
  '#0891b2',
  '#ea580c',
  '#be185d',
  '#65a30d',
  '#7c3aed'
];

function getRouteColor(route, index) {
  const seed = String(route.work_area_name || route.id || index);
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ROUTE_COLORS[hash % ROUTE_COLORS.length];
}

export default function FleetMapPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const infoWindowRef = useRef(null);
  const stopMarkersRef = useRef([]);
  const driverMarkersRef = useRef(new Map());
  const routeLinesRef = useRef([]);
  const date = getResolvedOperationsDate(searchParams);
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  useEffect(() => {
    saveStoredOperationsDate(date);

    if (searchParams.get('date') === date) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', date);
    setSearchParams(nextParams, { replace: true });
  }, [date, searchParams, setSearchParams]);

  function handleDateChange(nextDate) {
    saveStoredOperationsDate(nextDate);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', nextDate);
    setSearchParams(nextParams);
  }

  const routesQuery = useQuery({
    queryKey: ['fleet-map-routes', date],
    queryFn: async () => {
      const response = await api.get('/manager/routes', { params: { date } });
      return response.data?.routes || [];
    }
  });

  const routes = useMemo(() => routesQuery.data || EMPTY_ARRAY, [routesQuery.data]);
  const hasNoRoutes = !routesQuery.isLoading && !routesQuery.isError && routes.length === 0;
  const routesWithColors = useMemo(
    () => routes.map((route, index) => ({ ...route, routeColor: getRouteColor(route, index) })),
    [routes]
  );

  const driverPositionsQuery = useQuery({
    queryKey: ['fleet-map-driver-positions', date, routesWithColors.map((route) => route.id).join(',')],
    enabled: routesWithColors.length > 0,
    queryFn: async () => {
      const responses = await Promise.all(
        routesWithColors.map(async (route) => {
          try {
            const response = await api.get(`/manager/routes/${route.id}/driver-position`);
            return { routeId: route.id, position: response.data };
          } catch {
            return { routeId: route.id, position: null };
          }
        })
      );

      return responses.reduce((accumulator, item) => {
        accumulator[item.routeId] = item.position;
        return accumulator;
      }, {});
    },
    refetchInterval: 10000
  });

  const driverPositions = useMemo(() => driverPositionsQuery.data || EMPTY_OBJECT, [driverPositionsQuery.data]);

  const routeRows = useMemo(
    () =>
      routesWithColors.map((route) => {
        const stops = route.stops || EMPTY_ARRAY;
        const mappableStops = stops.filter((stop) => toUsableMapPoint(stop));
        const driverPoint = toUsableMapPoint(driverPositions[route.id]);

        return {
          route,
          position: driverPoint ? { ...driverPositions[route.id], ...driverPoint } : null,
          stops: mappableStops,
          unmappedStopCount: Math.max(0, stops.length - mappableStops.length)
        };
      }),
    [driverPositions, routesWithColors]
  );

  const totalVisibleStops = useMemo(
    () => routeRows.reduce((sum, row) => sum + row.stops.length, 0),
    [routeRows]
  );
  const totalUnmappedStops = useMemo(
    () => routeRows.reduce((sum, row) => sum + row.unmappedStopCount, 0),
    [routeRows]
  );

  useEffect(() => {
    let active = true;

    async function initMap() {
      if (hasNoRoutes) {
        setMapError('');
        setMapReady(false);
        return;
      }

      if (!mapContainerRef.current) {
        return;
      }

      try {
        const { Map } = await loadGoogleMaps();
        const google = window.google;

        if (!active || !mapContainerRef.current || !Map || !google?.maps) {
          return;
        }

        setMapError('');

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new Map(mapContainerRef.current, {
            center: { lat: 33.1217, lng: -117.0815 },
            zoom: 11,
            mapTypeId: 'roadmap',
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: true,
            zoomControl: true
          });
          infoWindowRef.current = new google.maps.InfoWindow();
        }

        window.setTimeout(() => {
          if (!active || !mapInstanceRef.current || !window.google?.maps) {
            return;
          }

          window.google.maps.event.trigger(mapInstanceRef.current, 'resize');
        }, 0);

        setMapReady(true);
      } catch (error) {
        console.error('FleetMapPage Google Maps load failed:', error);
        if (active) {
          setMapReady(false);
          setMapError('Google Maps could not load for the fleet map.');
        }
      }
    }

    initMap();

    return () => {
      active = false;
    };
  }, [hasNoRoutes]);

  useEffect(() => {
    const google = window.google;
    const map = mapInstanceRef.current;
    const infoWindow = infoWindowRef.current;

    if (!google?.maps || !map || !mapReady) {
      return;
    }

    stopMarkersRef.current.forEach((marker) => marker.setMap(null));
    stopMarkersRef.current = [];
    driverMarkersRef.current.forEach((marker) => marker.setMap(null));
    driverMarkersRef.current.clear();
    routeLinesRef.current.forEach((line) => line.setMap(null));
    routeLinesRef.current = [];

    const bounds = new google.maps.LatLngBounds();

    routeRows.forEach(({ route, position, stops }) => {
      if (stops.length > 1) {
        const routeLine = new google.maps.Polyline({
          map,
          path: stops.map((stop) => toUsableMapPoint(stop)).filter(Boolean),
          strokeColor: route.routeColor,
          strokeOpacity: selectedRouteId === route.id ? 0.9 : 0.45,
          strokeWeight: selectedRouteId === route.id ? 4 : 2,
          zIndex: selectedRouteId === route.id ? 8 : 4
        });
        routeLinesRef.current.push(routeLine);
      }

      stops.forEach((stop) => {
        const stopPoint = toUsableMapPoint(stop);
        if (!stopPoint) {
          return;
        }

        const stopMarker = new google.maps.Marker({
          map,
          position: stopPoint,
          title: `${route.work_area_name || 'Route'} · Stop ${stop.sequence_order}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: selectedRouteId === route.id ? 6.5 : 5,
            fillColor: route.routeColor,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          },
          zIndex: selectedRouteId === route.id ? 25 : 10,
          optimized: true
        });

        stopMarker.addListener('click', () => {
          setSelectedRouteId(route.id);
          infoWindow.setContent(`
            <div style="min-width:220px; color:#173042; padding:8px 6px;">
              <div style="font-size:14px; font-weight:900; color:${route.routeColor};">Route ${escapeHtml(route.work_area_name || '—')}</div>
              <div style="margin-top:4px; font-size:13px; font-weight:900;">Stop ${escapeHtml(stop.sequence_order)}</div>
              <div style="margin-top:6px; font-size:12px; color:#374151;">${escapeHtml(stop.address || 'No address available')}</div>
              <div style="margin-top:8px; font-size:12px; color:#5f6b76;">${escapeHtml(route.driver_name || 'Unassigned driver')}</div>
            </div>
          `);
          infoWindow.open({ anchor: stopMarker, map });
        });

        stopMarkersRef.current.push(stopMarker);
        bounds.extend(stopPoint);
      });

      if (position) {
        const driverMarker = new google.maps.Marker({
          map,
          position,
          title: route.driver_name || route.work_area_name || 'Route',
          icon: createDriverPositionMarker(route.driver_name, route.status),
          zIndex: selectedRouteId === route.id ? 50 : 30
        });

        driverMarker.addListener('click', () => {
          setSelectedRouteId(route.id);
          infoWindow.setContent(`
            <div style="min-width:220px; color:#173042; padding:8px 6px;">
              <div style="font-size:15px; font-weight:900;">${escapeHtml(route.driver_name || 'Unassigned')}</div>
              <div style="margin-top:4px; font-size:13px; color:${route.routeColor}; font-weight:900;">Work Area ${escapeHtml(route.work_area_name || '—')}</div>
              <div style="margin-top:10px; font-size:12px; color:#5f6b76;">${escapeHtml(getProgressText(route))}</div>
              <div style="margin-top:4px; font-size:12px; color:#5f6b76;">Status: ${escapeHtml(getDisplayStatusLabel(route))}</div>
            </div>
          `);
          infoWindow.open({ anchor: driverMarker, map });
        });

        driverMarkersRef.current.set(route.id, driverMarker);
        bounds.extend(position);
      }
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 72);
    } else {
      map.setCenter({ lat: 33.1217, lng: -117.0815 });
      map.setZoom(11);
    }
  }, [mapReady, routeRows, selectedRouteId]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const selectedMarker = driverMarkersRef.current.get(selectedRouteId);

    if (!map) {
      return;
    }

    if (selectedMarker) {
      map.panTo(selectedMarker.getPosition());
      return;
    }

    const selectedRoute = routeRows.find((row) => row.route.id === selectedRouteId);
    if (!selectedRoute?.stops?.length) {
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    selectedRoute.stops.forEach((stop) => {
      const stopPoint = toUsableMapPoint(stop);
      if (stopPoint) {
        bounds.extend(stopPoint);
      }
    });
    map.fitBounds(bounds, 72);
  }, [routeRows, selectedRouteId]);

  return (
    <section className="page-section fleet-map-page">
      <div className="page-header">
        <div>
          <h1>Fleet Map</h1>
          <p>{`${totalVisibleStops} stop points across ${routesWithColors.length} routes for ${getFriendlyDate(date)}`}</p>
        </div>
      </div>

      <div className="card fleet-map-toolbar">
        <label className="route-page-field">
          <span>Date</span>
          <input className="date-field route-toolbar-input" type="date" value={date} onChange={(event) => handleDateChange(event.target.value)} />
        </label>
      </div>

      {totalUnmappedStops > 0 ? (
        <div className="fleet-map-coordinate-warning" role="status">
          {totalUnmappedStops} stop{totalUnmappedStops === 1 ? '' : 's'} could not be mapped.
        </div>
      ) : null}

      <div className="fleet-map-layout">
        <div className="card fleet-map-canvas-card">
          <div ref={mapContainerRef} className="fleet-map-canvas" />
          {routesQuery.isLoading ? (
            <div className="fleet-map-empty-state">
              <LoadingState title="Loading fleet map routes" />
            </div>
          ) : null}
          {routesQuery.isError ? (
            <div className="fleet-map-empty-state">
              <ErrorState
                title="Unable to load fleet map routes"
                description="Routes for this map could not be loaded."
                onRetry={() => routesQuery.refetch()}
              />
            </div>
          ) : null}
          {hasNoRoutes ? (
            <div className="fleet-map-empty-state">
              <div className="fleet-map-empty-state-title">No routes loaded for this date yet.</div>
              <p>
                The fleet map will populate automatically once FedEx routes sync in or after you upload a route from
                the Manifest page.
              </p>
              <div className="fleet-map-empty-state-actions">
                <button className="primary-cta" onClick={() => navigate(buildOperationsDatePath('/manifest?action=sync', date))} type="button">
                  Open Route Sync
                </button>
                <button className="secondary-button" onClick={() => navigate(buildOperationsDatePath('/manifest', date))} type="button">
                  Open Manifest
                </button>
              </div>
            </div>
          ) : null}
          {!hasNoRoutes && mapError ? <div className="fleet-map-error">{mapError}</div> : null}
        </div>

        <aside className="card fleet-map-summary-card">
          <div className="card-title">Active Routes</div>
          {routesQuery.isLoading ? <LoadingState skeletonRows={2} title="Loading routes" /> : null}
          {routesQuery.isError ? (
            <ErrorState
              title="Unable to load routes"
              description="Active route rows could not be loaded for this date."
              onRetry={() => routesQuery.refetch()}
            />
          ) : null}
          {hasNoRoutes ? (
            <EmptyState
              variant="inline"
              title="Waiting for route sync or manual upload"
              description="Routes will appear here after a manifest or route file is loaded for this date."
            />
          ) : null}
          <div className="fleet-map-route-key">
            {routeRows.map(({ route }) => (
              <div className="fleet-map-route-key-row" key={route.id}>
                <span className="fleet-map-route-key-dot" style={{ backgroundColor: route.routeColor }} />
                <span>{route.work_area_name || '—'}</span>
              </div>
            ))}
          </div>
          <div className="fleet-map-summary-list">
            {routeRows.map(({ route, position, stops, unmappedStopCount }) => (
              <button
                key={route.id}
                type="button"
                className={`fleet-map-summary-row${selectedRouteId === route.id ? ' active' : ''}`}
                onClick={() => setSelectedRouteId(route.id)}
              >
                <div className="fleet-map-summary-topline">
                  <strong>{route.work_area_name || '—'}</strong>
                  <span className={`fleet-map-status-pill ${route.status || 'pending'}`}>{getDisplayStatusLabel(route)}</span>
                </div>
                <div className="fleet-map-summary-driver">{route.driver_name || 'Unassigned'}</div>
                <div className="fleet-map-summary-progress">{getProgressText(route)}</div>
                <div className="fleet-map-summary-muted">
                  {stops.length ? `${stops.length} mapped points` : 'No mapped stops'}
                </div>
                {unmappedStopCount > 0 ? (
                  <div className="fleet-map-summary-warning">
                    {unmappedStopCount} stop{unmappedStopCount === 1 ? '' : 's'} could not be mapped
                  </div>
                ) : null}
                {!position ? <div className="fleet-map-summary-muted">Driver GPS not live yet</div> : null}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
