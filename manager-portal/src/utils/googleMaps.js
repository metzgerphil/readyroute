const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;
const GOOGLE_MAPS_SRC = GOOGLE_MAPS_KEY
  ? `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&v=weekly`
  : null;
const GOOGLE_MAPS_PLACEHOLDER_KEYS = new Set(['your_key_here', 'your_production_key']);

let googleMapsScriptPromise = null;
let googleMapsScriptFailed = false;

export function loadGoogleMapsScript() {
  if (!GOOGLE_MAPS_KEY || GOOGLE_MAPS_PLACEHOLDER_KEYS.has(GOOGLE_MAPS_KEY)) {
    return Promise.reject(new Error('missing_google_maps_key'));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google);
  }

  if (googleMapsScriptFailed) {
    googleMapsScriptPromise = null;
    googleMapsScriptFailed = false;
  }

  if (!googleMapsScriptPromise) {
    googleMapsScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-readyroute-google-maps="true"]');
      let timeoutId = null;

      function clearTimeoutIfNeeded() {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
      }

      function fail(error) {
        clearTimeoutIfNeeded();
        googleMapsScriptFailed = true;
        googleMapsScriptPromise = null;
        reject(error);
      }

      function succeed() {
        clearTimeoutIfNeeded();
        resolve(window.google);
      }

      if (existingScript) {
        timeoutId = window.setTimeout(() => {
          fail(new Error('google_maps_script_timeout'));
        }, 12000);

        existingScript.addEventListener(
          'load',
          () => {
            if (window.google?.maps?.Map) {
              succeed();
            } else {
              fail(new Error('google_maps_auth_failed'));
            }
          },
          { once: true }
        );
        existingScript.addEventListener('error', () => fail(new Error('google_maps_script_failed')), { once: true });
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
          fail(new Error('google_maps_auth_failed'));
          return;
        }

        succeed();
      };
      script.onerror = () => fail(new Error('google_maps_script_failed'));

      timeoutId = window.setTimeout(() => {
        fail(new Error('google_maps_script_timeout'));
      }, 12000);

      document.head.appendChild(script);
    });
  }

  return googleMapsScriptPromise;
}
