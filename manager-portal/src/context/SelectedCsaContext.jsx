import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import api from '../services/api';
import {
  getManagerAccountId,
  getSelectedCsaId,
  saveManagerToken,
  saveSelectedCsaId
} from '../services/auth';
import {
  deriveSelectedCsa,
  deriveSelectedCsaName,
  getAuthorizedCsaId,
  resolveSelectedCsaId
} from '../utils/selectedCsa';

const SelectedCsaContext = createContext(null);

export function SelectedCsaProvider({ children }) {
  const queryClient = useQueryClient();
  const attemptedStoredSwitchRef = useRef(false);
  const [selectedCsaId, setSelectedCsaIdState] = useState(() => getManagerAccountId() || null);
  const [isSwitchingCsa, setIsSwitchingCsa] = useState(false);
  const [csaSelectionError, setCsaSelectionError] = useState('');

  const csaQuery = useQuery({
    queryKey: ['manager-csas', selectedCsaId || getManagerAccountId() || 'unknown'],
    queryFn: async () => {
      const response = await api.get('/manager/csas');
      return response.data || { current_csa: null, csas: [] };
    }
  });

  const csaOptions = useMemo(() => csaQuery.data?.csas || [], [csaQuery.data?.csas]);
  const tokenCsaId = csaQuery.data?.current_csa?.id || getManagerAccountId() || null;
  const selectedCsa = useMemo(() => (
    deriveSelectedCsa({
      csas: csaOptions,
      selectedCsaId,
      tokenCsaId,
      currentCsa: csaQuery.data?.current_csa
    })
  ), [csaOptions, csaQuery.data?.current_csa, selectedCsaId, tokenCsaId]);
  const selectedCsaName = deriveSelectedCsaName(selectedCsa);

  const switchCsa = useCallback(async (nextCsaId, options = {}) => {
    const redirectTo = options.redirectTo || '/setup';
    setCsaSelectionError('');

    if (!nextCsaId || nextCsaId === tokenCsaId) {
      saveSelectedCsaId(nextCsaId || tokenCsaId);
      setSelectedCsaIdState(nextCsaId || tokenCsaId);
      return;
    }

    setIsSwitchingCsa(true);
    saveSelectedCsaId(nextCsaId);

    try {
      const response = await api.post('/manager/csas/switch', {
        account_id: nextCsaId
      });
      saveManagerToken(response.data?.token || '');
      setSelectedCsaIdState(nextCsaId);
      queryClient.clear();
      window.location.assign(redirectTo);
    } catch (error) {
      setSelectedCsaIdState(tokenCsaId);
      saveSelectedCsaId(tokenCsaId);
      setCsaSelectionError(error.response?.data?.error || 'CSA switch could not be completed right now.');
      throw error;
    } finally {
      setIsSwitchingCsa(false);
    }
  }, [queryClient, tokenCsaId]);

  const setSelectedCsaId = useCallback((nextCsaId) => {
    return switchCsa(nextCsaId);
  }, [switchCsa]);

  useEffect(() => {
    if (!csaQuery.data) {
      return;
    }

    const storedCsaId = getSelectedCsaId();
    const storedAuthorizedId = getAuthorizedCsaId(csaOptions, storedCsaId);
    const nextSelectedId = resolveSelectedCsaId({
      csas: csaOptions,
      storedCsaId,
      tokenCsaId
    });

    if (storedCsaId && !storedAuthorizedId) {
      saveSelectedCsaId(null);
    }

    if (nextSelectedId && nextSelectedId !== selectedCsaId) {
      setSelectedCsaIdState(nextSelectedId === tokenCsaId ? nextSelectedId : tokenCsaId);
    }

    if (
      storedAuthorizedId &&
      tokenCsaId &&
      storedAuthorizedId !== tokenCsaId &&
      !isSwitchingCsa &&
      !attemptedStoredSwitchRef.current
    ) {
      attemptedStoredSwitchRef.current = true;
      switchCsa(storedAuthorizedId, { redirectTo: window.location.pathname || '/setup' });
    }
  }, [csaOptions, csaQuery.data, isSwitchingCsa, selectedCsaId, switchCsa, tokenCsaId]);

  const value = useMemo(() => ({
    csaOptions,
    csaQuery,
    csaSelectionError: csaSelectionError || (csaQuery.isError ? 'Could not load linked CSAs.' : ''),
    isCsaLoading: csaQuery.isLoading || isSwitchingCsa,
    isLoadingSelectedCsa: csaQuery.isLoading || isSwitchingCsa,
    isSwitchingCsa,
    linkedCsas: csaOptions,
    selectedCsa,
    selectedCsaId,
    selectedCsaName,
    setSelectedCsaId,
    switchCsa,
    tokenCsaId
  }), [
    csaOptions,
    csaQuery,
    csaSelectionError,
    isSwitchingCsa,
    selectedCsa,
    selectedCsaId,
    selectedCsaName,
    setSelectedCsaId,
    switchCsa,
    tokenCsaId
  ]);

  return (
    <SelectedCsaContext.Provider value={value}>
      {children}
    </SelectedCsaContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSelectedCsa() {
  const context = useContext(SelectedCsaContext);

  if (!context) {
    throw new Error('useSelectedCsa must be used inside SelectedCsaProvider');
  }

  return context;
}
