export function getDrawerMenuItems(activeMode, { driverHelpOnly = false } = {}) {
  if (activeMode === 'manager') {
    if (driverHelpOnly) {
      return [
        {
          key: 'manager-overview',
          label: 'Company Overview',
          screen: 'ManagerDashboard'
        },
        {
          key: 'manager-drivers',
          label: 'Drivers & Invites',
          screen: 'ManagerDrivers'
        },
        {
          key: 'manager-settings',
          label: 'Account',
          screen: 'ManagerSettings'
        }
      ];
    }
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
        key: 'manager-notifications',
        label: 'Notifications',
        screen: 'ManagerNotifications'
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

  if (driverHelpOnly) {
    return [
      {
        key: 'driver-home',
        label: 'Operational Help',
        screen: 'Home'
      }
    ];
  }

  return [
    {
      key: 'driver-home',
      label: 'Operational Help',
      screen: 'Home'
    },
    {
      key: 'driver-route-tools',
      label: 'Route Tools',
      screen: 'RouteTools'
    },
    {
      key: 'driver-notifications',
      label: 'Notifications',
      screen: 'Notifications'
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
