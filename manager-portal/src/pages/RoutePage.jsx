import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import MapLegend from '../components/MapLegend';
import StopListDrawer from '../components/StopListDrawer';
import api from '../services/api';
import { loadGoogleMaps } from '../lib/googleMapsLoader';
import { getPropertyWorkflowHint } from '../utils/pinWorkflow';
import {
  ROUTE_STATUS_META,
  buildBoundary,
  buildDriverInfoWindow,
  buildInfoWindow,
  formatDateShort,
  formatTimestamp,
  getDistanceMiles,
  getExceptionBadgeMeta,
  getFlagTypeMeta,
  getFriendlyDate,
  getGoogleMapsErrorMessage,
  getInitialRouteDate,
  getRouteCentroid,
  getRouteDispatchWarnings,
  getStopMarkerLabel,
  warningFlagsToDraft
} from '../utils/routePageHelpers';
import { createDriverPositionMarker, createStopMarkerSVG, getMarkerZIndex } from '../utils/stopMarkers';
import './RoutePage.css';

const EMPTY_ARRAY = [];

export default function RoutePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const infoWindowRef = useRef(null);
  const selectedStopIdRef = useRef(null);
  const stopMarkersRef = useRef(new Map());
  const driverMarkerRef = useRef(null);
  const routePolylineRef = useRef(null);
  const territoryFillRef = useRef(null);
  const territoryBorderRef = useRef(null);
  const exceptionsPanelRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const mapStabilizeTimerRef = useRef(null);
  const mapTileWatchdogRef = useRef(null);
  const mapTilesLoadedRef = useRef(false);
  const [date, setDate] = useState(() => getInitialRouteDate(searchParams));
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapTilesPainted, setMapTilesPainted] = useState(false);
  const [mapRefreshNonce, setMapRefreshNonce] = useState(0);
  const [mapIsRepainting, setMapIsRepainting] = useState(false);
  const [mapType, setMapType] = useState('roadmap');
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showStopDrawer, setShowStopDrawer] = useState(true);
  const [showExceptions, setShowExceptions] = useState(false);
  const [activeExceptionsTab, setActiveExceptionsTab] = useState('exceptions');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteEditorStopId, setNoteEditorStopId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSavingPropertyIntel, setIsSavingPropertyIntel] = useState(false);
  const [propertyEditorStopId, setPropertyEditorStopId] = useState(null);
  const [propertyDraft, setPropertyDraft] = useState({
    property_type: '',
    building: '',
    access_note: '',
    parking_note: '',
    warning_flags: ''
  });
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  const clearMapArtifacts = useCallback(() => {
    stopMarkersRef.current.forEach((marker) => marker.setMap(null));
    stopMarkersRef.current.clear();

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setMap(null);
      driverMarkerRef.current = null;
    }

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    if (territoryFillRef.current) {
      territoryFillRef.current.setMap(null);
      territoryFillRef.current = null;
    }

    if (territoryBorderRef.current) {
      territoryBorderRef.current.setMap(null);
      territoryBorderRef.current = null;
    }
  }, []);

  const resetMapInstance = useCallback(() => {
    clearMapArtifacts();
    infoWindowRef.current?.close();
    infoWindowRef.current = null;
    mapInstanceRef.current = null;
    mapTilesLoadedRef.current = false;
    setMapReady(false);
    setMapTilesPainted(false);
  }, [clearMapArtifacts]);

  const routesQuery = useQuery({
    queryKey: ['route-page-routes', date],
    queryFn: async () => {
      const response = await api.get('/manager/routes', { params: { date } });
      return response.data?.routes || [];
    }
  });

  const routeOptions = useMemo(() => routesQuery.data || EMPTY_ARRAY, [routesQuery.data]);

  useEffect(() => {
    if (!id || routesQuery.isLoading) {
      return;
    }

    if (routeOptions.length && !routeOptions.some((route) => route.id === id)) {
      navigate(`/routes/${routeOptions[0].id}?date=${date}`, { replace: true });
    }
  }, [date, id, navigate, routeOptions, routesQuery.isLoading]);

  useEffect(() => {
    const requestedDate = searchParams.get('date');
    if (requestedDate && requestedDate !== date) {
      setDate(requestedDate);
    }
  }, [date, searchParams]);

  const routeDetailQuery = useQuery({
    queryKey: ['route-page-detail', id, date],
    queryFn: async () => {
      const response = await api.get(`/manager/routes/${id}/stops`, { params: { date } });
      return response.data;
    },
    enabled: Boolean(id)
  });

  const driverPositionQuery = useQuery({
    queryKey: ['route-page-driver-position', id],
    queryFn: async () => {
      const response = await api.get(`/manager/routes/${id}/driver-position`);
      return response.data;
    },
    enabled: Boolean(id),
    refetchInterval: 30000
  });

  const roadFlagsQuery = useQuery({
    queryKey: ['route-page-road-flags', id, date],
    queryFn: async () => {
      const response = await api.get(`/manager/routes/${id}/road-flags`, { params: { date } });
      return response.data?.road_flags || [];
    },
    enabled: Boolean(id)
  });

  const routeDetail = routeDetailQuery.data;
  const route = routeDetail?.route || routeOptions.find((item) => item.id === id) || null;
  const coordinateRecovery = routeDetail?.coordinate_recovery || null;
  const allStops = useMemo(() => routeDetail?.stops || EMPTY_ARRAY, [routeDetail?.stops]);
  const mappableStops = useMemo(
    () =>
      allStops.filter(
        (stop) =>
          stop?.lat != null &&
          stop?.lng != null &&
          Number.isFinite(Number(stop.lat)) &&
          Number.isFinite(Number(stop.lng))
      ),
    [allStops]
  );
  const orderedStops = useMemo(
    () => [...mappableStops].sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0)),
    [mappableStops]
  );
  const routeBounds = useMemo(() => buildBoundary(allStops), [allStops]);
  const routeCentroid = useMemo(() => getRouteCentroid(allStops), [allStops]);
  const exceptionStops = useMemo(
    () => allStops.filter((stop) => stop.exception_code),
    [allStops]
  );
  const incompleteStops = useMemo(
    () => allStops.filter((stop) => stop.status === 'incomplete'),
    [allStops]
  );
  const roadFlags = useMemo(() => roadFlagsQuery.data || EMPTY_ARRAY, [roadFlagsQuery.data]);
  const routeExceptionCount = exceptionStops.length + incompleteStops.length;
  const routeDispatchWarnings = useMemo(
    () => getRouteDispatchWarnings({ route, allStops, roadFlags }),
    [route, allStops, roadFlags]
  );
  const nextStop = useMemo(
    () => allStops.find((stop) => stop.status === 'pending') || null,
    [allStops]
  );
  const pendingTimeCommitCount = useMemo(
    () => allStops.filter((stop) => stop.status === 'pending' && stop.has_time_commit).length,
    [allStops]
  );
  const livePosition = driverPositionQuery.data || null;
  const routeDriverName = livePosition?.driver_name || route?.driver_name || 'Unassigned';
  const routeStatusMeta = ROUTE_STATUS_META[route?.status] || ROUTE_STATUS_META.pending;
  const selectedStop = allStops.find((stop) => stop.id === selectedStopId) || null;
  const noteEditorStop = allStops.find((stop) => stop.id === noteEditorStopId) || null;
  const propertyEditorStop = allStops.find((stop) => stop.id === propertyEditorStopId) || null;

  useEffect(() => {
    selectedStopIdRef.current = selectedStopId;
  }, [selectedStopId]);

  const getInfoWindowPixelOffset = useCallback((marker) => {
    const google = window.google;
    const map = mapInstanceRef.current;
    const position = marker?.getPosition?.();
    const projection = map?.getProjection?.();
    const center = map?.getCenter?.();
    const div = map?.getDiv?.();

    if (!google?.maps || !position || !projection || !center || !div) {
      return google?.maps ? new google.maps.Size(0, -8) : null;
    }

    const markerPoint = projection.fromLatLngToPoint(position);
    const centerPoint = projection.fromLatLngToPoint(center);
    const scale = 2 ** (map.getZoom() || 0);
    const markerY = (markerPoint.y - centerPoint.y) * scale + div.clientHeight / 2;
    const topSafeZone = 250;

    return new google.maps.Size(0, markerY < topSafeZone ? topSafeZone - markerY : -8);
  }, []);

  const openStopInfoWindow = useCallback((stop, marker) => {
    const infoWindow = infoWindowRef.current;
    const map = mapInstanceRef.current;

    if (!infoWindow || !map || !marker) {
      return;
    }

    const pixelOffset = getInfoWindowPixelOffset(marker);
    if (pixelOffset) {
      infoWindow.setOptions({ pixelOffset });
    }
    infoWindow.setContent(buildInfoWindow(stop));
    infoWindow.open({ anchor: marker, map, shouldFocus: false });
  }, [getInfoWindowPixelOffset]);

  const fitRoute = useCallback(() => {
    const google = window.google;
    const map = mapInstanceRef.current;

    if (!google?.maps || !map) {
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    orderedStops.forEach((stop) => {
      bounds.extend({ lat: Number(stop.lat), lng: Number(stop.lng) });
    });

    if (
      livePosition?.lat != null &&
      livePosition?.lng != null &&
      routeCentroid &&
      getDistanceMiles(
        { lat: Number(livePosition.lat), lng: Number(livePosition.lng) },
        routeCentroid
      ) <= 50
    ) {
      bounds.extend({ lat: Number(livePosition.lat), lng: Number(livePosition.lng) });
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 72);
    }
  }, [livePosition?.lat, livePosition?.lng, orderedStops, routeCentroid]);

  useEffect(() => {
    if (!actionMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setActionMessage(''), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [actionMessage]);

  useEffect(() => {
    if (!actionError) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setActionError(''), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [actionError]);

  useEffect(() => {
    setSelectedStopId(null);
    resetMapInstance();
    setMapRefreshNonce((value) => value + 1);
  }, [id, date, resetMapInstance]);

  useEffect(() => {
    if (!showExceptions) {
      return undefined;
    }

    function handleOutsideClick(event) {
      if (
        exceptionsPanelRef.current &&
        !exceptionsPanelRef.current.contains(event.target) &&
        !event.target.closest('.route-map-warning-button')
      ) {
        setShowExceptions(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showExceptions]);

  useEffect(() => {
    let active = true;

    function clearPendingStabilizeTimer() {
      if (mapStabilizeTimerRef.current) {
        window.clearTimeout(mapStabilizeTimerRef.current);
        mapStabilizeTimerRef.current = null;
      }
    }

    function clearTileWatchdog() {
      if (mapTileWatchdogRef.current) {
        window.clearTimeout(mapTileWatchdogRef.current);
        mapTileWatchdogRef.current = null;
      }
    }

    function mapHasPaintedSurface() {
      const mapContainer = mapContainerRef.current;

      if (!mapContainer) {
        return false;
      }

      return Boolean(
        mapContainer.querySelector('.gm-style canvas') ||
          mapContainer.querySelector('.gm-style img[src*="google"]') ||
          mapContainer.querySelector('.gm-style img[src^="http"]')
      );
    }

    function markMapPainted() {
      if (!active) {
        return;
      }

      mapTilesLoadedRef.current = true;
      setMapReady(true);
      setMapTilesPainted(true);
      setMapLoading(false);
      setMapIsRepainting(false);
      clearTileWatchdog();
    }

    function startTileWatchdog(google, map) {
      clearTileWatchdog();

      mapTileWatchdogRef.current = window.setTimeout(() => {
        if (!active || mapTilesLoadedRef.current || !mapContainerRef.current || !map) {
          return;
        }

        google.maps.event.trigger(map, 'resize');

        if (orderedStops.length) {
          fitRoute();
        }

        if (mapHasPaintedSurface()) {
          markMapPainted();
          return;
        }

        setMapIsRepainting(false);
        setMapLoading(false);
        setMapError('The map did not finish drawing. Refresh this page or tap Fit to route.');
      }, 8000);
    }

    function containerHasSize() {
      const rect = mapContainerRef.current?.getBoundingClientRect?.();
      return Boolean(rect && rect.width > 40 && rect.height > 40);
    }

    function stabilizeMap(google, map) {
      if (!active || !google?.maps || !map) {
        return;
      }

      clearPendingStabilizeTimer();

      window.requestAnimationFrame(() => {
        if (!active || !mapInstanceRef.current) {
          return;
        }

        google.maps.event.trigger(map, 'resize');

        mapStabilizeTimerRef.current = window.setTimeout(() => {
          if (!active || !mapInstanceRef.current) {
            return;
          }

          google.maps.event.trigger(map, 'resize');

          if (orderedStops.length) {
            fitRoute();
          } else {
            map.setCenter({ lat: 33.1217, lng: -117.0815 });
            map.setZoom(11);
          }

          setMapReady(true);
          startTileWatchdog(google, map);
        }, 180);
      });
    }

    async function initMap() {
      if (!mapContainerRef.current) {
        return;
      }

      if (!containerHasSize()) {
        window.setTimeout(initMap, 100);
        return;
      }

      try {
        setMapLoading(true);
        const { Map } = await loadGoogleMaps();
        const google = window.google;

        if (!active || !mapContainerRef.current || !Map || !google?.maps) {
          return;
        }

        setMapError('');
        setMapIsRepainting(false);

        const shouldCreateFreshMap =
          !mapInstanceRef.current ||
          (typeof mapInstanceRef.current.getDiv === 'function' && mapInstanceRef.current.getDiv() !== mapContainerRef.current);

        if (shouldCreateFreshMap) {
          resetMapInstance();
          mapInstanceRef.current = new Map(mapContainerRef.current, {
            center: { lat: 33.1217, lng: -117.0815 },
            zoom: 11,
            mapTypeId: mapType,
            mapTypeControl: false,
            streetViewControl: true,
            fullscreenControl: true,
            zoomControl: true
          });
          infoWindowRef.current = new google.maps.InfoWindow({
            disableAutoPan: true,
            maxWidth: 460,
            pixelOffset: new google.maps.Size(0, -8)
          });
        } else {
          if (mapTilesLoadedRef.current) {
            setMapTilesPainted(true);
            setMapLoading(false);
          }
        }

        const map = mapInstanceRef.current;

        // Some browsers deliver Google Maps lifecycle events inconsistently
        // when the canvas is mounted inside a resizable route panel. Listen for
        // both signals and also verify that Google painted a real surface.
        stabilizeMap(google, map);
        google.maps.event.addListenerOnce(map, 'idle', () => {
          stabilizeMap(google, map);

          window.setTimeout(() => {
            if (mapHasPaintedSurface()) {
              markMapPainted();
            }
          }, 240);
        });
        google.maps.event.addListenerOnce(map, 'tilesloaded', markMapPainted);

        if (mapContainerRef.current && 'ResizeObserver' in window) {
          resizeObserverRef.current?.disconnect();
          resizeObserverRef.current = new ResizeObserver(() => {
            if (!mapInstanceRef.current || !window.google?.maps) {
              return;
            }

            stabilizeMap(window.google, mapInstanceRef.current);
          });
          resizeObserverRef.current.observe(mapContainerRef.current);
        }
      } catch (error) {
        console.error('RoutePage Google Maps load failed:', error);
        if (active) {
          setMapReady(false);
          setMapLoading(false);
          setMapTilesPainted(false);
          setMapError(getGoogleMapsErrorMessage(error));
        }
      }
    }

    initMap();

    return () => {
      active = false;
      clearPendingStabilizeTimer();
      clearTileWatchdog();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [fitRoute, mapRefreshNonce, mapType, orderedStops.length, resetMapInstance]);

  useEffect(() => {
    const google = window.google;
    const map = mapInstanceRef.current;

    if (!google?.maps || !map) {
      return;
    }

    map.setMapTypeId(mapType);
    window.requestAnimationFrame(() => {
      google.maps.event.trigger(map, 'resize');
    });
  }, [mapType]);

  useEffect(() => {
    if (routeDetailQuery.isLoading) {
      return;
    }

    if ((route?.total_stops || 0) > 0 && allStops.length === 0) {
      setMapError('This route record exists, but its stops did not finish importing. Re-upload the manifest for this route.');
      return;
    }

    if (allStops.length > 0 && mappableStops.length === 0) {
      const attempted = Number(coordinateRecovery?.attempted || 0);
      const recovered = Number(coordinateRecovery?.recovered || 0);

      if (attempted > 0 && recovered === 0) {
        setMapError('This route loaded without coordinates, so the map cannot render those stops yet.');
        return;
      }
    }

    if (
      mapError === 'This route loaded without coordinates, so the map cannot render those stops yet.' ||
      mapError === 'This route record exists, but its stops did not finish importing. Re-upload the manifest for this route.'
    ) {
      setMapError('');
    }
  }, [
    allStops.length,
    coordinateRecovery?.attempted,
    coordinateRecovery?.recovered,
    mapError,
    mappableStops.length,
    route?.total_stops,
    routeDetailQuery.isLoading
  ]);

  useEffect(() => {
    const google = window.google;
    const map = mapInstanceRef.current;
    const infoWindow = infoWindowRef.current;

    if (!google?.maps || !map || !mapReady) {
      return;
    }

    clearMapArtifacts();

    orderedStops.forEach((stop) => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: Number(stop.lat), lng: Number(stop.lng) },
        title: getStopMarkerLabel(stop),
        icon: createStopMarkerSVG(stop, stop.id === selectedStopId),
        zIndex: getMarkerZIndex(stop, stop.id === selectedStopId)
      });

      marker.addListener('click', () => {
        selectedStopIdRef.current = stop.id;
        setSelectedStopId(stop.id);
        setShowStopDrawer(true);
        openStopInfoWindow(stop, marker);
      });

      marker.addListener('mouseover', () => {
        marker.setIcon(createStopMarkerSVG(stop, true));
        marker.setZIndex(getMarkerZIndex(stop, true));
      });

      marker.addListener('mouseout', () => {
        if (selectedStopIdRef.current !== stop.id) {
          marker.setIcon(createStopMarkerSVG(stop, false));
          marker.setZIndex(getMarkerZIndex(stop, false));
        }
      });

      stopMarkersRef.current.set(stop.id, marker);
    });

    if (orderedStops.length > 1) {
      routePolylineRef.current = new google.maps.Polyline({
        map,
        path: orderedStops.map((stop) => ({ lat: Number(stop.lat), lng: Number(stop.lng) })),
        strokeColor: '#4285F4',
        strokeOpacity: 1,
        strokeWeight: 3,
        zIndex: 2
      });
    }

    if (routeBounds) {
      territoryFillRef.current = new google.maps.Rectangle({
        map,
        bounds: routeBounds,
        strokeOpacity: 0,
        strokeWeight: 0,
        fillColor: '#4CAF50',
        fillOpacity: 0.04
      });

      territoryBorderRef.current = new google.maps.Polyline({
        map,
        path: [
          { lat: routeBounds.north, lng: routeBounds.west },
          { lat: routeBounds.north, lng: routeBounds.east },
          { lat: routeBounds.south, lng: routeBounds.east },
          { lat: routeBounds.south, lng: routeBounds.west },
          { lat: routeBounds.north, lng: routeBounds.west }
        ],
        strokeOpacity: 0,
        strokeWeight: 1.5,
        icons: [
          {
            icon: {
              path: 'M 0,-1 0,1',
              strokeColor: '#333333',
              strokeOpacity: 0.6,
              strokeWeight: 1.5,
              scale: 4
            },
            offset: '0',
            repeat: '12px'
          }
        ],
        zIndex: 1
      });
    }

    if (
      livePosition?.lat != null &&
      livePosition?.lng != null &&
      routeCentroid &&
      getDistanceMiles(
        { lat: Number(livePosition.lat), lng: Number(livePosition.lng) },
        routeCentroid
      ) <= 50
    ) {
      const marker = new google.maps.Marker({
        map,
        position: { lat: Number(livePosition.lat), lng: Number(livePosition.lng) },
        title: routeDriverName,
        icon: createDriverPositionMarker(routeDriverName, route?.status),
        zIndex: 30
      });

      marker.addListener('click', () => {
        infoWindow.setContent(buildDriverInfoWindow({ route, routeDriverName, nextStop, pendingTimeCommitCount }));
        infoWindow.open({ anchor: marker, map });
      });

      driverMarkerRef.current = marker;
    }

    if (orderedStops.length) {
      fitRoute();
    }
  }, [
    mapReady,
    orderedStops,
    routeBounds,
    routeCentroid,
    livePosition?.lat,
    livePosition?.lng,
    routeDriverName,
    route?.status,
    nextStop,
    clearMapArtifacts,
    openStopInfoWindow,
    pendingTimeCommitCount,
    fitRoute,
    route,
    selectedStopId
  ]);

  useEffect(() => {
    const google = window.google;
    const map = mapInstanceRef.current;

    if (!google?.maps || !map || !selectedStopId) {
      return;
    }

    stopMarkersRef.current.forEach((marker, stopId) => {
      const stop = orderedStops.find((item) => item.id === stopId);
      if (!stop) {
        return;
      }

      marker.setIcon(createStopMarkerSVG(stop, stopId === selectedStopId));
      marker.setZIndex(getMarkerZIndex(stop, stopId === selectedStopId));
    });

    const selectedMarker = stopMarkersRef.current.get(selectedStopId);
    const selectedStop = orderedStops.find((stop) => stop.id === selectedStopId);

    if (selectedMarker && selectedStop) {
      openStopInfoWindow(selectedStop, selectedMarker);
    }
  }, [openStopInfoWindow, orderedStops, selectedStopId]);

  function handleRouteChange(nextRouteId) {
    if (!nextRouteId) {
      return;
    }
    navigate(`/routes/${nextRouteId}?date=${date}`);
  }

  function handleDateChange(nextDate) {
    setDate(nextDate);
    setSearchParams({ date: nextDate });
    setSelectedStopId(null);
  }

  function handleStopClick(stop) {
    setSelectedStopId(stop.id);
    setShowExceptions(false);
    centerOnStop(stop);
  }

  function openNoteEditor(stop = selectedStop || nextStop || null) {
    if (!stop) {
      setActionError('Select a stop first, then add or edit the address note.');
      return;
    }

    setNoteEditorStopId(stop.id);
    setNoteDraft(stop.notes || '');
    setActionError('');
  }

  function closeNoteEditor() {
    setNoteEditorStopId(null);
    setNoteDraft('');
  }

  function openPropertyEditor(stop = selectedStop || nextStop || null) {
    if (!stop) {
      setActionError('Select a stop first, then edit building intel.');
      return;
    }

    const propertyIntel = stop.property_intel || {};

    setPropertyEditorStopId(stop.id);
    setPropertyDraft({
      property_type: propertyIntel.location_type || '',
      building: propertyIntel.building || '',
      access_note: propertyIntel.access_note || propertyIntel.entry_note || '',
      parking_note: propertyIntel.parking_note || '',
      warning_flags: warningFlagsToDraft(propertyIntel.warning_flags)
    });
    setActionError('');
  }

  function closePropertyEditor() {
    setPropertyEditorStopId(null);
    setPropertyDraft({
      property_type: '',
      building: '',
      access_note: '',
      parking_note: '',
      warning_flags: ''
    });
  }

  function centerOnStop(stop) {
    const map = mapInstanceRef.current;
    const marker = stopMarkersRef.current.get(stop.id);

    if (!map || !marker) {
      return;
    }

    setSelectedStopId(stop.id);
    map.panTo(marker.getPosition());
  }

  function centerOnRoadFlag(flag) {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }

    const startLat = Number(flag.lat_start);
    const startLng = Number(flag.lng_start);
    const endLat = Number(flag.lat_end);
    const endLng = Number(flag.lng_end);
    const lat = Number.isFinite(startLat) && Number.isFinite(endLat) ? (startLat + endLat) / 2 : startLat;
    const lng = Number.isFinite(startLng) && Number.isFinite(endLng) ? (startLng + endLng) / 2 : startLng;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    setShowExceptions(false);
    map.panTo({ lat, lng });
    map.setZoom(Math.max(map.getZoom() || 14, 15));
  }

  async function handleSaveAddressNote() {
    if (!noteEditorStop) {
      return;
    }

    setIsSavingNote(true);
    setActionError('');

    try {
      await api.patch(`/manager/routes/stops/${noteEditorStop.id}/note`, {
        note_text: noteDraft
      });
      await queryClient.invalidateQueries({ queryKey: ['route-page-detail', id, date] });
      await queryClient.invalidateQueries({ queryKey: ['manager-routes', date] });
      setActionMessage(`Saved note for stop ${noteEditorStop.sequence_order}. Future deliveries will reuse it.`);
      closeNoteEditor();
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to save the address note.');
    } finally {
      setIsSavingNote(false);
    }
  }

  async function handleSavePropertyIntel() {
    if (!propertyEditorStop) {
      return;
    }

    setIsSavingPropertyIntel(true);
    setActionError('');

    try {
      await api.patch(`/manager/routes/stops/${propertyEditorStop.id}/property-intel`, {
        property_type: propertyDraft.property_type || null,
        building: propertyDraft.building || null,
        access_note: propertyDraft.access_note || null,
        parking_note: propertyDraft.parking_note || null,
        warning_flags: propertyDraft.warning_flags
          .split(',')
          .map((flag) => flag.trim().toLowerCase())
          .filter(Boolean)
      });
      await queryClient.invalidateQueries({ queryKey: ['route-page-detail', id, date] });
      setActionMessage(`Saved building intel for ST#${propertyEditorStop.sequence_order}.`);
      closePropertyEditor();
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to save building intel.');
    } finally {
      setIsSavingPropertyIntel(false);
    }
  }

  if (routesQuery.isLoading || routeDetailQuery.isLoading) {
    return (
      <section className="page-section route-page-shell">
        <div className="card">Loading route detail...</div>
      </section>
    );
  }

  if (routesQuery.isError || routeDetailQuery.isError) {
    return (
      <section className="page-section route-page-shell">
        <div className="card">
          {routeDetailQuery.error?.response?.data?.error ||
            routesQuery.error?.response?.data?.error ||
            'Route detail failed to load.'}
        </div>
      </section>
    );
  }

  if (!route) {
    return (
      <section className="page-section route-page-shell">
        <div className="card">Route not found for this date.</div>
      </section>
    );
  }

  return (
    <section className="page-section route-page-shell">
      <header className={`route-page-header ${isHeaderCollapsed ? 'collapsed' : ''}`}>
        <div className="route-page-titlebar">
          <div className="route-page-title-block">
            <div className="route-page-company-line">BRIDGE TRANSPORTATION INC — READYROUTE</div>
            <h1>{`Route ${route.work_area_name} (${route.total_stops}) — ${routeDriverName}`}</h1>
          </div>

          <div className="route-page-titlebar-actions">
            <div className="route-page-brand-mark" aria-label="ReadyRoute">
              <span className="route-page-brand-ready">ready</span>
              <span className="route-page-brand-route">Route</span>
            </div>
          </div>
        </div>

        <div className="route-page-status-strip" style={{ backgroundColor: routeStatusMeta.color }}>
          <span>{routeStatusMeta.label}</span>
        </div>

        <div className="route-page-header-controls">
          <button
            className="route-page-collapse-toggle"
            onClick={() => setIsHeaderCollapsed((value) => !value)}
            type="button"
          >
            <span className="route-page-collapse-icon" aria-hidden="true">{isHeaderCollapsed ? '▾' : '▴'}</span>
            <span>{isHeaderCollapsed ? 'Expand Route Header' : 'Collapse Route Header'}</span>
          </button>
        </div>

        {isHeaderCollapsed ? (
          <div className="route-page-collapsed-summary">
            <span><strong>Date:</strong> {getFriendlyDate(date)}</span>
            <span><strong>Stops:</strong> {route.total_stops}</span>
            <span><strong>Driver:</strong> {routeDriverName}</span>
            <button className="route-toolbar-button route-toolbar-secondary" type="button" onClick={() => setShowStopDrawer(true)}>
              <span className="route-toolbar-icon" aria-hidden="true">≣</span>
              View Stops
            </button>
          </div>
        ) : (
          <>
            <div className="route-page-toolbar-row">
              <div className="route-page-toolbar route-page-toolbar-left-group">
                <label className="route-page-field">
                  <span>Route</span>
                  <select className="text-field route-toolbar-input" value={route.id} onChange={(event) => handleRouteChange(event.target.value)}>
                    {routeOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.work_area_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="route-page-field">
                  <span>Date</span>
                  <input
                    className="date-field route-toolbar-input"
                    type="date"
                    value={date}
                    onChange={(event) => handleDateChange(event.target.value)}
                  />
                </label>
              </div>

              <div className="route-page-toolbar route-page-toolbar-right-group">
                <button className="route-toolbar-button route-toolbar-secondary" type="button" onClick={() => setShowStopDrawer(true)}>
                  <span className="route-toolbar-icon" aria-hidden="true">≣</span>
                  View Stops
                </button>

                <button
                  className="route-toolbar-button route-toolbar-secondary"
                  type="button"
                  onClick={() => openNoteEditor()}
                >
                  <span className="route-toolbar-icon" aria-hidden="true">✎</span>
                  Edit Address Note
                </button>

                <button
                  className="route-toolbar-button route-toolbar-secondary"
                  type="button"
                  onClick={() => openPropertyEditor()}
                >
                  <span className="route-toolbar-icon" aria-hidden="true">⌂</span>
                  Edit Building Intel
                </button>

              </div>
            </div>

            {actionMessage ? <div className="route-page-feedback success">{actionMessage}</div> : null}
            {actionError ? <div className="route-page-feedback error">{actionError}</div> : null}
            {routeDispatchWarnings.length ? (
              <div className="route-dispatch-alert">
                <div className="route-dispatch-alert-copy">
                  <strong>Dispatch review</strong>
                  <span>This route still has items worth checking before a driver heads out.</span>
                </div>
                <div className="route-dispatch-alert-chips">
                  {routeDispatchWarnings.map((warning) => (
                    <span className={`route-dispatch-chip ${warning.tone}`} key={warning.key}>
                      {warning.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="route-dispatch-alert ready">
                <div className="route-dispatch-alert-copy">
                  <strong>Dispatch review</strong>
                  <span>This route has the basic driver, vehicle, and map coverage checks in place.</span>
                </div>
              </div>
            )}
          </>
        )}
      </header>

      <div className="route-map-stage">
        <div key={`route-map-${mapRefreshNonce}`} ref={mapContainerRef} className="route-map-fullscreen" />
        {!mapError && (!mapReady || (mapLoading && !mapTilesPainted)) ? (
          <div className="route-map-loading">{mapReady ? 'Loading map tiles...' : 'Loading map...'}</div>
        ) : null}
        {mapIsRepainting && !mapError ? (
          <div className="route-map-repaint-notice">Map is repainting...</div>
        ) : null}
        {mapError ? <div className="route-map-error">{mapError}</div> : null}

        {!showStopDrawer ? (
          <button type="button" className="route-map-stop-list-handle" onClick={() => setShowStopDrawer(true)}>
            <span className="route-map-stop-list-icon" aria-hidden="true">⌖</span>
            <span>Stop List</span>
            <span className="route-map-stop-list-chevron" aria-hidden="true">›</span>
          </button>
        ) : null}

        <div className={`route-map-toolbar-left ${!showStopDrawer ? 'with-stop-handle' : ''}`}>
          <button type="button" className="route-map-tool" onClick={fitRoute} title="Recenter map">
            ⌖
          </button>
          <button type="button" className="route-map-tool" onClick={() => setShowLegend((value) => !value)} title="Toggle legend">
            ⓘ
          </button>
        </div>

        <div className="route-map-toolbar-right">
          <button
            type="button"
            className="route-map-warning-button"
            onClick={() => setShowExceptions((value) => !value)}
            title="Route exceptions"
          >
            <span className="route-map-warning-icon">⚠</span>
            <span className="route-map-warning-badge">{routeExceptionCount}</span>
          </button>

          <button
            type="button"
            className="route-map-toggle-button"
            onClick={() => setMapType((value) => (value === 'roadmap' ? 'satellite' : 'roadmap'))}
          >
            {mapType === 'roadmap' ? 'Satellite' : 'Map'}
          </button>
        </div>

        <button type="button" className="route-map-fit-button" onClick={fitRoute}>
          Fit to route
        </button>

        <MapLegend hidden={!showLegend} />

        {showExceptions ? (
          <aside ref={exceptionsPanelRef} className="route-map-exceptions-panel">
            <div className="route-map-panel-header">
              <h2>Route Exceptions</h2>
              <button type="button" className="route-map-panel-close" onClick={() => setShowExceptions(false)}>
                ×
              </button>
            </div>
            <div className="route-exceptions-tabs">
              <button
                type="button"
                className={`route-exceptions-tab ${activeExceptionsTab === 'exceptions' ? 'active' : ''}`}
                onClick={() => setActiveExceptionsTab('exceptions')}
              >
                Exceptions
                <span className="route-exceptions-tab-badge">{exceptionStops.length}</span>
              </button>
              <button
                type="button"
                className={`route-exceptions-tab ${activeExceptionsTab === 'flagged-roads' ? 'active' : ''}`}
                onClick={() => setActiveExceptionsTab('flagged-roads')}
              >
                Flagged Roads
                <span className="route-exceptions-tab-badge">{roadFlags.length}</span>
              </button>
              <button
                type="button"
                className={`route-exceptions-tab ${activeExceptionsTab === 'incomplete' ? 'active' : ''}`}
                onClick={() => setActiveExceptionsTab('incomplete')}
              >
                Incomplete
                <span className="route-exceptions-tab-badge">{incompleteStops.length}</span>
              </button>
            </div>
            <div className="route-map-panel-body route-exceptions-body">
              {activeExceptionsTab === 'exceptions' ? (
                exceptionStops.length ? (
                  exceptionStops.map((stop) => {
                    const badge = getExceptionBadgeMeta(stop.exception_code, false);
                    return (
                      <button
                        key={stop.id}
                        type="button"
                        className="route-exception-row"
                        onClick={() => {
                          setShowExceptions(false);
                          centerOnStop(stop);
                        }}
                      >
                        <div className="route-exception-time">{formatTimestamp(stop.completed_at)}</div>
                        <div className="route-exception-stop-badge">{stop.sequence_order}</div>
                        <div className="route-exception-address">
                          <strong>{stop.contact_name || `Stop ${stop.sequence_order}`}</strong>
                          <span>{stop.address}</span>
                        </div>
                        <div className={`route-exception-code-badge ${badge.className}`}>{badge.label}</div>
                      </button>
                    );
                  })
                ) : (
                  <div className="route-map-panel-empty route-panel-empty-success">No exceptions on this route today ✓</div>
                )
              ) : null}

              {activeExceptionsTab === 'flagged-roads' ? (
                roadFlags.length ? (
                  roadFlags.map((flag) => {
                    const flagMeta = getFlagTypeMeta(flag.flag_type);
                    return (
                      <button
                        key={flag.id}
                        type="button"
                        className="route-flag-row"
                        onClick={() => centerOnRoadFlag(flag)}
                      >
                        <div className={`route-flag-type-badge ${flagMeta.className}`}>{flagMeta.label}</div>
                        <div className="route-flag-main">
                          <strong>{flag.notes || 'Flagged road segment'}</strong>
                          <span>{flag.driver_name || 'Unknown driver'}</span>
                          <small>{formatDateShort(flag.created_at)}</small>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="route-map-panel-empty">No roads flagged on this route</div>
                )
              ) : null}

              {activeExceptionsTab === 'incomplete' ? (
                incompleteStops.length ? (
                  incompleteStops.map((stop) => (
                    <button
                      key={stop.id}
                      type="button"
                      className="route-incomplete-row"
                      onClick={() => {
                        setShowExceptions(false);
                        centerOnStop(stop);
                      }}
                    >
                      <div className="route-exception-stop-badge">{stop.sequence_order}</div>
                      <div className="route-exception-address">
                        <strong>{stop.contact_name || `Stop ${stop.sequence_order}`}</strong>
                        <span>{stop.address}</span>
                      </div>
                      <div className="route-exception-code-badge incomplete-only">Incomplete</div>
                    </button>
                  ))
                ) : (
                  <div className="route-map-panel-empty route-panel-empty-success">No incomplete stops on this route ✓</div>
                )
              ) : null}
            </div>
          </aside>
        ) : null}

        <StopListDrawer
          open={showStopDrawer}
          route={route}
          routeDriverName={routeDriverName}
          stops={allStops}
          selectedStopId={selectedStopId}
          onClose={() => setShowStopDrawer(false)}
          onSelectStop={handleStopClick}
        />

        {noteEditorStop ? (
          <div className="route-note-modal-backdrop" onClick={closeNoteEditor}>
            <div className="route-note-modal" onClick={(event) => event.stopPropagation()}>
              <div className="route-note-modal-header">
                <div>
                  <h2>Edit Address Note</h2>
                  <p>{`Stop ${noteEditorStop.sequence_order} · ${noteEditorStop.address}`}</p>
                </div>
                <button type="button" className="route-note-modal-close" onClick={closeNoteEditor}>×</button>
              </div>
              <textarea
                className="route-note-modal-input"
                placeholder="Add delivery access info, gate codes, apartment guidance, or other future-use details..."
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
              />
              <div className="route-note-modal-help">
                {noteEditorStop.is_apartment_unit ? 'This note will be reused for this apartment/unit when possible.' : 'This note will be reused for future deliveries to this address.'}
              </div>
              <div className="route-note-modal-actions">
                <button type="button" className="route-toolbar-button route-toolbar-secondary" onClick={closeNoteEditor}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="route-toolbar-button route-toolbar-push"
                  onClick={handleSaveAddressNote}
                  disabled={isSavingNote}
                >
                  {isSavingNote ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {propertyEditorStop ? (
          <div className="route-note-modal-backdrop" onClick={closePropertyEditor}>
            <div className="route-note-modal" onClick={(event) => event.stopPropagation()}>
              {(() => {
                const workflowHint = getPropertyWorkflowHint(propertyEditorStop);

                return (
                  <>
              <div className="route-note-modal-header">
                <div>
                  <h2>Edit Building Intel</h2>
                  <p>{`ST#${propertyEditorStop.sequence_order} · ${propertyEditorStop.address}`}</p>
                </div>
                <button type="button" className="route-note-modal-close" onClick={closePropertyEditor}>×</button>
              </div>

              <div className="route-note-modal-help">
                {workflowHint.profile.length ? workflowHint.profile.join(' · ') : 'No parsed profile hints on this stop yet.'}
              </div>

              <div className="route-pin-workflow-panel">
                <div className="route-pin-workflow-header">
                  <span className={`route-pin-workflow-badge ${workflowHint.pinMeta.badgeClassName}`}>{workflowHint.pinMeta.shortLabel}</span>
                  <strong>{workflowHint.pinMeta.title}</strong>
                </div>
                <div className="route-pin-workflow-copy">{workflowHint.pinMeta.detail}</div>
                <div className="route-pin-workflow-recommendation">{workflowHint.pinMeta.recommendation}</div>
              </div>

              <div className="route-property-grid">
                <label className="route-property-field">
                  <span>Location Type</span>
                  <input
                    className="route-property-input"
                    type="text"
                    placeholder="apartment, office, business..."
                    value={propertyDraft.property_type}
                    onChange={(event) => setPropertyDraft((current) => ({ ...current, property_type: event.target.value }))}
                  />
                </label>

                <label className="route-property-field">
                  <span>Building</span>
                  <input
                    className="route-property-input"
                    type="text"
                    placeholder="Building A, Tower 2, Dock 4..."
                    value={propertyDraft.building}
                    onChange={(event) => setPropertyDraft((current) => ({ ...current, building: event.target.value }))}
                  />
                </label>
              </div>

              <label className="route-property-field">
                <span>Access Note</span>
                <textarea
                  className="route-note-modal-input route-note-modal-input-compact"
                  placeholder="Gate code, callbox, lobby, front desk, dock instructions..."
                  value={propertyDraft.access_note}
                  onChange={(event) => setPropertyDraft((current) => ({ ...current, access_note: event.target.value }))}
                />
              </label>

              <label className="route-property-field">
                <span>Parking Note</span>
                <textarea
                  className="route-note-modal-input route-note-modal-input-compact"
                  placeholder="Visitor lot, curbside, loading zone, best entrance..."
                  value={propertyDraft.parking_note}
                  onChange={(event) => setPropertyDraft((current) => ({ ...current, parking_note: event.target.value }))}
                />
              </label>

              <label className="route-property-field">
                <span>Warning Flags</span>
                <input
                  className="route-property-input"
                  type="text"
                  placeholder="dog, gate, stairs, lobby, loading_dock"
                  value={propertyDraft.warning_flags}
                  onChange={(event) => setPropertyDraft((current) => ({ ...current, warning_flags: event.target.value }))}
                />
              </label>

              <div className="route-note-modal-help">
                This intel is saved at the building/address level and will be merged into future stops automatically.
              </div>
              <div className="route-note-modal-actions">
                <button type="button" className="route-toolbar-button route-toolbar-secondary" onClick={closePropertyEditor}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="route-toolbar-button route-toolbar-push"
                  onClick={handleSavePropertyIntel}
                  disabled={isSavingPropertyIntel}
                >
                  {isSavingPropertyIntel ? 'Saving...' : 'Save Building Intel'}
                </button>
              </div>
                  </>
                );
              })()}
            </div>
          </div>
        ) : null}
      </div>

      <div className="route-page-footer-meta">
        <span>{`Showing ${allStops.length} stops for ${getFriendlyDate(date)}`}</span>
        <span>{`Contractor: ${route.contractor_name || '—'}`}</span>
        <span>{`SA#: ${route.sa_number || '—'}`}</span>
      </div>
    </section>
  );
}
