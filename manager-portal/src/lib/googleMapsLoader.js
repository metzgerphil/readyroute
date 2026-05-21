import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

const GOOGLE_MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY || '').trim();
const GOOGLE_MAPS_PLACEHOLDER_KEYS = new Set(['your_key_here', 'your_production_key']);

let optionsConfigured = false;
let mapsLibraryPromise = null;

function getLoaderError(error) {
  if (error?.message === 'missing_google_maps_key') {
    return error;
  }

  const wrapped = new Error('google_maps_load_failed');
  wrapped.cause = error;
  return wrapped;
}

export function loadGoogleMaps() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser'));
  }

  if (!GOOGLE_MAPS_KEY || GOOGLE_MAPS_PLACEHOLDER_KEYS.has(GOOGLE_MAPS_KEY)) {
    return Promise.reject(new Error('missing_google_maps_key'));
  }

  if (!mapsLibraryPromise) {
    if (!optionsConfigured) {
      setOptions({
        key: GOOGLE_MAPS_KEY,
        v: 'weekly',
        libraries: ['maps'],
        authReferrerPolicy: 'origin'
      });
      optionsConfigured = true;
    }

    mapsLibraryPromise = importLibrary('maps')
      .catch((error) => {
        mapsLibraryPromise = null;
        throw getLoaderError(error);
      });
  }

  return mapsLibraryPromise;
}
