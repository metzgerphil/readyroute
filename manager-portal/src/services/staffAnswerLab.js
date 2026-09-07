import { getReadyRouteStaffToken } from './auth';

export async function staffAnswerLab(path, body) {
  const response = await fetch(`/readyroute/answers-lab/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${getReadyRouteStaffToken() || ''}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(35000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Staff testing is unavailable. Please try again.');
  return result;
}
