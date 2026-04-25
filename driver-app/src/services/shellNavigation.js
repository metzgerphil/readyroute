export function getDrawerMenuItems(activeMode) {
  if (activeMode === 'manager') {
    return [
      {
        key: 'manager-overview',
        label: 'Manager Overview',
        screen: 'ManagerOverview'
      },
      {
        key: 'manager-routes',
        label: 'Routes',
        screen: 'ManagerRoutes'
      },
      {
        key: 'manager-notifications',
        label: 'Notifications',
        screen: 'ManagerNotifications'
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
