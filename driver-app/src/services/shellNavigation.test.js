import { getDrawerMenuItems } from './shellNavigation';

describe('shellNavigation helpers', () => {
  it('returns driver navigation items for driver mode', () => {
    expect(getDrawerMenuItems('driver').map((item) => item.label)).toEqual([
      'Driver Home',
      'My Drive',
      'Manifest'
    ]);
  });

  it('returns manager navigation items for manager mode', () => {
    const items = getDrawerMenuItems('manager');

    expect(items.map((item) => item.label)).toEqual([
      'CSA',
      'Dashboard',
      'Manifest',
      'Routes',
      'Drivers',
      'Vehicles',
      'Settings',
      'Help'
    ]);
    expect(items.find((item) => item.label === 'Manifest')?.screen).toBe('ManagerManifest');
    expect(items.find((item) => item.label === 'Drivers')?.screen).toBe('ManagerDrivers');
    expect(items.find((item) => item.label === 'Vehicles')?.screen).toBe('ManagerVehicles');
  });
});
