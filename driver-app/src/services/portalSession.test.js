import { applyUnauthorizedMode, PORTAL_MODES, resolvePortalState } from './portalSession';

describe('portalSession helpers', () => {
  it('requires a selection for dual-access sessions without a preferred mode', () => {
    expect(
      resolvePortalState({
        driverToken: 'driver-token',
        managerToken: 'manager-token'
      })
    ).toEqual({
      access: {
        driver: true,
        manager: true
      },
      activeMode: null,
      availableModes: ['driver', 'manager'],
      hasAnyAccess: true,
      needsModeSelection: true
    });
  });

  it('chooses the only available mode automatically', () => {
    expect(
      resolvePortalState({
        driverToken: 'driver-token',
        managerToken: null
      })
    ).toEqual({
      access: {
        driver: true,
        manager: false
      },
      activeMode: 'driver',
      availableModes: ['driver'],
      hasAnyAccess: true,
      needsModeSelection: false
    });
  });

  it('preserves a valid preferred mode', () => {
    expect(
      resolvePortalState(
        {
          driverToken: 'driver-token',
          managerToken: 'manager-token'
        },
        PORTAL_MODES.MANAGER
      ).activeMode
    ).toBe('manager');
  });

  it('drops a lost mode and falls back to the remaining access', () => {
    const result = applyUnauthorizedMode(
      {
        driverToken: 'driver-token',
        managerToken: 'manager-token'
      },
      PORTAL_MODES.MANAGER,
      PORTAL_MODES.MANAGER
    );

    expect(result.nextSessionTokens).toEqual({
      driverToken: 'driver-token',
      managerToken: null
    });
    expect(result.nextState.activeMode).toBe('driver');
    expect(result.nextState.availableModes).toEqual(['driver']);
  });
});
