jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn()
  }
}));

jest.mock('../services/auth', () => ({
  getPinColorMode: jest.fn(),
  getClockInTime: jest.fn(),
  removeClockInTime: jest.fn(),
  saveClockInTime: jest.fn(),
  subscribePinColorMode: jest.fn(() => jest.fn())
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn()
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');

  function MockMapView({ children }) {
    return <View>{children}</View>;
  }

  return {
    __esModule: true,
    default: MockMapView,
    Marker: ({ children }) => <View>{children}</View>,
    Callout: ({ children }) => <View>{children}</View>,
    PROVIDER_GOOGLE: 'google'
  };
});

import {
  buildGoogleNavigationUrls,
  formatTimeCommitLine,
  getMarkerRenderKey,
  getBannerBadges,
  getCompactStopTools,
  getFocusCoordinates,
  getMapRegion,
  getQuickIntel,
  getStopStatusColors,
  getStopTools,
  getStopsPerHourLabel,
  getTimeCommitCallout,
  getTimeCommitUrgency,
  hasGrantedLocationPermission,
  shouldPromptForLocationPermission,
  getStopType,
  getVisibleBannerBadges,
  toCoordinate
} from './MyDriveScreen';

describe('MyDriveScreen helpers', () => {
  it('builds coordinate and map focus helpers safely', () => {
    const stop = { lat: 33.12, lng: -117.08 };
    expect(toCoordinate(stop)).toEqual({ latitude: 33.12, longitude: -117.08 });
    expect(toCoordinate({ lat: null, lng: -117.08 })).toBeNull();

    const selectedStop = { lat: 33.12, lng: -117.08 };
    const currentLocation = {
      coords: { latitude: 33.121, longitude: -117.081 }
    };

    expect(getFocusCoordinates({ currentLocation, selectedStop })).toHaveLength(2);
    expect(getMapRegion({ currentStop: selectedStop, currentLocation }).latitude).toBe(33.12);
  });

  it('derives stop type, time commit presentation, and urgency correctly', () => {
    const combinedStop = { has_delivery: true, has_pickup: true };
    const pickupStop = { stop_type: 'pickup' };
    const timedStop = { has_time_commit: true, ready_time: '09:00', close_time: '10:00' };

    expect(getStopType(combinedStop)).toBe('combined');
    expect(getStopType(pickupStop)).toBe('pickup');
    expect(formatTimeCommitLine(timedStop)).toBe('TC: 09:00–10:00');

    const warningUrgency = getTimeCommitUrgency(
      { has_time_commit: true, close_time: '10:00' },
      new Date('2026-04-15T09:20:00')
    );
    expect(warningUrgency.level).toBe('warning');

    const urgentUrgency = getTimeCommitUrgency(
      { has_time_commit: true, close_time: '10:00' },
      new Date('2026-04-15T09:40:00')
    );
    expect(urgentUrgency.level).toBe('urgent');

    const overdueUrgency = getTimeCommitUrgency(
      { has_time_commit: true, close_time: '10:00' },
      new Date('2026-04-15T10:10:00')
    );
    expect(overdueUrgency.level).toBe('overdue');

    expect(getTimeCommitCallout(timedStop).title).toContain('Deliver between');
    expect(getStopsPerHourLabel(null)).toBe('-- stops/hr');
    expect(getStopsPerHourLabel(1.4)).toBe('1.4 stops/hr');
    expect(hasGrantedLocationPermission({ granted: true })).toBe(true);
    expect(hasGrantedLocationPermission({ granted: false })).toBe(false);
    expect(shouldPromptForLocationPermission({ status: 'undetermined' })).toBe(true);
    expect(shouldPromptForLocationPermission({ status: 'granted' })).toBe(false);
  });

  it('keeps quick intel and stop tools compact and operational', () => {
    const stop = {
      is_business: true,
      has_note: true,
      floor_label: 'Floor 3',
      location_correction: { label: 'Driver verified pin' },
      property_intel: {
        location_type: 'office',
        access_note: 'Front desk check-in',
        grouped_stop_count: 3
      },
      apartment_intelligence: null
    };

    const badges = getBannerBadges({
      ...stop,
      stop_type: 'pickup',
      has_time_commit: true,
      ready_time: '09:00',
      close_time: '10:00'
    });
    expect(badges.map((badge) => badge.label)).toEqual(
      expect.arrayContaining(['BUSINESS', 'PICKUP', 'TC: 09:00–10:00', '• NOTE'])
    );

    const quickIntel = getQuickIntel(stop);
    expect(quickIntel.length).toBeLessThanOrEqual(3);
    expect(quickIntel.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Floor 3', 'Access note', '3 grouped stops'])
    );

    const tools = getStopTools(stop);
    expect(tools.map((tool) => tool.label)).toEqual(
      expect.arrayContaining(['Saved pin active', 'Future note saved'])
    );

    const compactTools = getCompactStopTools(stop);
    expect(compactTools.length).toBeLessThanOrEqual(2);

    const visibleBadges = getVisibleBannerBadges({
      ...stop,
      stop_type: 'combined',
      has_time_commit: true,
      ready_time: '09:00',
      close_time: '10:00'
    });
    expect(visibleBadges.length).toBeLessThanOrEqual(3);

    const urls = buildGoogleNavigationUrls('200 Oak St, Escondido, CA');
    expect(urls).toEqual({
      nativeGoogleMapsUrl: 'comgooglemaps://?daddr=200%20Oak%20St%2C%20Escondido%2C%20CA&directionsmode=driving',
      webGoogleMapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=200%20Oak%20St%2C%20Escondido%2C%20CA&travelmode=driving'
    });
  });

  it('builds stable marker render keys that refresh when selection state changes', () => {
    expect(
      getMarkerRenderKey({
        itemId: 'stop:81',
        isCurrentStop: false,
        refreshVersion: 2
      })
    ).toBe('stop:81:idle:2');

    expect(
      getMarkerRenderKey({
        itemId: 'stop:81',
        isCurrentStop: true,
        refreshVersion: 3
      })
    ).toBe('stop:81:selected:3');
  });

  it('uses SID bucket colors for pending pins and lets black mode stay monochrome', () => {
    expect(
      getStopStatusColors('pending', false, 'delivery', { sid: '3061', is_business: true }, 'sid')
    ).toMatchObject({
      fill: '#ffffff',
      border: '#16a34a',
      text: '#16a34a'
    });

    expect(
      getStopStatusColors('pending', false, 'delivery', { sid: '3061', is_business: true }, 'black')
    ).toMatchObject({
      fill: '#ffffff',
      border: '#111111',
      text: '#111111'
    });
  });
});
