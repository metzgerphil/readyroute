import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import MobileNavigationDrawer from './MobileNavigationDrawer';

describe('MobileNavigationDrawer', () => {
  it('shows driver identity and role-aware driver menu items', () => {
    const screen = render(
      <MobileNavigationDrawer
        activeMode="driver"
        currentRouteName="Home"
        identity={{
          fullName: 'Luis Perez',
          companyName: 'Bridge Transportation',
          primaryRole: 'Driver'
        }}
        isOpen
        onClose={jest.fn()}
        onLogout={jest.fn()}
        onNavigate={jest.fn()}
        onSwitchMode={jest.fn()}
        showModeSwitch
      />
    );

    expect(screen.getByText('Luis Perez')).toBeTruthy();
    expect(screen.getByText('Bridge Transportation')).toBeTruthy();
    expect(screen.getByText('Switch to Manager Mode')).toBeTruthy();
    expect(screen.getByText('Driver Home')).toBeTruthy();
    expect(screen.getByText('My Drive')).toBeTruthy();
    expect(screen.getByText('Manifest')).toBeTruthy();
  });

  it('shows manager menu items and hides the switch action when only one role is available', () => {
    const onNavigate = jest.fn();
    const screen = render(
      <MobileNavigationDrawer
        activeMode="manager"
        currentRouteName="ManagerOverview"
        identity={{
          fullName: 'Vlad Fedoryshyn',
          companyName: 'ReadyRoute CSA West',
          primaryRole: 'Manager'
        }}
        isOpen
        onClose={jest.fn()}
        onLogout={jest.fn()}
        onNavigate={onNavigate}
        onSwitchMode={jest.fn()}
        showModeSwitch={false}
      />
    );

    expect(screen.getByText('Manager Overview')).toBeTruthy();
    expect(screen.getByText('Routes')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.queryByText('Manager')).toBeNull();
    expect(screen.queryByText('Switch to Driver Mode')).toBeNull();

    fireEvent.press(screen.getByText('Manager Overview'));
    expect(onNavigate).toHaveBeenCalledWith('ManagerOverview');
  });
});
