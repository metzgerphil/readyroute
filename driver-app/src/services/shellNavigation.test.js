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
    expect(getDrawerMenuItems('manager').map((item) => item.label)).toEqual([
      'Manager Overview',
      'Routes',
      'Notifications',
      'Settings'
    ]);
  });

  it('builds the correct role switch label', () => {
    expect(getModeSwitchLabel('driver')).toBe('Switch to Manager Mode');
    expect(getModeSwitchLabel('manager')).toBe('Switch to Driver Mode');
  });
});
