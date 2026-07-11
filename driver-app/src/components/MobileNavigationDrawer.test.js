import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MobileNavigationDrawer, { getMobileMenuLayout } from './MobileNavigationDrawer';

const safeAreaMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 }
};

const deviceScenarios = [
  {
    expected: {
      height: 559,
      top: 108,
      width: 'full'
    },
    height: 667,
    insets: { bottom: 0, left: 0, right: 0, top: 20 },
    label: 'iPhone small screen',
    width: 375
  },
  {
    expected: {
      height: 736,
      top: 108,
      width: 'full'
    },
    height: 844,
    insets: { bottom: 34, left: 0, right: 0, top: 47 },
    label: 'iPhone Pro size',
    width: 390
  },
  {
    expected: {
      height: 818,
      top: 108,
      width: 'full'
    },
    height: 926,
    insets: { bottom: 34, left: 0, right: 0, top: 47 },
    label: 'iPhone Pro Max size',
    width: 428
  },
  {
    expected: {
      height: 1214,
      left: 252,
      top: 108,
      width: 520
    },
    height: 1366,
    insets: { bottom: 20, left: 0, right: 0, top: 24 },
    label: 'iPad portrait',
    width: 1024
  },
  {
    expected: {
      height: 872,
      left: 423,
      top: 108,
      width: 520
    },
    height: 1024,
    insets: { bottom: 20, left: 0, right: 0, top: 24 },
    label: 'iPad landscape',
    width: 1366
  }
];

function renderDrawer(props) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <MobileNavigationDrawer {...props} />
    </SafeAreaProvider>
  );
}

describe('MobileNavigationDrawer', () => {
  it.each(deviceScenarios)('calculates safe menu geometry for $label', ({ expected, height, insets, width }) => {
    const layout = getMobileMenuLayout({ height, insets, width });

    expect(layout.sheetTop).toBe(expected.top);
    expect(layout.sheetHeight).toBe(expected.height);

    if (expected.width === 'full') {
      expect(layout.isTabletLayout).toBe(false);
      expect(layout.sheetFrameStyle).toMatchObject({
        height: expected.height,
        left: 0,
        right: 0,
        top: expected.top
      });
      expect(layout.sheetFrameStyle.width).toBeUndefined();
      return;
    }

    expect(layout.isTabletLayout).toBe(true);
    expect(layout.sheetFrameStyle).toMatchObject({
      height: expected.height,
      left: expected.left,
      top: expected.top,
      width: expected.width
    });
  });

  it('uses a tall phone sheet below the top controls', () => {
    const layout = getMobileMenuLayout({
      height: 844,
      insets: { bottom: 34, left: 0, right: 0, top: 47 },
      width: 390
    });

    expect(layout.isTabletLayout).toBe(false);
    expect(layout.sheetFrameStyle).toEqual({
      height: 736,
      left: 0,
      right: 0,
      top: 108
    });
    expect(layout.sheetHeight).toBe(736);
  });

  it('uses a capped tablet panel width', () => {
    const layout = getMobileMenuLayout({
      height: 1366,
      insets: { bottom: 20, left: 0, right: 0, top: 24 },
      width: 1024
    });

    expect(layout.isTabletLayout).toBe(true);
    expect(layout.sheetFrameStyle).toEqual({
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      height: 1214,
      left: 252,
      top: 108,
      width: 520
    });
  });

  it('keeps phone landscape in the phone sheet layout', () => {
    const layout = getMobileMenuLayout({
      height: 390,
      insets: { bottom: 21, left: 0, right: 0, top: 0 },
      width: 844
    });

    expect(layout.isTabletLayout).toBe(false);
    expect(layout.sheetFrameStyle.right).toBe(0);
    expect(layout.sheetHeight).toBe(282);
  });

  it('shows driver identity and role-aware driver menu items', () => {
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
      onSwitchMode: jest.fn(),
      showModeSwitch: true
    });

    expect(screen.getByText('Luis Perez')).toBeTruthy();
    expect(screen.getByText('Bridge Transportation')).toBeTruthy();
    expect(screen.getByText('Driver Mode')).toBeTruthy();
    expect(screen.getByText('L')).toBeTruthy();
    expect(screen.getByText('Switch to Manager Mode')).toBeTruthy();
    expect(screen.getByText('Driver Home')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('My Drive')).toBeTruthy();
    expect(screen.getByText('Manifest')).toBeTruthy();
    expect(screen.queryByText('DH')).toBeNull();
    expect(screen.getByText('Open')).toBeTruthy();
  });

  it('shows manager menu items and hides the switch action when only one role is available', () => {
    const onNavigate = jest.fn();
    const screen = renderDrawer({
      activeMode: 'manager',
      currentRouteName: 'ManagerMap',
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
      showModeSwitch: false
    });

    expect(screen.getByText('Map View')).toBeTruthy();
    expect(screen.getByText('Routes')).toBeTruthy();
    expect(screen.getByText('Drivers')).toBeTruthy();
    expect(screen.getByText('Access Codes')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('VEDR')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.queryByText('MV')).toBeNull();
    expect(screen.queryByText('RO')).toBeNull();
    expect(screen.queryByText('Manager')).toBeNull();
    expect(screen.queryByText('Switch to Driver Mode')).toBeNull();

    fireEvent.press(screen.getByText('Map View'));
    expect(onNavigate).toHaveBeenCalledWith('ManagerMap');
  });

  it('navigates manager rows through the existing destinations', () => {
    const onNavigate = jest.fn();
    const screen = renderDrawer({
      activeMode: 'manager',
      currentRouteName: 'ManagerMap',
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

    fireEvent.press(screen.getByText('Routes'));
    fireEvent.press(screen.getByText('Map View'));
    fireEvent.press(screen.getByText('Drivers'));
    fireEvent.press(screen.getByText('Access Codes'));
    fireEvent.press(screen.getByText('Vehicles'));
    fireEvent.press(screen.getByText('Notifications'));
    fireEvent.press(screen.getByText('VEDR'));

    expect(onNavigate).toHaveBeenCalledWith('ManagerRoutes');
    expect(onNavigate).toHaveBeenCalledWith('ManagerMap');
    expect(onNavigate).toHaveBeenCalledWith('ManagerDrivers');
    expect(onNavigate).toHaveBeenCalledWith('ManagerAccessCodes');
    expect(onNavigate).toHaveBeenCalledWith('ManagerVehicles');
    expect(onNavigate).toHaveBeenCalledWith('ManagerNotifications');
    expect(onNavigate).toHaveBeenCalledWith('ManagerVedr');
  });

  it('highlights the notifications tile when manager attention is needed', () => {
    const screen = renderDrawer({
      activeMode: 'manager',
      currentRouteName: 'ManagerVehicles',
      hasNotificationAttention: true,
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'ReadyRoute CSA West',
        primaryRole: 'Manager'
      },
      isOpen: true,
      onClose: jest.fn(),
      onLogout: jest.fn(),
      onNavigate: jest.fn(),
      onSwitchMode: jest.fn(),
      showModeSwitch: true
    });

    expect(screen.getByTestId('manager-notifications-attention-dot')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText('Notifications').props.style).color).toBe('#f05a00');
  });

  it('shows linked CSA workspaces and switches from the drawer', () => {
    const onManagerCsaSelect = jest.fn();
    const screen = renderDrawer({
      activeMode: 'manager',
      currentManagerCsaId: 'csa-bridge',
      currentRouteName: 'ManagerRoutes',
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'Bridge Transportation',
        primaryRole: 'Manager'
      },
      isOpen: true,
      managerCsas: [
        { id: 'csa-bridge', company_name: 'Bridge Transportation', is_current: true },
        { id: 'csa-pv', company_name: 'PV Delivery', is_current: false }
      ],
      onClose: jest.fn(),
      onLogout: jest.fn(),
      onManagerCsaSelect,
      onNavigate: jest.fn(),
      onSwitchMode: jest.fn(),
      showModeSwitch: false
    });

    expect(screen.getByText('CSA workspace')).toBeTruthy();
    expect(screen.getAllByText('Bridge Transportation').length).toBeGreaterThan(0);
    expect(screen.getByText('PV Delivery')).toBeTruthy();

    fireEvent.press(screen.getByText('PV Delivery'));

    expect(onManagerCsaSelect).toHaveBeenCalledWith('csa-pv');
  });

  it('keeps mode switching, support, and logout wired to the existing callbacks', () => {
    const onLogout = jest.fn();
    const onSupportPress = jest.fn();
    const onSwitchMode = jest.fn();
    const screen = renderDrawer({
      activeMode: 'manager',
      currentRouteName: 'ManagerMap',
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'ReadyRoute CSA West',
        primaryRole: 'Manager'
      },
      isOpen: true,
      onClose: jest.fn(),
      onLogout,
      onNavigate: jest.fn(),
      onSupportPress,
      onSwitchMode,
      showModeSwitch: true
    });

    fireEvent.press(screen.getByText('Switch to Driver Mode'));
    fireEvent.press(screen.getByText('Support'));
    fireEvent.press(screen.getByText('Logout'));

    expect(onSwitchMode).toHaveBeenCalledTimes(1);
    expect(onSupportPress).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps driver mode switch wired to the existing callback', () => {
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

    fireEvent.press(screen.getByText('Switch to Manager Mode'));

    expect(onSwitchMode).toHaveBeenCalledTimes(1);
  });

  it('closes from the X button and backdrop', () => {
    const onClose = jest.fn();
    const screen = renderDrawer({
      activeMode: 'manager',
      currentRouteName: 'ManagerMap',
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'ReadyRoute CSA West',
        primaryRole: 'Manager'
      },
      isOpen: true,
      onClose,
      onLogout: jest.fn(),
      onNavigate: jest.fn(),
      onSwitchMode: jest.fn(),
      showModeSwitch: true
    });

    const closeTargets = screen.getAllByLabelText('Close menu');
    fireEvent.press(closeTargets[0]);
    fireEvent.press(closeTargets[1]);

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
