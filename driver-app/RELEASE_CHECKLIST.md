# ReadyRoute Driver App Release Checklist

## Config
- `npm run check`
- `npm run check:release`
- Confirm `EXPO_PUBLIC_API_URL` points to production, not localhost
- Confirm `EXPO_PUBLIC_USE_LOCAL_API=false` unless you intentionally want the simulator/dev app hitting your local backend
- Confirm `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is present and active
- Confirm `eas.json` production profile is current

## QA
- `npm run test`
- `npm run build:native`
- Log in on a real device or simulator using a real driver account
- Confirm `Home`, `My Drive`, `Manifest`, and `Stop Detail` open cleanly
- Confirm `Nav` opens Google Maps correctly
- Confirm clock in / break / clock out still persist to the backend

## Route Execution
- Load a live route with at least one timed stop
- Confirm stop tap preserves zoom
- Confirm selected stop recenters correctly
- Confirm complete stop works for both delivery and pickup
- Confirm note save and corrected pin save still work

## Manager / Driver Cross-Checks
- Confirm route appears in manager portal with correct driver and pins
- Confirm driver stop intel matches manager portal property intel
- Confirm timecard activity appears in manager portal labor views

## Publish
- Run `npm run release:prep`
- Build with EAS production profile
- Verify app icon, splash, and app name in the generated binary
- Record release date, build number, and API target used for the release
