import { useEffect, useRef, useState } from 'react';

import { loadGoogleMaps } from '../lib/googleMapsLoader';

const ESCONDIDO_CENTER = { lat: 33.1192, lng: -117.0864 };

export default function DebugGoogleMapPage() {
  const mapContainerRef = useRef(null);
  const [status, setStatus] = useState('Loading Google Maps...');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let debugCircle = null;

    async function renderDebugMap() {
      try {
        if (!mapContainerRef.current) {
          setStatus('Waiting for map container...');
          return;
        }

        const rect = mapContainerRef.current.getBoundingClientRect();
        if (!rect.width || !rect.height) {
          setStatus('Map container has no size yet...');
          window.requestAnimationFrame(renderDebugMap);
          return;
        }

        const { Circle, Map } = await loadGoogleMaps();

        if (!active) {
          return;
        }

        const map = new Map(mapContainerRef.current, {
          center: ESCONDIDO_CENTER,
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true
        });

        debugCircle = new Circle({
          map,
          center: ESCONDIDO_CENTER,
          radius: 250,
          strokeColor: '#ff6200',
          strokeOpacity: 0.9,
          strokeWeight: 3,
          fillColor: '#ff6200',
          fillOpacity: 0.18
        });

        setStatus('Google Maps loaded successfully.');
        setError('');
      } catch (loadError) {
        console.error('Debug Google Map failed:', loadError);
        if (active) {
          setStatus('Google Maps failed to load.');
          setError(loadError?.message || 'Unknown Google Maps load error');
        }
      }
    }

    renderDebugMap();

    return () => {
      active = false;
      debugCircle?.setMap?.(null);
    };
  }, []);

  return (
    <section className="page-section">
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: '0 0 8px' }}>Google Maps Debug</h1>
        <p style={{ margin: 0 }}>{status}</p>
        {error ? <p style={{ color: '#b91c1c', margin: '8px 0 0' }}>{error}</p> : null}
      </div>
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: 'min(70vh, 640px)',
          minHeight: 420,
          border: '1px solid #e2e8f0',
          borderRadius: 24,
          overflow: 'hidden',
          background: '#e8f0f7'
        }}
      />
    </section>
  );
}
