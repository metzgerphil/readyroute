export function getDrawerMenuItems(activeMode) {
  if (activeMode === 'manager') {
    return [
      {
        icon: 'building',
        key: 'manager-csa',
        label: 'CSA',
        screen: null,
        subtitle: 'Manage and switch accounts'
      },
      {
        icon: 'home',
        key: 'manager-dashboard',
        label: 'Dashboard',
        screen: 'ManagerDashboard',
        subtitle: 'Live manager overview'
      },
      {
        icon: 'notes',
        key: 'manager-manifest',
        label: 'Manifest',
        screen: 'ManagerManifest',
        subtitle: 'Manual XLS and GPX upload'
      },
      {
        icon: 'route',
        key: 'manager-routes',
        label: 'Routes',
        screen: 'ManagerRoutes',
        subtitle: 'Route list and progress'
      },
      {
        icon: 'drivers',
        key: 'manager-drivers',
        label: 'Drivers',
        screen: 'ManagerDrivers',
        subtitle: 'Driver management'
      },
      {
        icon: 'vehicles',
        key: 'manager-vehicles',
        label: 'Vehicles',
        screen: 'ManagerVehicles',
        subtitle: 'Fleet and vehicle management'
      },
      {
        icon: 'settings',
        key: 'manager-settings',
        label: 'Settings',
        screen: 'ManagerSettings',
        subtitle: 'Mobile manager preferences'
      },
      {
        icon: 'warning',
        key: 'manager-help',
        label: 'Help',
        screen: null,
        subtitle: 'Support resources'
      }
    ];
  }

  return [
    {
      icon: 'home',
      key: 'driver-home',
      label: 'Driver Home',
      screen: 'Home',
      subtitle: 'Today and next stop'
    },
    {
      icon: 'route',
      key: 'driver-my-drive',
      label: 'My Drive',
      screen: 'MyDrive',
      subtitle: 'Map and delivery flow'
    },
    {
      icon: 'notes',
      key: 'driver-manifest',
      label: 'Manifest',
      screen: 'Manifest',
      subtitle: 'Stops and packages'
    }
  ];
}
