jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn()
}));

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn()
  }
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn()
}));

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: {
    Images: 'Images'
  },
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn()
}));

import {
  DAILY_SAFETY_REMINDERS,
  getDailySafetyReminder,
  getDayOfYear,
  getDriverDayStatus,
  getLocationRequirementCopy,
  getPostDispatchChangeNotice,
  getDriverWaitingCopy,
  getInspectionForm,
  getInspectionFormValidationError,
  getInspectionItemDefinition,
  getInspectionProgress,
  getInspectionRequirement,
  getInspectionSectionsForItems,
  getInspectionSubmissionRouteId,
  getOdometerRequirement,
  normalizeSafetyFocusResponse,
  hasGrantedLocationPermission,
  isDeniedLocationPermission,
  serializeInspectionItems,
  shouldPromptForLocationPermission,
  formatBreakLabel,
  getGreetingByTime,
  getRoutePresentation,
  getRouteSummary,
  getTodayStorageDate
} from './HomeScreen';

describe('HomeScreen helpers', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the correct greeting by time of day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-15T08:00:00-07:00'));
    expect(getGreetingByTime()).toBe('Good morning');

    jest.setSystemTime(new Date('2026-04-15T14:00:00-07:00'));
    expect(getGreetingByTime()).toBe('Good afternoon');

    jest.setSystemTime(new Date('2026-04-15T20:00:00-07:00'));
    expect(getGreetingByTime()).toBe('Good evening');
  });

  it('formats break labels and route presentation consistently', () => {
    expect(formatBreakLabel('lunch')).toBe('Lunch');
    expect(formatBreakLabel('rest')).toBe('Break');
    expect(formatBreakLabel('other')).toBe('Break');

    expect(getRoutePresentation('pending').actionLabel).toBe('Acknowledge');
    expect(getRoutePresentation('in_progress').actionLabel).toBe('Continue Route');
    expect(getRoutePresentation('complete').actionLabel).toBeNull();
  });

  it('builds the storage date in stable YYYY-MM-DD format', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-15T09:30:00-07:00'));
    expect(getTodayStorageDate()).toBe('2026-04-15');
  });

  it('rotates a concrete safety reminder based on the calendar day', () => {
    const reminderDate = new Date('2026-04-15T09:30:00-07:00');
    const expectedIndex = (getDayOfYear(reminderDate) - 1) % DAILY_SAFETY_REMINDERS.length;

    expect(getDailySafetyReminder(reminderDate)).toEqual(DAILY_SAFETY_REMINDERS[expectedIndex]);
    expect(getDailySafetyReminder(reminderDate).bullets.length).toBeGreaterThan(2);
  });

  it('normalizes a database-backed safety focus for the driver card', () => {
    expect(
      normalizeSafetyFocusResponse({
        id: 'focus-1',
        title: 'Set the parking brake every time',
        source: null,
        bullets: ['Use it at every stop.', '', null],
        takeaway: 'Small habits prevent incidents.'
      })
    ).toEqual({
      id: 'focus-1',
      title: 'Set the parking brake every time',
      source: 'ReadyRoute safety focus',
      bullets: ['Use it at every stop.'],
      takeaway: 'Small habits prevent incidents.'
    });

    expect(normalizeSafetyFocusResponse({ title: 'Missing bullets', bullets: [] })).toBeNull();
  });

  it('builds a compact route summary for the home card', () => {
    expect(
      getRouteSummary({
        work_area_name: '816',
        vehicle_name: '418666',
        stops_per_hour: 12.4,
        pickup_stops: 3,
        pickup_stops_completed: 1
      })
    ).toEqual(['Route 816', 'Vehicle 418666', '12.4 stops/hr', '1/3 pickups']);
  });

  it('derives the odometer gate range from driver day data', () => {
    expect(getOdometerRequirement({ odometer_requirement: { required: false } }, { id: 'route-1' })).toBeNull();
    expect(
      getOdometerRequirement(
        {
          odometer_requirement: {
            required: true,
            submitted: false,
            vehicle_id: 'vehicle-1',
            last_recorded_odometer: 54250
          }
        },
        { id: 'route-1', vehicle_id: 'vehicle-1' }
      )
    ).toMatchObject({
      vehicle_id: 'vehicle-1',
      minimum_odometer: 54250,
      maximum_odometer: 54550
    });
  });

  it('derives the route-specific inspection gate and default checklist form', () => {
    const requirement = getInspectionRequirement(
      {
        inspection_requirement: {
          required: true,
          submitted: false,
          route_id: 'route-1',
          vehicle_id: 'vehicle-1',
          inspection_date: '2026-06-24',
          last_recorded_odometer: 12000,
          checklist_items: [
            { checklist_item_key: 'tires', label: 'Tires' },
            { checklist_item_key: 'lights', label: 'Lights' }
          ]
        }
      },
      { id: 'route-1', vehicle_id: 'vehicle-1' }
    );

    expect(requirement).toMatchObject({
      route_id: 'route-1',
      vehicle_id: 'vehicle-1',
      minimum_odometer: 12000,
      maximum_odometer: 12300
    });
    expect(getInspectionForm(requirement)).toEqual({
      odometer: '',
      issue_note: '',
      items: [
        {
          checklist_item_key: 'tires',
          label: 'Tires',
          category: 'critical_safety',
          status: 'unanswered',
          severity: null,
          issue_details: {},
          note: '',
          photos: []
        },
        {
          checklist_item_key: 'lights',
          label: 'Lights',
          category: 'critical_safety',
          status: 'unanswered',
          severity: null,
          issue_details: {},
          note: '',
          photos: []
        }
      ]
    });
    expect(
      getInspectionRequirement(
        { inspection_requirement: { required: true, submitted: true } },
        { id: 'route-1' }
      )
    ).toBeNull();
    expect(
      getInspectionRequirement(
        {
          inspection_requirement: {
            required: true,
            submitted: false,
            reason: 'manual_assignment',
            assignment_id: 'assignment-1',
            vehicle_id: 'vehicle-9',
            vehicle_name: '411987',
            inspection_date: '2026-06-27',
            last_recorded_odometer: 74000,
            blocks_route_start: false,
            checklist_items: [{ checklist_item_key: 'tires', label: 'Tires' }]
          }
        },
        null
      )
    ).toMatchObject({
      assignment_id: 'assignment-1',
      vehicle_id: 'vehicle-9',
      vehicle_name: '411987',
      blocks_route_start: false,
      minimum_odometer: 74000,
      maximum_odometer: 74300
    });
    expect(
      getInspectionSubmissionRouteId(
        {
          reason: 'manual_assignment',
          assignment_id: 'assignment-1',
          route_id: null
        },
        { id: 'route-1' }
      )
    ).toBeNull();
    expect(
      getInspectionSubmissionRouteId(
        {
          route_id: 'route-1'
        },
        { id: 'route-2' }
      )
    ).toBe('route-2');
  });

  it('tracks inspection progress and validates issue details before submission', () => {
    const form = {
      items: [
        { checklist_item_key: 'tires', label: 'Tires', category: 'critical_safety', status: 'pass' },
        {
          checklist_item_key: 'coolant',
          label: 'Coolant',
          category: 'maintenance',
          status: 'issue',
          severity: 'maintenance_soon',
          issue_details: { issue_type: 'Leak suspected' },
          note: 'Small puddle under front passenger side.',
          photos: [{ url: 'https://cdn/photo.jpg' }]
        },
        { checklist_item_key: 'truck_cleanliness', label: 'Truck Cleanliness', category: 'vehicle_condition', status: 'unanswered' }
      ]
    };

    expect(getInspectionProgress(form)).toEqual({
      completedCount: 2,
      issueCount: 1,
      remainingCount: 1,
      total: 3
    });
    expect(getInspectionFormValidationError(form)).toBe('Answer Truck Cleanliness before submitting.');

    const completeForm = {
      ...form,
      items: form.items.map((item) => (
        item.checklist_item_key === 'truck_cleanliness'
          ? {
              ...item,
              status: 'issue',
              severity: 'minor',
              issue_details: { condition: 'Dirty' },
              photos: []
            }
          : item
      ))
    };

    expect(getInspectionFormValidationError(completeForm)).toBeNull();
    expect(getInspectionSectionsForItems(completeForm.items).map((section) => section.title)).toEqual([
      'Critical Safety',
      'Maintenance',
      'Vehicle Condition'
    ]);
    expect(serializeInspectionItems(completeForm.items)[1]).toMatchObject({
      checklist_item_key: 'coolant',
      status: 'issue',
      severity: 'maintenance_soon',
      issue_details: { issue_type: 'Leak suspected' },
      photos: [{ url: 'https://cdn/photo.jpg' }]
    });
  });

  it('uses VEDR issue choices with a default maintenance severity', () => {
    const vedrDefinition = getInspectionItemDefinition({ checklist_item_key: 'vedr' });
    const form = {
      items: [
        {
          checklist_item_key: 'vedr',
          label: 'VEDR',
          category: 'safety_equipment',
          status: 'issue',
          severity: vedrDefinition.defaultIssueSeverity,
          issue_details: { issue_type: 'Fell off' },
          photos: []
        }
      ]
    };

    expect(vedrDefinition.hideSeveritySelector).toBe(true);
    expect(vedrDefinition.defaultIssueSeverity).toBe('maintenance_soon');
    expect(vedrDefinition.issueFields[0].options).toEqual(['Not Connected', 'red light', 'Fell off']);
    expect(getInspectionFormValidationError(form)).toBeNull();
    expect(serializeInspectionItems(form.items)[0]).toMatchObject({
      checklist_item_key: 'vedr',
      status: 'issue',
      severity: 'maintenance_soon',
      issue_details: { issue_type: 'Fell off' }
    });
  });

  it('uses Back Up Camera issue choices with a default maintenance severity', () => {
    const cameraDefinition = getInspectionItemDefinition({ checklist_item_key: 'back_up_camera' });
    const form = {
      items: [
        {
          checklist_item_key: 'back_up_camera',
          label: 'Back Up Camera',
          category: 'safety_equipment',
          status: 'issue',
          severity: cameraDefinition.defaultIssueSeverity,
          issue_details: { issue_type: 'Monitor glitching' },
          photos: []
        }
      ]
    };

    expect(cameraDefinition.hideSeveritySelector).toBe(true);
    expect(cameraDefinition.defaultIssueSeverity).toBe('maintenance_soon');
    expect(cameraDefinition.issueFields[0].options).toEqual(['Not showing', 'Monitor glitching']);
    expect(getInspectionFormValidationError(form)).toBeNull();
    expect(serializeInspectionItems(form.items)[0]).toMatchObject({
      checklist_item_key: 'back_up_camera',
      status: 'issue',
      severity: 'maintenance_soon',
      issue_details: { issue_type: 'Monitor glitching' }
    });
  });

  it('uses Turn Cameras issue choices with a default maintenance severity', () => {
    const turnCameraDefinition = getInspectionItemDefinition({ checklist_item_key: 'turn_cameras' });
    const form = {
      items: [
        {
          checklist_item_key: 'turn_cameras',
          label: 'Turn Cameras',
          category: 'safety_equipment',
          status: 'issue',
          severity: turnCameraDefinition.defaultIssueSeverity,
          issue_details: { issue_type: 'camera loose' },
          photos: []
        }
      ]
    };

    expect(turnCameraDefinition.hideSeveritySelector).toBe(true);
    expect(turnCameraDefinition.defaultIssueSeverity).toBe('maintenance_soon');
    expect(turnCameraDefinition.issueFields[0].options).toEqual(['Not connected', 'monitor glitching', 'camera loose']);
    expect(getInspectionFormValidationError(form)).toBeNull();
    expect(serializeInspectionItems(form.items)[0]).toMatchObject({
      checklist_item_key: 'turn_cameras',
      status: 'issue',
      severity: 'maintenance_soon',
      issue_details: { issue_type: 'camera loose' }
    });
  });

  it('uses Parking Sensors issue choices with a default maintenance severity', () => {
    const parkingSensorsDefinition = getInspectionItemDefinition({ checklist_item_key: 'parking_sensors' });
    const form = {
      items: [
        {
          checklist_item_key: 'parking_sensors',
          label: 'Parking Sensors',
          category: 'safety_equipment',
          status: 'issue',
          severity: parkingSensorsDefinition.defaultIssueSeverity,
          issue_details: { issue_type: 'sensor missing' },
          photos: []
        }
      ]
    };

    expect(parkingSensorsDefinition.hideSeveritySelector).toBe(true);
    expect(parkingSensorsDefinition.defaultIssueSeverity).toBe('maintenance_soon');
    expect(parkingSensorsDefinition.issueFields[0].options).toEqual(['No sound', 'sensor missing']);
    expect(getInspectionFormValidationError(form)).toBeNull();
    expect(serializeInspectionItems(form.items)[0]).toMatchObject({
      checklist_item_key: 'parking_sensors',
      status: 'issue',
      severity: 'maintenance_soon',
      issue_details: { issue_type: 'sensor missing' }
    });
  });

  it('derives the staged waiting state for drivers before dispatch', () => {
    expect(getDriverDayStatus({ status: 'awaiting_dispatch' }, null)).toBe('awaiting_dispatch');
    expect(getDriverDayStatus({ status: 'awaiting_dispatch' }, { id: 'route-1' })).toBe('dispatched');
    expect(
      getDriverWaitingCopy({
        route_preview: {
          work_area_name: '810',
          last_manifest_sync_at: '2026-04-24T13:45:00.000Z'
        }
      }).title
    ).toBe('Route staged for dispatch');
  });

  it('classifies post-dispatch route changes for driver messaging', () => {
    expect(
      getPostDispatchChangeNotice({
        post_dispatch_change_policy: {
          code: 'manager_review_required'
        }
      }).title
    ).toBe('Route changed after dispatch');
    expect(
      getPostDispatchChangeNotice({
        post_dispatch_change_policy: {
          code: 'driver_warning'
        }
      }).title
    ).toBe('Route updated after dispatch');
    expect(getPostDispatchChangeNotice(null)).toBeNull();
  });

  it('describes and validates the required location-sharing gate', () => {
    expect(hasGrantedLocationPermission({ granted: true })).toBe(true);
    expect(hasGrantedLocationPermission({ status: 'granted' })).toBe(true);
    expect(hasGrantedLocationPermission({ granted: false })).toBe(false);
    expect(shouldPromptForLocationPermission({ status: 'undetermined' })).toBe(true);
    expect(shouldPromptForLocationPermission({ status: 'denied' })).toBe(false);
    expect(isDeniedLocationPermission({ status: 'denied', granted: false, canAskAgain: true })).toBe(true);
    expect(isDeniedLocationPermission({ status: 'undetermined', granted: false })).toBe(false);
    expect(getLocationRequirementCopy().title).toBe('Enable location for route tracking');
    expect(getLocationRequirementCopy().blocked).toBe('Location access is required to run a route in ReadyRoute.');
    expect(getLocationRequirementCopy().bullets).toHaveLength(3);
    expect(getLocationRequirementCopy().bullets[0]).toMatch(/\.$/);
  });
});
