import { useEffect, useState } from 'react';
import { getReadyRouteStaffTokenPayload } from '../services/auth';

export default function useStaffReviewDraft(name, initial) {
  const user = getReadyRouteStaffTokenPayload()?.staff_user_id || 'signed-out';
  const key = `readyroute:staff-review-draft:${user}:${name}`;
  const [draft, setDraft] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) || initial; } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(draft)); } catch { /* Server saves remain authoritative if browser storage is full. */ }
  }, [key, draft]);
  return [draft, setDraft];
}
