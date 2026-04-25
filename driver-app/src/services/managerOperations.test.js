import {
  buildManagerMapModel,
  buildManagerOverviewStats,
  buildRouteClusterMarkers,
  clampSheetOffset,
  getClusterRadiusMiles,
  getGpsFreshness,
  getSheetSnapLayout,
  isMapZoomedIn,
  resolveNearestSheetSnap
} from './managerOperations';

describe('managerOperations helpers', () => {
  it('clusters nearby route centroids while preserving the selected route marker', () => {
    const routes = [
      {
        id: 'route-1',
        work_area_name: '816',
        stops: [
          { lat: 33.12, lng: -117.08 },
          { lat: 33.121, lng: -117.079 }
        ]
      },
      {
        id: 'route-2',
        work_area_name: '817',
        stops: [
          { lat: 33.123, lng: -117.082 },
          { lat: 33.124, lng: -117.081 }
        ]
      },
      {
        id: 'route-3',
        work_area_name: '901',
        stops: [
          { lat: 33.4, lng: -117.3 }
        ]
      },
      {
        id: 'route-4',
        work_area_name: '902',
        stops: [
          { lat: 33.401, lng: -117.301 }
        ]
      }
    ];

    const markers = buildRouteClusterMarkers(routes, { selectedRouteId: 'route-1', clusterRadiusMiles: 1 });

    expect(markers[0]).toMatchObject({
      kind: 'route',
      routeId: 'route-1',
      selected: true
    });
    expect(markers.some((marker) => marker.kind === 'cluster')).toBe(true);
    expect(markers.find((marker) => marker.kind === 'cluster')?.count).toBe(2);
  });

  it('builds a combined map model with selected-route stop pins and driver markers', () => {
    const model = buildManagerMapModel({
      selectedRouteId: 'route-1',
      region: {
        latitude: 33.12,
        longitude: -117.08,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05
      },
      routes: [
        {
          id: 'route-1',
          work_area_name: '816',
          driver_name: 'Luis',
          is_online: true,
          last_position: {
            lat: 33.12,
            lng: -117.08
          },
          stops: [
            { id: 'stop-1', sequence_order: 1, lat: 33.11, lng: -117.09, status: 'pending' }
          ]
        }
      ]
    });

    expect(model.selectedRoute.id).toBe('route-1');
    expect(model.driverMarkers).toHaveLength(1);
    expect(model.stopMarkers).toHaveLength(1);
    expect(model.region.latitude).toBeCloseTo(33.115, 2);
  });

  it('keeps stop pins hidden until the map is zoomed in or a route is selected', () => {
    const routes = [
      {
        id: 'route-1',
        work_area_name: '816',
        stops: [
          { id: 'stop-1', sequence_order: 1, lat: 33.11, lng: -117.09, status: 'pending' }
        ]
      }
    ];

    const zoomedOutModel = buildManagerMapModel({
      routes,
      region: {
        latitude: 33.11,
        longitude: -117.09,
        latitudeDelta: 0.4,
        longitudeDelta: 0.4
      }
    });
    const zoomedInModel = buildManagerMapModel({
      routes,
      region: {
        latitude: 33.11,
        longitude: -117.09,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05
      }
    });

    expect(zoomedOutModel.stopMarkers).toHaveLength(0);
    expect(zoomedInModel.stopMarkers).toHaveLength(1);
  });

  it('derives zoom thresholds, cluster radius, and gps freshness safely', () => {
    expect(isMapZoomedIn({ latitudeDelta: 0.08, longitudeDelta: 0.08 })).toBe(true);
    expect(isMapZoomedIn({ latitudeDelta: 0.22, longitudeDelta: 0.22 })).toBe(false);
    expect(getClusterRadiusMiles({ latitudeDelta: 0.04, longitudeDelta: 0.04 })).toBeLessThan(
      getClusterRadiusMiles({ latitudeDelta: 0.3, longitudeDelta: 0.3 })
    );

    expect(
      getGpsFreshness(
        {
          is_online: true,
          last_position: {
            timestamp: '2026-04-23T15:29:00.000Z'
          }
        },
        new Date('2026-04-23T15:30:00.000Z').getTime()
      )
    ).toMatchObject({
      state: 'live',
      shortLabel: 'Live'
    });

    expect(
      getGpsFreshness(
        {
          is_online: false,
          last_position: {
            timestamp: '2026-04-23T15:10:00.000Z'
          }
        },
        new Date('2026-04-23T15:30:00.000Z').getTime()
      )
    ).toMatchObject({
      state: 'stale'
    });
  });

  it('resolves mobile sheet snap points predictably', () => {
    const layout = getSheetSnapLayout(800);

    expect(layout.expandedHeight).toBeGreaterThan(layout.halfHeight);
    expect(layout.collapsedHeight).toBeLessThan(layout.halfHeight);
    expect(clampSheetOffset(-20, layout)).toBe(0);
    expect(clampSheetOffset(layout.maxOffset + 40, layout)).toBe(layout.maxOffset);
    expect(resolveNearestSheetSnap(layout.snapOffsets.collapsed - 10, layout)).toBe('collapsed');
    expect(resolveNearestSheetSnap(layout.snapOffsets.half + 5, layout)).toBe('half');
    expect(resolveNearestSheetSnap(8, layout)).toBe('expanded');
  });

  it('summarizes manager overview metrics across routes', () => {
    const summary = buildManagerOverviewStats([
      {
        id: 'route-1',
        status: 'complete',
        completed_stops: 10,
        total_stops: 10,
        delivered_packages: 45,
        total_packages: 48,
        time_commits_completed: 4,
        time_commits_total: 5,
        is_online: true,
        last_position: {
          timestamp: new Date().toISOString()
        },
        stops: [
          { id: 'stop-1', status: 'delivered' },
          { id: 'stop-2', status: 'attempted', exception_code: 'NSL' }
        ]
      },
      {
        id: 'route-2',
        status: 'in_progress',
        completed_stops: 3,
        total_stops: 9,
        delivered_packages: 12,
        total_packages: 28,
        time_commits_completed: 1,
        time_commits_total: 2,
        is_online: false,
        last_position: {
          timestamp: '2026-04-23T15:10:00.000Z'
        },
        stops: [
          { id: 'stop-3', status: 'pending' }
        ]
      }
    ]);

    expect(summary.routeSummary).toEqual({
      completed: 1,
      total: 2
    });
    expect(summary.commitSummary).toEqual({
      completed: 5,
      total: 7
    });
    expect(summary.stopSummary).toEqual({
      completed: 13,
      total: 19,
      exception: 1
    });
    expect(summary.packageSummary).toEqual({
      completed: 57,
      total: 76,
      pending: 19
    });
    expect(summary.liveDrivers).toBe(1);
  });
});
