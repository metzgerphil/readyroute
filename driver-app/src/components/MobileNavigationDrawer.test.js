import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import api from '../services/api';
import MobileNavigationDrawer from './MobileNavigationDrawer';

jest.mock('../services/api', () => ({
  delete: jest.fn(),
  get: jest.fn(),
  post: jest.fn()
}));

function renderDrawer(props) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, right: 0, bottom: 34, left: 0 }
      }}
    >
      <MobileNavigationDrawer {...props} />
    </SafeAreaProvider>
  );
}

describe('MobileNavigationDrawer', () => {
  beforeEach(() => {
    api.delete.mockReset();
    api.get.mockReset();
    api.post.mockReset();
    jest.restoreAllMocks();
  });

  it('shows driver identity and role-aware driver menu items', () => {
    const onSwitchMode = jest.fn();
    const screen = renderDrawer({
      activeMode: 'driver',
      currentRouteName: 'Home',
      identity: {
        fullName: 'Luis Perez',
        companyName: 'Bridge Transportation',
        primaryRole: 'Driver'
      },
      isOpen: true,
      onClose: jest.fn(),
      onLogout: jest.fn(),
      onNavigate: jest.fn(),
      onSwitchMode,
      showModeSwitch: true
    });

    expect(screen.getByText('Luis Perez')).toBeTruthy();
    expect(screen.getByText('Bridge Transportation')).toBeTruthy();
    expect(screen.getByText('Driver')).toBeTruthy();
    expect(screen.getByText('Manager')).toBeTruthy();
    expect(screen.queryByText('Switch to Manager Mode')).toBeNull();
    expect(screen.getByText('Driver Home')).toBeTruthy();
    expect(screen.getByText('Today and next stop')).toBeTruthy();
    expect(screen.getByText('My Drive')).toBeTruthy();
    expect(screen.getByText('Map and delivery flow')).toBeTruthy();
    expect(screen.getByText('Manifest')).toBeTruthy();
    expect(screen.getByText('Stops and packages')).toBeTruthy();

    fireEvent.press(screen.getByText('Manager'));
    expect(onSwitchMode).toHaveBeenCalled();
  });

  it('shows manager menu items and explains when driver mode is unavailable', () => {
    const onNavigate = jest.fn();
    const onLogout = jest.fn();
    const screen = renderDrawer({
      activeMode: 'manager',
      currentRouteName: 'ManagerDashboard',
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'ReadyRoute CSA West',
        primaryRole: 'Manager'
      },
      isOpen: true,
      onClose: jest.fn(),
      onLogout,
      onNavigate,
      onSwitchMode: jest.fn(),
      showModeSwitch: false
    });

    expect(screen.getByText('Manager')).toBeTruthy();
    expect(screen.getByText('CSA')).toBeTruthy();
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Manifest')).toBeTruthy();
    expect(screen.getByText('Routes')).toBeTruthy();
    expect(screen.getByText('Drivers')).toBeTruthy();
    expect(screen.getByText('Vehicles')).toBeTruthy();
    expect(screen.queryByText('Notifications')).toBeNull();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Help')).toBeTruthy();
    expect(screen.getByText('Logout')).toBeTruthy();
    expect(screen.queryByText('Switch to Driver Mode')).toBeNull();
    expect(screen.getByText('Driver mode unavailable for this login')).toBeTruthy();

    fireEvent.press(screen.getByText('Dashboard'));
    expect(onNavigate).toHaveBeenCalledWith('ManagerDashboard');

    fireEvent.press(screen.getByText('Manifest'));
    expect(onNavigate).toHaveBeenCalledWith('ManagerManifest');

    fireEvent.press(screen.getByText('Routes'));
    expect(onNavigate).toHaveBeenCalledWith('ManagerRoutes');

    fireEvent.press(screen.getByText('Drivers'));
    expect(onNavigate).toHaveBeenCalledWith('ManagerDrivers');

    fireEvent.press(screen.getByText('Vehicles'));
    expect(onNavigate).toHaveBeenCalledWith('ManagerVehicles');

    fireEvent.press(screen.getByText('Logout'));
    expect(onLogout).toHaveBeenCalled();
  });

  it('does not use the ReadyRoute brand as a workspace fallback', () => {
    const screen = renderDrawer({
      activeMode: 'manager',
      currentRouteName: 'ManagerDashboard',
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: null,
        primaryRole: 'Manager'
      },
      isOpen: true,
      onClose: jest.fn(),
      onLogout: jest.fn(),
      onNavigate: jest.fn(),
      onSwitchMode: jest.fn(),
      showModeSwitch: false
    });

    expect(screen.getByText('Current CSA')).toBeTruthy();
    expect(screen.queryByText('ReadyRoute')).toBeNull();
  });

  it('shows coming soon instead of navigating unfinished manager pages', () => {
    const onNavigate = jest.fn();
    const screen = renderDrawer({
      activeMode: 'manager',
      currentRouteName: 'ManagerRoutes',
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'ReadyRoute CSA West',
        primaryRole: 'Manager'
      },
      isOpen: true,
      onClose: jest.fn(),
      onLogout: jest.fn(),
      onNavigate,
      onSwitchMode: jest.fn(),
      showModeSwitch: true
    });

    fireEvent.press(screen.getByText('Help'));

    expect(screen.getByText('Mobile help resources will open here when support content is ready.')).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('loads CSA workspaces and switches to another CSA', async () => {
    const onManagerWorkspaceSwitch = jest.fn();
    api.get.mockResolvedValue({
      data: {
        current_csa: {
          id: 'csa-1',
          company_name: 'Bridge Transportation',
          manager_email: 'manager@example.com',
          is_current: true
        },
        csas: [
          {
            id: 'csa-1',
            company_name: 'Bridge Transportation',
            manager_email: 'manager@example.com',
            is_current: true
          },
          {
            id: 'csa-2',
            company_name: 'North County Routes',
            manager_email: 'manager@example.com',
            is_current: false
          }
        ]
      }
    });
    api.post.mockResolvedValue({
      data: {
        token: 'next-manager-token'
      }
    });

    const screen = renderDrawer({
      activeMode: 'manager',
      currentRouteName: 'ManagerRoutes',
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'ReadyRoute CSA West',
        primaryRole: 'Manager'
      },
      isOpen: true,
      onClose: jest.fn(),
      onLogout: jest.fn(),
      onManagerWorkspaceSwitch,
      onNavigate: jest.fn(),
      onSwitchMode: jest.fn(),
      showModeSwitch: true
    });

    fireEvent.press(screen.getByText('CSA'));

    await waitFor(() => {
      expect(screen.getByText('CSA Workspaces')).toBeTruthy();
      expect(screen.getByText('North County Routes')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Switch'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/manager/csas/switch', {
        account_id: 'csa-2'
      }, {
        authMode: 'manager'
      });
      expect(onManagerWorkspaceSwitch).toHaveBeenCalledWith('next-manager-token');
    });
  });

  it('confirms and unlinks another CSA workspace', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons.find((button) => button.text === 'Unlink')?.onPress?.();
    });
    api.get.mockResolvedValue({
      data: {
        current_csa: {
          id: 'csa-1',
          company_name: 'Bridge Transportation',
          manager_email: 'manager@example.com',
          is_current: true
        },
        csas: [
          {
            id: 'csa-1',
            company_name: 'Bridge Transportation',
            manager_email: 'manager@example.com',
            is_current: true
          },
          {
            id: 'csa-2',
            company_name: 'North County Routes',
            manager_email: 'manager@example.com',
            is_current: false
          }
        ]
      }
    });
    api.delete.mockResolvedValue({
      data: {
        csas: [
          {
            id: 'csa-1',
            company_name: 'Bridge Transportation',
            manager_email: 'manager@example.com',
            is_current: true
          }
        ]
      }
    });

    const screen = renderDrawer({
      activeMode: 'manager',
      currentRouteName: 'ManagerRoutes',
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'ReadyRoute CSA West',
        primaryRole: 'Manager'
      },
      isOpen: true,
      onClose: jest.fn(),
      onLogout: jest.fn(),
      onManagerWorkspaceSwitch: jest.fn(),
      onNavigate: jest.fn(),
      onSwitchMode: jest.fn(),
      showModeSwitch: true
    });

    fireEvent.press(screen.getByText('CSA'));

    await waitFor(() => {
      expect(screen.getByText('North County Routes')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Unlink'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Unlink CSA',
        expect.stringContaining('North County Routes'),
        expect.any(Array)
      );
      expect(api.delete).toHaveBeenCalledWith('/manager/csas/csa-2/access', {
        authMode: 'manager'
      });
      expect(screen.queryByText('North County Routes')).toBeNull();
    });
  });
});
