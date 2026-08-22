export function buildRraTestQueryRequest({
  apiBase = '/manager/driver-help',
  question,
  sessionId = null,
  sessionContext = null
}) {
  return {
    url: `${apiBase}/query`,
    body: {
      question,
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(sessionContext ? { session_context: sessionContext } : {})
    }
  };
}
