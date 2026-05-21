import { useCallback, useEffect, useRef, useState } from 'react';

import { loadGoogleMaps } from '../lib/googleMapsLoader';

export default function MapView({ center, markers = [] }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerInstancesRef = useRef([]);
  const infoWindowRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [mapMountNonce, setMapMountNonce] = useState(0);

  const handleMapRef = useCallback((node) => {
    mapRef.current = node;

    if (node) {
      setMapMountNonce((value) => value + 1);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapRef.current) {
        return;
      }

      try {
        const { Map } = await loadGoogleMaps();
        const google = window.google;

        if (!isMounted || !mapRef.current || !Map || !google?.maps) {
          return;
        }

        setErrorMessage('');

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new Map(mapRef.current, {
            center: center || { lat: 39.5, lng: -98.35 },
            zoom: center ? 11 : 4
          });
          infoWindowRef.current = new google.maps.InfoWindow();
        }

        const map = mapInstanceRef.current;
        const infoWindow = infoWindowRef.current;

        markerInstancesRef.current.forEach((marker) => marker.setMap(null));
        markerInstancesRef.current = [];

        if (markers.length > 0) {
          const bounds = new google.maps.LatLngBounds();

          markers.forEach((markerData) => {
            const marker = new google.maps.Marker({
              map,
              position: { lat: Number(markerData.lat), lng: Number(markerData.lng) },
              label: markerData.shortLabel || undefined,
              title: markerData.label || markerData.address || 'Stop',
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: markerData.scale || 8,
                fillColor: markerData.color || '#6b7280',
                fillOpacity: markerData.fillOpacity ?? 1,
                strokeColor: '#ffffff',
                strokeWeight: markerData.strokeWeight ?? 2
              }
            });

            marker.addListener('click', () => {
              infoWindow.setContent(`
                <div style="min-width: 180px; padding: 4px 2px;">
                  <div style="font-weight: 800; color: #173042;">${markerData.label || 'Driver'}</div>
                  ${markerData.secondaryLine ? `<div style="color: #66737c; margin-top: 3px;">${markerData.secondaryLine}</div>` : ''}
                  <div style="color: #66737c; margin-top: 4px;">${markerData.subtitle || ''}</div>
                  <div style="color: #ff6200; font-weight: 700; margin-top: 6px;">${markerData.metric || ''}</div>
                </div>
              `);
              infoWindow.open({ anchor: marker, map });
            });

            markerInstancesRef.current.push(marker);
            bounds.extend({ lat: Number(markerData.lat), lng: Number(markerData.lng) });
          });

          map.fitBounds(bounds, 64);
        } else if (center) {
          map.setCenter(center);
          map.setZoom(11);
        } else {
          map.setCenter({ lat: 39.5, lng: -98.35 });
          map.setZoom(4);
        }
      } catch (error) {
        console.error('Manager portal Google Maps load failed:', error);

        if (!isMounted) {
          return;
        }

        if (error.message === 'missing_google_maps_key') {
          setErrorMessage('Add VITE_GOOGLE_MAPS_KEY to load the fleet map.');
        } else if (error.message === 'google_maps_auth_failed') {
          setErrorMessage('Google Maps rejected this browser key. Check the Maps JavaScript API and your localhost referrer restrictions, then restart the portal.');
        } else {
          setErrorMessage('Google Maps could not load in this browser session. Restart the portal and verify the browser API key settings.');
        }
      }
    }

    initMap();

    return () => {
      isMounted = false;
    };
  }, [center, markers, mapMountNonce]);

  return (
    <div className="map-panel">
      {errorMessage ? <div className="map-fallback">{errorMessage}</div> : <div className="map-canvas" ref={handleMapRef} />}
    </div>
  );
}
