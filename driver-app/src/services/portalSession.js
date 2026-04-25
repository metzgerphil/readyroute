export const PORTAL_MODES = {
  DRIVER: 'driver',
  MANAGER: 'manager'
};

export function getAvailablePortalModes(access = {}) {
  return [PORTAL_MODES.DRIVER, PORTAL_MODES.MANAGER].filter((mode) => Boolean(access[mode]));
}

export function resolvePortalState(sessionTokens = {}, preferredMode = null) {
  const access = {
    driver: Boolean(sessionTokens.driverToken),
    manager: Boolean(sessionTokens.managerToken)
  };
  const availableModes = getAvailablePortalModes(access);
  const hasAnyAccess = availableModes.length > 0;
  const hasMultipleModes = availableModes.length > 1;

  if (!hasAnyAccess) {
    return {
      access,
      activeMode: null,
      availableModes,
      hasAnyAccess,
      needsModeSelection: false
    };
  }

  if (preferredMode && access[preferredMode]) {
    return {
      access,
      activeMode: preferredMode,
      availableModes,
      hasAnyAccess,
      needsModeSelection: false
    };
  }

  if (hasMultipleModes) {
    return {
      access,
      activeMode: null,
      availableModes,
      hasAnyAccess,
      needsModeSelection: true
    };
  }

  return {
    access,
    activeMode: availableModes[0],
    availableModes,
    hasAnyAccess,
    needsModeSelection: false
  };
}

export function applyUnauthorizedMode(sessionTokens = {}, activeMode = null, unauthorizedMode = null) {
  const nextSessionTokens = {
    driverToken: sessionTokens.driverToken || null,
    managerToken: sessionTokens.managerToken || null
  };

  if (unauthorizedMode === PORTAL_MODES.DRIVER) {
    nextSessionTokens.driverToken = null;
  }

  if (unauthorizedMode === PORTAL_MODES.MANAGER) {
    nextSessionTokens.managerToken = null;
  }

  const nextState = resolvePortalState(nextSessionTokens, activeMode);

  return {
    nextSessionTokens,
    nextState
  };
}
