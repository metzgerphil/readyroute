import { getDrawerMenuItems, getModeSwitchLabel } from './shellNavigation';

describe('shellNavigation helpers', () => {
  it('returns driver navigation items for driver mode', () => {
    expect(getDrawerMenuItems('driver').map((item) => item.label)).toEqual([
      'Operational Help',
      'Route Tools',
      'Notifications',
      'My Drive',
      'Manifest'
    ]);
  });

  it('returns manager navigation items for manager mode', () => {
    const managerItems = getDrawerMenuItems('manager');

    expect(managerItems.map((item) => item.label)).toEqual([
      'Map View',
      'Routes',
      'Drivers',
      'Access Codes',
      'Vehicles',
      'Notifications',
      'VEDR',
      'Settings'
    ]);
    expect(managerItems.find((item) => item.label === 'Map View')?.screen).toBe('ManagerMap');
  });

  it('hides legacy driver tools in operational-help-only builds', () => {
    expect(getDrawerMenuItems('driver', { driverHelpOnly: true })).toEqual([
      {
        key: 'driver-home',
        label: 'Operational Help',
        screen: 'Home'
      }
    ]);
  });

  it('builds the correct role switch label', () => {
    expect(getModeSwitchLabel('driver')).toBe('Switch to Manager Mode');
    expect(getModeSwitchLabel('manager')).toBe('Switch to Driver Mode');
  });
});
