import { getDrawerMenuItems, getModeSwitchLabel } from './shellNavigation';

describe('shellNavigation helpers', () => {
  it('returns driver navigation items for driver mode', () => {
    expect(getDrawerMenuItems('driver').map((item) => item.label)).toEqual([
      'Driver Home',
      'My Drive',
      'Manifest'
    ]);
  });

  it('returns manager navigation items for manager mode', () => {
    const managerItems = getDrawerMenuItems('manager');

    expect(managerItems.map((item) => item.label)).toEqual([
      'Map View',
      'Routes',
      'Access Codes',
      'Vehicles',
      'VEDR',
      'Settings'
    ]);
    expect(managerItems.find((item) => item.label === 'Map View')?.screen).toBe('ManagerMap');
  });

  it('builds the correct role switch label', () => {
    expect(getModeSwitchLabel('driver')).toBe('Switch to Manager Mode');
    expect(getModeSwitchLabel('manager')).toBe('Switch to Driver Mode');
  });
});
