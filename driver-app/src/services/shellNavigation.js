export function getDrawerMenuItems(activeMode) {
  if (activeMode === 'manager') {
    return [
      {
        key: 'manager-map',
        label: 'Map View',
        screen: 'ManagerMap'
      },
      {
        key: 'manager-routes',
        label: 'Routes',
        screen: 'ManagerRoutes'
      },
      {
        key: 'manager-drivers',
        label: 'Drivers',
        screen: 'ManagerDrivers'
      },
      {
        key: 'manager-access-codes',
        label: 'Access Codes',
        screen: 'ManagerAccessCodes'
      },
      {
        key: 'manager-vehicles',
        label: 'Vehicles',
        screen: 'ManagerVehicles'
      },
      {
        key: 'manager-vedr',
        label: 'VEDR',
        screen: 'ManagerVedr'
      },
      {
        key: 'manager-settings',
        label: 'Settings',
        screen: 'ManagerSettings'
      }
    ];
  }

  return [
    {
      key: 'driver-home',
      label: 'Driver Home',
      screen: 'Home'
    },
    {
      key: 'driver-my-drive',
      label: 'My Drive',
      screen: 'MyDrive'
    },
    {
      key: 'driver-manifest',
      label: 'Manifest',
      screen: 'Manifest'
    }
  ];
}

export function getModeSwitchLabel(activeMode) {
  return activeMode === 'manager' ? 'Switch to Driver Mode' : 'Switch to Manager Mode';
}
