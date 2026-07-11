import {
  buildRouteDetailMapModel,
  formatDriverFreshness,
  getPackageProgress,
  getRouteWarnings,
  getStopIndicatorLabels
} from './managerRouteDetail';

describe('managerRouteDetail helpers', () => {
  it('summarizes package progress and route warnings from stop data', () => {
    const stops = [
      {
        id: 'stop-1',
        status: 'pending',
        has_time_commit: true,
        has_note: true,
        packages: [{ id: 'pkg-1' }]
      },
      {
        id: 'stop-2',
        status: 'delivered',
        completed_at: '2026-04-23T16:00:00.000Z',
        exception_code: '07',
        packages: [{ id: 'pkg-2' }, { id: 'pkg-3' }]
      }
    ];

    expect(getPackageProgress(stops)).toEqual({
      delivered: 2,
      total: 3
    });
    expect(getRouteWarnings(stops)).toEqual({
      exceptions: 1,
      notedStops: 1,
      pendingTimeCommits: 1
    });
    expect(getStopIndicatorLabels(stops[0])).toEqual(expect.arrayContaining(['Time commit', 'Note']));
    expect(getStopIndicatorLabels(stops[1])).toEqual(expect.arrayContaining(['Code 07']));
  });

  it('formats driver freshness and builds a route detail map model', () => {
    expect(
      formatDriverFreshness(
        {
          timestamp: '2026-04-23T15:29:00.000Z'
        },
        new Date('2026-04-23T15:30:00.000Z').getTime()
      )
    ).toBe('Driver seen just now');

    const model = buildRouteDetailMapModel({
      route: {
        work_area_name: '816',
        driver_name: 'Luis'
      },
      driverPosition: {
        lat: 33.12,
        lng: -117.08,
        driver_name: 'Luis'
      },
      stops: [
        {
          routeStopId: 'route-stop-1',
          sequence_order: 1,
          lat: 33.11,
          lng: -117.09,
          status: 'pending',
          packages: [{ id: 'pkg-1' }]
        }
      ]
    });

    expect(model.routeMarker.workAreaName).toBe('816');
    expect(model.driverMarker.driverName).toBe('Luis');
    expect(model.stopMarkers).toHaveLength(1);
    expect(model.stopMarkers[0].stopId).toBe('route-stop-1');
    expect(model.region.latitude).toBeCloseTo(33.115, 2);
  });
});
