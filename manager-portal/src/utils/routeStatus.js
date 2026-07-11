const ROUTE_STATUS_COLORS = {
  active: '#27ae60',
  warning: '#f59e0b',
  purple: '#7c3aed',
  neutral: '#9ca3af',
  info: '#3b82f6',
  accent: '#FF6200'
};

export function getRouteStatusMeta(route) {
  if (route?.dispatch_state === 'dispatched') {
    return { label: 'Dispatched', tone: 'active', color: ROUTE_STATUS_COLORS.active };
  }

  if (route?.sync_state === 'dispatch_blocked' || route?.sync_state === 'needs_attention') {
    return { label: 'Needs review', tone: 'warning', color: ROUTE_STATUS_COLORS.warning };
  }

  if (route?.sync_state === 'staged_changed' || route?.sync_state === 'changed_after_dispatch') {
    return { label: 'Changed', tone: 'warning', color: ROUTE_STATUS_COLORS.warning };
  }

  if (route?.sync_state === 'sync_failed') {
    return { label: 'Sync failed', tone: 'warning', color: ROUTE_STATUS_COLORS.warning };
  }

  if (route?.sync_state === 'staged' || route?.dispatch_state === 'staged') {
    return { label: 'Staged', tone: 'purple', color: ROUTE_STATUS_COLORS.purple };
  }

  if (route?.status === 'ready') {
    return { label: 'Ready', tone: 'neutral', color: ROUTE_STATUS_COLORS.info };
  }

  if (route?.status === 'in_progress') {
    return { label: 'In progress', tone: 'active', color: ROUTE_STATUS_COLORS.accent };
  }

  if (route?.status === 'complete') {
    return { label: 'Complete', tone: 'active', color: ROUTE_STATUS_COLORS.active };
  }

  if (route?.status === 'pending') {
    return { label: 'Pending', tone: 'neutral', color: ROUTE_STATUS_COLORS.neutral };
  }

  return {
    label: route?.sync_state || route?.status || 'Available',
    tone: 'neutral',
    color: ROUTE_STATUS_COLORS.neutral
  };
}
