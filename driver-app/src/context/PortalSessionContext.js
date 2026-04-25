import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { setAuthContextResolver, setUnauthorizedHandler } from '../services/api';
import {
  getSessionIdentity,
  getLastPortalMode,
  getSessionTokens,
  removeClockInTime,
  removeDriverToken,
  removeManagerToken,
  removeToken,
  saveLastPortalMode,
  saveSessionTokens
} from '../services/auth';
import { applyUnauthorizedMode, resolvePortalState } from '../services/portalSession';

const PortalSessionContext = createContext(null);

export function PortalSessionProvider({ children }) {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [sessionTokens, setSessionTokens] = useState({ driverToken: null, managerToken: null });
  const [activeMode, setActiveMode] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        const storedTokens = await getSessionTokens();
        const preferredMode = await getLastPortalMode(storedTokens);
        const nextState = resolvePortalState(storedTokens, preferredMode);

        if (!isMounted) {
          return;
        }

        setSessionTokens(nextState.hasAnyAccess ? storedTokens : { driverToken: null, managerToken: null });
        setActiveMode(nextState.activeMode);
      } catch (_error) {
        if (isMounted) {
          setSessionTokens({ driverToken: null, managerToken: null });
          setActiveMode(null);
        }
      } finally {
        if (isMounted) {
          setIsBootstrapping(false);
        }
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setAuthContextResolver(() => ({
      activeMode,
      ...sessionTokens
    }));

    return () => {
      setAuthContextResolver(null);
    };
  }, [activeMode, sessionTokens]);

  useEffect(() => {
    setUnauthorizedHandler(async ({ mode }) => {
      const { nextSessionTokens, nextState } = applyUnauthorizedMode(sessionTokens, activeMode, mode);

      if (mode === 'driver') {
        await removeClockInTime();
        await removeDriverToken();
      }

      if (mode === 'manager') {
        await removeManagerToken();
      }

      if (!nextState.hasAnyAccess) {
        await removeClockInTime();
        await removeToken();
      } else if (nextState.activeMode) {
        await saveLastPortalMode(nextState.activeMode, nextSessionTokens);
      }

      setSessionTokens(nextState.hasAnyAccess ? nextSessionTokens : { driverToken: null, managerToken: null });
      setActiveMode(nextState.activeMode);
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [activeMode, sessionTokens]);

  const state = useMemo(() => resolvePortalState(sessionTokens, activeMode), [activeMode, sessionTokens]);
  const identity = useMemo(
    () =>
      getSessionIdentity({
        activeMode,
        ...sessionTokens
      }),
    [activeMode, sessionTokens]
  );

  async function authenticate(nextTokens) {
    const normalizedTokens = typeof nextTokens === 'string'
      ? { driverToken: nextTokens, managerToken: null }
      : {
          driverToken: nextTokens?.driverToken || null,
          managerToken: nextTokens?.managerToken || null
        };
    const preferredMode = await getLastPortalMode(normalizedTokens);
    const nextState = resolvePortalState(normalizedTokens, preferredMode);

    if (nextState.activeMode) {
      await saveLastPortalMode(nextState.activeMode, normalizedTokens);
    }

    setSessionTokens(normalizedTokens);
    setActiveMode(nextState.activeMode);
  }

  async function selectMode(mode) {
    if (!state.access[mode]) {
      return;
    }

    await saveLastPortalMode(mode, sessionTokens);
    setActiveMode(mode);
  }

  async function logout() {
    await removeClockInTime();
    await removeToken();
    setSessionTokens({ driverToken: null, managerToken: null });
    setActiveMode(null);
  }

  const value = {
    activeMode,
    authenticate,
    availableModes: state.availableModes,
    hasAnyAccess: state.hasAnyAccess,
    identity,
    isBootstrapping,
    needsModeSelection: state.needsModeSelection,
    selectMode,
    sessionTokens,
    access: state.access,
    logout
  };

  return (
    <PortalSessionContext.Provider value={value}>
      {children}
    </PortalSessionContext.Provider>
  );
}

export function usePortalSession() {
  const context = useContext(PortalSessionContext);

  if (!context) {
    throw new Error('usePortalSession must be used within PortalSessionProvider');
  }

  return context;
}
