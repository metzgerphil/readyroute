# Driver App QA Baseline

This file tracks the current automated verification loop for the ReadyRoute driver app.

## Commands

- `npm run check`
  - Validates Expo app config using the local Expo CLI.
- `npm run test`
  - Runs Jest smoke tests for driver app behavior.
- `npm run build:web`
  - Compatibility alias to the native compile guardrail.
- `npm run build:native`
  - Exports a native iOS bundle with Expo to confirm the app compiles.
- `npm run check:release`
  - Verifies release-critical env/config values before a production publish.

## Current Automated Coverage

### Navigation

- [src/navigation/AppNavigator.test.js](/Users/phillipmetzger/readyroute/driver-app/src/navigation/AppNavigator.test.js:1)
  - login flow when no token exists
  - authenticated stack when a token exists
  - bootstrap token lookup errors fail safe to login
  - unauthorized callback clears auth and returns to login

### Route List / Manifest

- [src/screens/ManifestScreen.test.js](/Users/phillipmetzger/readyroute/driver-app/src/screens/ManifestScreen.test.js:1)
  - stop status presentation helpers
  - priority stop detection
  - pickup stop detection
  - hazmat stop detection

### Home Screen

- [src/screens/HomeScreen.test.js](/Users/phillipmetzger/readyroute/driver-app/src/screens/HomeScreen.test.js:1)
  - greeting logic by time of day
  - break label formatting
  - route presentation for assigned vs unassigned routes
  - local storage date formatting
  - compact route summary formatting for the home card
- [src/screens/HomeScreen.interaction.test.js](/Users/phillipmetzger/readyroute/driver-app/src/screens/HomeScreen.interaction.test.js:1)
  - starts a pending route and enters `MyDrive`
  - clocks in and starts a lunch break from the action row
  - ends an active break and clocks out cleanly
  - dismisses the daily security banner and persists the dismissal date
  - home-load failure shows a retry state and can recover cleanly
  - logs out and clears local auth state
  - no-route state prevents clock-in side effects

### My Drive

- [src/screens/MyDriveScreen.test.js](/Users/phillipmetzger/readyroute/driver-app/src/screens/MyDriveScreen.test.js:1)
  - stop filtering and mappable stop derivation
  - map focus coordinate selection
  - route region generation
  - time-commit urgency and formatting
  - quick-intel and stop-tool prioritization
- [src/screens/MyDriveScreen.interaction.test.js](/Users/phillipmetzger/readyroute/driver-app/src/screens/MyDriveScreen.interaction.test.js:1)
  - selecting a stop recenters the map without forcing fit/zoom reset
  - selected-stop quick action opens stop detail
  - selected-stop nav button hands off to Google Maps
  - completing a selected stop sends the correct delivered status
  - recenter button uses map fit behavior when the driver is near the stop
  - pickup stops complete with `pickup_complete`
  - Google Maps handoff falls back to web URLs when native maps are unavailable
  - complete-stop failures surface an alert instead of silently failing
  - route-load failure shows a retry state and can recover cleanly

### Stop Detail

- [src/screens/StopDetailScreen.test.js](/Users/phillipmetzger/readyroute/driver-app/src/screens/StopDetailScreen.test.js:1)
  - status and stop-type metadata
  - primary and secondary address rendering
  - warning flag formatting
  - apartment/business/time-window badge presentation
- [src/screens/StopDetailScreen.interaction.test.js](/Users/phillipmetzger/readyroute/driver-app/src/screens/StopDetailScreen.interaction.test.js:1)
  - saves stop notes through the live screen flow
  - saves corrected GPS pins through the live screen flow
  - confirms apartment floor through the live screen flow
  - flags road issues through the live screen flow
  - shows the correct alert when Google Maps cannot be opened
  - invalid floor values do not submit
  - empty notes do not submit
  - corrected-pin save handles denied location permission
  - handles denied location permission during road flagging
  - road flagging is blocked when the stop has no usable pin

### Auth Helpers

- [src/services/auth.test.js](/Users/phillipmetzger/readyroute/driver-app/src/services/auth.test.js:1)
  - decodes driver payload from token
  - safely handles malformed tokens

## Known Limits

- Native map behavior is still helper-tested rather than interaction-tested on a real map surface.
- `react-native-maps` makes true web export inappropriate for this app, so the compile guardrail uses a native Expo export instead.
- The highest-value next tests are:
  - `HomeScreen` route-complete presentation and break-update failure handling
  - `MyDriveScreen` center-button far-distance behavior and location-post retry resilience
  - `StopDetailScreen` refresh-after-save failure handling and flag-road failure responses
  - driver timecard flows against fuller mocked API responses

## Last Verified Loop

Run from `/Users/phillipmetzger/readyroute/driver-app`:

- `npm run check`
- `npm run test`
- `npm run build:native`
- `npm run check:release`

Most recent verified result:

- Date: `2026-04-15`
- `npm run check`: passed
- `npm run test`: passed
  - `9` test suites
  - `43` tests
- `npm run build:native`: passed
- `npm run check:release`: passed
- `npm run build:native:production`: passed
- `npm run release:prep`: passed

Update this file as more coverage is added.
