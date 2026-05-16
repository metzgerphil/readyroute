import { format } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { PageHeader } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import { createDriverPositionMarker } from '../utils/stopMarkers';
import { buildTelHref, getStopContactDetails } from '../utils/contactInfo';
import { getTodayString, loadStoredOperationsDate, saveStoredOperationsDate } from '../utils/operationsDate';
import { sortRoutesByWorkArea } from '../utils/routeSort';
import './FleetMapPage.css';

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;
const GOOGLE_MAPS_SRC = GOOGLE_MAPS_KEY
  ? `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&v=weekly`
  : null;
const GOOGLE_MAPS_PLACEHOLDER_KEYS = new Set(['your_key_here', 'your_production_key']);

let googleMapsScriptPromise = null;

function loadGoogleMapsScript() {
  if (!GOOGLE_MAPS_KEY || GOOGLE_MAPS_PLACEHOLDER_KEYS.has(GOOGLE_MAPS_KEY)) {
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

function isMobileMapViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPickupStopCount(route) {
  const summaryCount = Number(route?.pickup_stops ?? route?.pickup_stop_count ?? route?.total_pickup_stops);

  if (Number.isFinite(summaryCount)) {
    return summaryCount;
  }

  return (route?.stops || []).filter((stop) => (
    stop?.has_pickup ||
    stop?.is_pickup ||
    stop?.stop_type === 'pickup' ||
    stop?.stop_type === 'combined'
  )).length;
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
  const initialDate = searchParams.get('date') || loadStoredOperationsDate() || getTodayString();
  const [date, setDate] = useState(initialDate);
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [mapMountNonce, setMapMountNonce] = useState(0);
  const { selectedCsaId } = useSelectedCsa();

  const handleMapContainerRef = useCallback((node) => {
    mapContainerRef.current = node;

    if (node) {
      setMapMountNonce((value) => value + 1);
    }
  }, []);

  useEffect(() => {
    saveStoredOperationsDate(date);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', date);
    setSearchParams(nextParams, { replace: true });
  }, [date, searchParams, setSearchParams]);

  const routesQuery = useQuery({
    queryKey: ['fleet-map-routes', selectedCsaId, date],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/routes', { params: { date } });
      return response.data?.routes || [];
    }
  });

  const routes = useMemo(() => sortRoutesByWorkArea(routesQuery.data || []), [routesQuery.data]);
  const hasNoRoutes = !routesQuery.isLoading && routes.length === 0;
  const routesWithColors = useMemo(
    () => routes.map((route, index) => ({ ...route, routeColor: getRouteColor(route, index) })),
    [routes]
  );

  const driverPositionsQuery = useQuery({
    queryKey: ['fleet-map-driver-positions', selectedCsaId, date, routesWithColors.map((route) => route.id).join(',')],
    enabled: Boolean(selectedCsaId) && routesWithColors.length > 0,
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
    refetchInterval: 30000
  });

  const driverPositions = useMemo(() => driverPositionsQuery.data || {}, [driverPositionsQuery.data]);

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
  const selectedRoute = routesWithColors.find((route) => route.id === selectedRouteId) || null;

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
            gestureHandling: isMobileMapViewport() ? 'cooperative' : 'auto',
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
  }, [hasNoRoutes, mapMountNonce]);

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
        const contact = getStopContactDetails(stop);
        const phoneForPopup = contact.primaryPhone || contact.alternatePhone;
        const phoneHref = buildTelHref(phoneForPopup);
        const routeUrl = `/routes/${encodeURIComponent(route.id)}?date=${encodeURIComponent(date)}`;
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
              <div style="font-size:14px; font-weight:900; color:${escapeHtml(route.routeColor)};">Route ${escapeHtml(route.work_area_name || '—')}</div>
              <div style="margin-top:4px; font-size:13px; font-weight:900;">Stop ${escapeHtml(stop.sequence_order || '—')}</div>
              <div style="margin-top:6px; font-size:12px; color:#374151;">${escapeHtml(stop.address || 'No address available')}</div>
              ${
                contact.hasAny
                  ? `<div style="margin-top:8px; padding:7px 8px; border-radius:10px; background:#f0fdfa; color:#0f766e; font-size:12px; font-weight:800;">
                      ${escapeHtml(contact.contactName || contact.businessName || 'Contact info on manifest')}
                      ${
                        phoneForPopup
                          ? `<br/>${phoneHref ? `<a href="${escapeHtml(phoneHref)}" style="color:#0f766e; text-decoration:none;">${escapeHtml(phoneForPopup)}</a>` : escapeHtml(phoneForPopup)}`
                          : ''
                      }
                    </div>`
                  : ''
              }
              <div style="margin-top:8px; font-size:12px; color:#5f6b76;">${escapeHtml(route.driver_name || 'Unassigned driver')}</div>
              <a href="${escapeHtml(routeUrl)}" style="display:inline-flex; margin-top:8px; color:#ff6200; font-size:12px; font-weight:900; text-decoration:none;">Open route details</a>
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
      <PageHeader
        title="Fleet Map"
        description={`${totalVisibleStops} stop points across ${routesWithColors.length} routes for ${getFriendlyDate(date)}`}
        actions={(
          <>
            <label className="route-page-field fleet-map-date-field">
              <span>Date</span>
              <input className="date-field route-toolbar-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <button className="secondary-button fleet-map-filter-button" disabled type="button">
              Filters
            </button>
          </>
        )}
      />

      <div className="fleet-map-layout">
        <div className="card fleet-map-canvas-card">
          <div className="fleet-map-card-header">
            <div>
              <div className="card-title">Dispatch map</div>
              <div className="fleet-map-subtitle">
                Google map controls include map, satellite, zoom, street view, and fullscreen.
              </div>
            </div>
            {selectedRoute ? (
              <div className="fleet-map-selected-route" style={{ borderColor: selectedRoute.routeColor }}>
                Route {selectedRoute.work_area_name || '--'}
              </div>
            ) : null}
          </div>
          <div ref={handleMapContainerRef} className="fleet-map-canvas" />
          {hasNoRoutes ? (
            <div className="fleet-map-empty-state">
              <div className="fleet-map-empty-state-title">No routes mapped for this date</div>
              <p>
                Sync routes or upload a manifest to view them here.
              </p>
              <div className="fleet-map-empty-state-actions">
                <button className="primary-cta" onClick={() => navigate(`/manifest?date=${date}&action=sync`)} type="button">
                  Sync routes
                </button>
                <button className="secondary-button" onClick={() => navigate(`/manifest?date=${date}`)} type="button">
                  Upload manifest
                </button>
              </div>
            </div>
          ) : null}
          {!hasNoRoutes && mapError ? <div className="fleet-map-error">{mapError}</div> : null}
        </div>

        <aside className="card fleet-map-summary-card">
          <div className="fleet-map-panel-header">
            <div>
              <div className="card-title">Active Routes</div>
              <div className="fleet-map-subtitle">{routesWithColors.length} route{routesWithColors.length === 1 ? '' : 's'} visible</div>
            </div>
          </div>
          {routesQuery.isLoading ? <div className="fleet-map-empty">Loading routes...</div> : null}
          {!routesQuery.isLoading && routesWithColors.length === 0 ? (
            <div className="fleet-map-empty">Waiting for route sync or manual upload.</div>
          ) : null}
          <div className="fleet-map-summary-list">
            {routesWithColors.map((route) => {
              const pickupStopCount = getPickupStopCount(route);

              return (
              <button
                key={route.id}
                type="button"
                className={`fleet-map-summary-row${selectedRouteId === route.id ? ' active' : ''}`}
                style={{ '--route-color': route.routeColor }}
                onClick={() => setSelectedRouteId(route.id)}
              >
                <div className="fleet-map-summary-topline">
                  <span className="fleet-map-route-identity">
                    <span className="fleet-map-route-key-dot" style={{ backgroundColor: route.routeColor }} />
                    <strong>Route {route.work_area_name || '—'}</strong>
                  </span>
                  <span className={`fleet-map-status-pill ${route.status || 'pending'}`}>{getDisplayStatusLabel(route)}</span>
                </div>
                <div className="fleet-map-summary-driver">{route.driver_name || 'Unassigned driver'}</div>
                <div className="fleet-map-summary-metrics">
                  <span>{getProgressText(route)}</span>
                  <span>{route.stops?.length ? `${route.stops.length} mapped points` : 'No mapped stops'}</span>
                </div>
                <div className="fleet-map-pickup-status">
                  <span className="fleet-map-pickup-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 3 20 7.5v8.8l-8 4.7-8-4.7V7.5L12 3Z" />
                      <path d="M4.5 7.8 12 12l7.5-4.2M12 12v8.3M12 5.8v6.1m-3.2-3 3.2-3.2 3.2 3.2" />
                    </svg>
                  </span>
                  {pickupStopCount} pickup{pickupStopCount === 1 ? '' : 's'}
                </div>
              </button>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}
