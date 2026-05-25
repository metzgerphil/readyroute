export function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}
