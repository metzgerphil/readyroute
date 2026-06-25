import {
  buildManagerMapModel,
  buildManagerOverviewStats,
  buildStopMarkers,
  buildRouteClusterMarkers,
  clampSheetOffset,
  getClusterRadiusMiles,
  getDriverInitials,
  getGpsFreshness,
  getRouteColor,
  getSheetSnapLayout,
  getStopCanonicalId,
  isMapZoomedIn,
  resolveNearestSheetSnap,
  sortManagerRoutes
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
    expect(model.routeMarkers).toHaveLength(0);
    expect(model.driverMarkers).toHaveLength(1);
    expect(model.driverMarkers[0].driverInitials).toBe('LU');
    expect(model.stopMarkers).toHaveLength(1);
    expect(model.stopMarkers[0].routeColor).toBe('#ff7a1a');
    expect(model.region.latitude).toBeCloseTo(33.115, 2);
  });

  it('builds readable driver initials for map markers', () => {
    expect(getDriverInitials('Luis Perez')).toBe('LP');
    expect(getDriverInitials('Vlad')).toBe('VL');
    expect(getDriverInitials('')).toBe('--');
  });

  it('uses canonical stop ids for map pin to list synchronization', () => {
    expect(getStopCanonicalId({ manifestStopId: 'manifest-36', sequence_order: 36 })).toBe('manifest-36');
    expect(getStopCanonicalId({ route_stop_id: 'route-stop-87', sequence_order: 87 })).toBe('route-stop-87');
    expect(getStopCanonicalId({ sequence_order: 36, address: '100 Main St' })).toBe('36:100 Main St');

    const markers = buildStopMarkers({
      id: 'route-1',
      stops: [
        {
          manifestStopId: 'manifest-36',
          sequence_order: 36,
          lat: 33.11,
          lng: -117.09,
          packages: [{ id: 'pkg-1', requires_adult_signature: true }]
        }
      ]
    });

    expect(markers[0]).toMatchObject({
      key: 'stop:manifest-36',
      stopId: 'manifest-36',
      sequenceOrder: 36,
      requiresSignature: true
    });
  });

  it('sorts manager routes by their numeric work area', () => {
    const routes = sortManagerRoutes([
      { id: 'route-847', work_area_name: '847' },
      { id: 'route-811', work_area_name: '811' },
      { id: 'route-823', work_area_name: 'OCEA - 823 BRIDGE' },
      { id: 'route-alpha', work_area_name: 'Alpha' },
      { id: 'route-810', work_area_name: '810' }
    ]);

    expect(routes.map((route) => route.work_area_name)).toEqual([
      '810',
      '811',
      'OCEA - 823 BRIDGE',
      '847',
      'Alpha'
    ]);
  });

  it('assigns stable manager route colors without mutating route data', () => {
    const routes = [
      { id: 'route-1', work_area_name: '910' },
      { id: 'route-2', work_area_name: '911' },
      { id: 'route-3', work_area_name: '912' }
    ];

    expect(getRouteColor(routes[0], [routes[0]])).toBe('#ff7a1a');
    expect(getRouteColor(routes[1], routes)).toBe(getRouteColor(routes[1], routes));
    expect(getRouteColor(routes[1], [...routes].reverse())).toBe(getRouteColor(routes[1], routes));
    expect(new Set(routes.map((route) => getRouteColor(route, routes))).size).toBe(routes.length);
    expect(getRouteColor({ id: 'route-custom', routeColor: '#123abc' }, routes)).toBe('#123abc');
    expect(routes[1].routeColor).toBeUndefined();
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

  it('derives zoom thresholds, cluster radius, and location freshness safely', () => {
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
          status: 'in_progress',
          last_position: null
        },
        new Date('2026-04-23T15:30:00.000Z').getTime()
      )
    ).toMatchObject({
      label: 'Location permission needed',
      shortLabel: 'Location needed'
    });

    expect(
      getGpsFreshness(
        {
          status: 'pending',
          last_position: null
        },
        new Date('2026-04-23T15:30:00.000Z').getTime()
      )
    ).toMatchObject({
      label: 'Driver not on route yet',
      shortLabel: 'Not started'
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
          { id: 'stop-3', status: 'pending', stop_type: 'pickup' }
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
    expect(summary.pickupStops).toBe(1);
    expect(summary.liveDrivers).toBe(1);
  });
});
