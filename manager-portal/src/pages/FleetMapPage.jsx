import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { createDriverPositionMarker } from '../utils/stopMarkers';
import { getTodayString, saveStoredOperationsDate } from '../utils/operationsDate';
import './FleetMapPage.css';

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;
const GOOGLE_MAPS_SRC = GOOGLE_MAPS_KEY
  ? `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&v=weekly`
  : null;

let googleMapsScriptPromise = null;

function loadGoogleMapsScript() {
  if (!GOOGLE_MAPS_KEY || GOOGLE_MAPS_KEY === 'your_key_here') {
    return Promise.reject(new Error('missing_google_maps_key'));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google);
  }

  if (!googleMapsScriptPromise) {
    googleMapsScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-readyroute-google-maps="true"]');

      if (existingScript) {
        existingScript.addEventListener(
          'load',
          () => {
            if (window.google?.maps?.Map) {
              resolve(window.google);
            } else {
              reject(new Error('google_maps_auth_failed'));
            }
          },
          { once: true }
        );
        existingScript.addEventListener('error', () => reject(new Error('google_maps_script_failed')), { once: true });
        return;
      }

      window.__readyrouteGoogleMapsAuthFailed = false;
      window.gm_authFailure = () => {
        window.__readyrouteGoogleMapsAuthFailed = true;
      };

      const script = document.createElement('script');
      script.src = GOOGLE_MAPS_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.readyrouteGoogleMaps = 'true';
      script.onload = () => {
        if (window.__readyrouteGoogleMapsAuthFailed || !window.google?.maps?.Map) {
          reject(new Error('google_maps_auth_failed'));
          return;
        }
        resolve(window.google);
      };
      script.onerror = () => reject(new Error('google_maps_script_failed'));
      document.head.appendChild(script);
    });
  }

  return googleMapsScriptPromise;
}

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
  const initialDate = searchParams.get('date') || getTodayString();
  const [date, setDate] = useState(initialDate);
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  useEffect(() => {
    saveStoredOperationsDate(date);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', date);
    setSearchParams(nextParams, { replace: true });
  }, [date, searchParams, setSearchParams]);

  const routesQuery = useQuery({
    queryKey: ['fleet-map-routes', date],
    queryFn: async () => {
      const response = await api.get('/manager/routes', { params: { date } });
      return response.data?.routes || [];
    }
  });

  const routes = routesQuery.data || [];
  const hasNoRoutes = !routesQuery.isLoading && routes.length === 0;
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
          } catch (error) {
            return { routeId: route.id, position: null };
          }
        })
      );

      return responses.reduce((accumulator, item) => {
        accumulator[item.routeId] = item.position;
        return accumulator;
      }, {});
    },
    refetchInterval: 30000
  });

  const driverPositions = driverPositionsQuery.data || {};

  const routeRows = useMemo(
    () =>
      routesWithColors.map((route) => ({
        route,
        position: driverPositions[route.id] || null,
        stops: (route.stops || []).filter((stop) => Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng)))
      })),
    [driverPositions, routesWithColors]
  );

  const totalVisibleStops = useMemo(
    () => routeRows.reduce((sum, row) => sum + row.stops.length, 0),
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
        const google = await loadGoogleMapsScript();

        if (!active || !mapContainerRef.current) {
          return;
        }

        setMapError('');

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new google.maps.Map(mapContainerRef.current, {
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
          path: stops.map((stop) => ({ lat: Number(stop.lat), lng: Number(stop.lng) })),
          strokeColor: route.routeColor,
          strokeOpacity: selectedRouteId === route.id ? 0.9 : 0.45,
          strokeWeight: selectedRouteId === route.id ? 4 : 2,
          zIndex: selectedRouteId === route.id ? 8 : 4
        });
        routeLinesRef.current.push(routeLine);
      }

      stops.forEach((stop) => {
        const stopMarker = new google.maps.Marker({
          map,
          position: { lat: Number(stop.lat), lng: Number(stop.lng) },
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
              <div style="font-size:14px; font-weight:900; color:${route.routeColor};">Route ${route.work_area_name || '—'}</div>
              <div style="margin-top:4px; font-size:13px; font-weight:900;">Stop ${stop.sequence_order}</div>
              <div style="margin-top:6px; font-size:12px; color:#374151;">${stop.address || 'No address available'}</div>
              <div style="margin-top:8px; font-size:12px; color:#5f6b76;">${route.driver_name || 'Unassigned driver'}</div>
            </div>
          `);
          infoWindow.open({ anchor: stopMarker, map });
        });

        stopMarkersRef.current.push(stopMarker);
        bounds.extend({ lat: Number(stop.lat), lng: Number(stop.lng) });
      });

      if (position?.lat != null && position?.lng != null) {
        const driverMarker = new google.maps.Marker({
          map,
          position: { lat: Number(position.lat), lng: Number(position.lng) },
          title: route.driver_name || route.work_area_name || 'Route',
          icon: createDriverPositionMarker(route.driver_name, route.status),
          zIndex: selectedRouteId === route.id ? 50 : 30
        });

        driverMarker.addListener('click', () => {
          setSelectedRouteId(route.id);
          infoWindow.setContent(`
            <div style="min-width:220px; color:#173042; padding:8px 6px;">
              <div style="font-size:15px; font-weight:900;">${route.driver_name || 'Unassigned'}</div>
              <div style="margin-top:4px; font-size:13px; color:${route.routeColor}; font-weight:900;">Work Area ${route.work_area_name || '—'}</div>
              <div style="margin-top:10px; font-size:12px; color:#5f6b76;">${getProgressText(route)}</div>
              <div style="margin-top:4px; font-size:12px; color:#5f6b76;">Status: ${getDisplayStatusLabel(route)}</div>
            </div>
          `);
          infoWindow.open({ anchor: driverMarker, map });
        });

        driverMarkersRef.current.set(route.id, driverMarker);
        bounds.extend({ lat: Number(position.lat), lng: Number(position.lng) });
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
      bounds.extend({ lat: Number(stop.lat), lng: Number(stop.lng) });
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
          <input className="date-field route-toolbar-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>

      <div className="fleet-map-layout">
        <div className="card fleet-map-canvas-card">
          <div ref={mapContainerRef} className="fleet-map-canvas" />
          {hasNoRoutes ? (
            <div className="fleet-map-empty-state">
              <div className="fleet-map-empty-state-title">No routes loaded for this date yet.</div>
              <p>
                The fleet map will populate automatically once FedEx routes sync in or after you upload a route from
                the Manifest page.
              </p>
              <div className="fleet-map-empty-state-actions">
                <button className="primary-cta" onClick={() => navigate(`/manifest?date=${date}&action=sync`)} type="button">
                  Open Route Sync
                </button>
                <button className="secondary-button" onClick={() => navigate(`/manifest?date=${date}`)} type="button">
                  Open Manifest
                </button>
              </div>
            </div>
          ) : null}
          {!hasNoRoutes && mapError ? <div className="fleet-map-error">{mapError}</div> : null}
        </div>

        <aside className="card fleet-map-summary-card">
          <div className="card-title">Active Routes</div>
          {routesQuery.isLoading ? <div className="fleet-map-empty">Loading routes...</div> : null}
          {!routesQuery.isLoading && routesWithColors.length === 0 ? (
            <div className="fleet-map-empty">Waiting for route sync or manual upload.</div>
          ) : null}
          <div className="fleet-map-route-key">
            {routesWithColors.map((route) => (
              <div className="fleet-map-route-key-row" key={route.id}>
                <span className="fleet-map-route-key-dot" style={{ backgroundColor: route.routeColor }} />
                <span>{route.work_area_name || '—'}</span>
              </div>
            ))}
          </div>
          <div className="fleet-map-summary-list">
            {routesWithColors.map((route) => (
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
                  {route.stops?.length ? `${route.stops.length} mapped points` : 'No mapped stops'}
                </div>
                {!driverPositions[route.id]?.lat ? <div className="fleet-map-summary-muted">Driver GPS not live yet</div> : null}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
