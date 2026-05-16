export function getAuthorizedCsaId(csas = [], csaId) {
  if (!csaId) {
    return null;
  }

  return csas.some((csa) => csa?.id === csaId) ? csaId : null;
}

export function resolveSelectedCsaId({
  csas = [],
  storedCsaId = null,
  tokenCsaId = null
} = {}) {
  return (
    getAuthorizedCsaId(csas, storedCsaId) ||
    getAuthorizedCsaId(csas, tokenCsaId) ||
    csas.find((csa) => csa?.id)?.id ||
    null
  );
}

export function deriveSelectedCsa({
  csas = [],
  selectedCsaId = null,
  tokenCsaId = null,
  currentCsa = null
} = {}) {
  return (
    csas.find((csa) => csa?.id === selectedCsaId) ||
    csas.find((csa) => csa?.id === tokenCsaId) ||
    currentCsa ||
    null
  );
}

export function deriveSelectedCsaName(selectedCsa) {
  return selectedCsa?.company_name || selectedCsa?.name || '';
}
