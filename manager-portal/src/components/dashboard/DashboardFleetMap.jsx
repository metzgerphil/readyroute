import { useEffect, useRef, useState } from 'react';

import { loadGoogleMapsScript } from '../../utils/googleMaps';
import { createDriverPinSvg, getPrimaryBoundsPoints, getValidCoordinatePoints } from '../../utils/dashboardHelpers';

export default function DashboardFleetMap({ center, markers = [], boundsPoints = [] }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerInstancesRef = useRef([]);
  const infoWindowRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapRef.current) {
        return;
      }

      try {
        const google = await loadGoogleMapsScript();

        if (!isMounted || !mapRef.current || !google?.maps?.Map) {
          return;
        }

        setErrorMessage('');

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new google.maps.Map(mapRef.current, {
            center: center || { lat: 33.1217, lng: -117.0815 },
            zoom: center ? 11 : 10
          });
          infoWindowRef.current = new google.maps.InfoWindow();
        }

        const map = mapInstanceRef.current;
        const infoWindow = infoWindowRef.current;

        markerInstancesRef.current.forEach((marker) => marker.setMap(null));
        markerInstancesRef.current = [];

        const defaultCenter = center || { lat: 33.1217, lng: -117.0815 };
        const usableBoundsPoints = getPrimaryBoundsPoints(
          getValidCoordinatePoints((boundsPoints || []).map((point) => ({
            lat: Number(point?.lat),
            lng: Number(point?.lng)
          })))
        );

        if (markers.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          const markerPositions = [];

          markers.forEach((markerData) => {
            const lat = Number(markerData.lat);
            const lng = Number(markerData.lng);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              return;
            }

            const marker = new google.maps.Marker({
              map,
              position: { lat, lng },
              title: markerData.title,
              icon: {
                url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(createDriverPinSvg(markerData))}`,
                scaledSize: new google.maps.Size(48, 48),
                anchor: new google.maps.Point(24, 24)
              }
            });

            marker.addListener('click', () => {
              const tcLine = markerData.nextStopTimeCommit ? `<div style="margin-top:6px; color:#b45309; font-weight:800;">TC: ${markerData.nextStopTimeCommit}</div>` : '';
              infoWindow.setContent(`
                <div style="min-width:220px; padding:4px 2px;">
                  <div style="font-weight:900; color:#173042;">${markerData.driverName} — ${markerData.workAreaName}</div>
                  <div style="margin-top:4px; color:#4b5563;">${markerData.completedStops}/${markerData.totalStops} stops complete</div>
                  <div style="margin-top:4px; color:#4b5563;">${markerData.stopsPerHourLabel}</div>
                  <div style="margin-top:6px; color:#173042; font-weight:700;">Next stop</div>
                  <div style="margin-top:2px; color:#66737c;">${markerData.nextStopAddress || 'No pending stop'}</div>
                  ${tcLine}
                  <div style="margin-top:6px; color:#ff6200; font-weight:800;">${markerData.pendingTimeCommitCount} pending time commit${markerData.pendingTimeCommitCount === 1 ? '' : 's'}</div>
                </div>
              `);
              infoWindow.open({ anchor: marker, map });
            });

            markerInstancesRef.current.push(marker);
            markerPositions.push({ lat, lng });
            bounds.extend({ lat, lng });
          });

          const fitPoints = usableBoundsPoints.length ? usableBoundsPoints : markerPositions;

          if (fitPoints.length === 1) {
            map.setCenter(fitPoints[0]);
            map.setZoom(13);
          } else if (fitPoints.length > 1) {
            fitPoints.forEach((point) => bounds.extend(point));
            map.fitBounds(bounds, 64);

            google.maps.event.addListenerOnce(map, 'idle', () => {
              const currentZoom = Number(map.getZoom() || 0);

              if (currentZoom < 10) {
                map.setZoom(10);
              }
            });
          } else if (markerPositions.length === 1) {
            map.setCenter(markerPositions[0]);
            map.setZoom(13);
          } else {
            map.setCenter(defaultCenter);
            map.setZoom(center ? 11 : 10);
          }
        } else if (usableBoundsPoints.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          usableBoundsPoints.forEach((point) => bounds.extend(point));

          if (usableBoundsPoints.length === 1) {
            map.setCenter(usableBoundsPoints[0]);
            map.setZoom(13);
          } else {
            map.fitBounds(bounds, 64);

            google.maps.event.addListenerOnce(map, 'idle', () => {
              const currentZoom = Number(map.getZoom() || 0);

              if (currentZoom < 10) {
                map.setZoom(10);
              }
            });
          }
        } else {
          map.setCenter(defaultCenter);
          map.setZoom(center ? 11 : 10);
        }
      } catch (error) {
        console.error('Dashboard fleet map load failed:', error);

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
  }, [boundsPoints, center, markers]);

  return (
    <div className="map-panel">
      {errorMessage ? <div className="map-fallback">{errorMessage}</div> : <div className="map-canvas" ref={mapRef} />}
    </div>
  );
}
