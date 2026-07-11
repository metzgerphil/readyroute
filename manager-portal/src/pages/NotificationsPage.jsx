import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';

function formatNotificationTime(value) {
  if (!value) {
    return 'Time unavailable';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Time unavailable';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function getSeverityTone(severity) {
  if (severity === 'urgent') {
    return 'urgent';
  }

  if (severity === 'warning') {
    return 'warning';
  }

  return 'neutral';
}

function getRelatedPath(notification) {
  if (notification?.link_type === 'vehicle_inspection') {
    const params = new URLSearchParams();
    const inspectionId = notification.link_ref?.inspection_id;
    const vehicleId = notification.link_ref?.vehicle_id;

    if (inspectionId) {
      params.set('inspection_id', inspectionId);
    }

    if (vehicleId) {
      params.set('vehicle_id', vehicleId);
    }

    return params.toString() ? `/vehicles?${params.toString()}` : '/vehicles';
  }

  if (notification?.link_type === 'route_inspection') {
    return '/routes';
  }

  return null;
}

function getRelatedActionLabel(notification) {
  if (notification?.link_type === 'vehicle_inspection') {
    return 'Open Inspection';
  }

  if (notification?.link_type === 'route_inspection') {
    return 'Open Routes';
  }

  return null;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ['manager-notifications'],
    queryFn: async () => {
      const response = await api.get('/manager/notifications');
      return response.data?.notifications || [];
    },
    refetchInterval: 60000
  });
  const markReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      const response = await api.patch(`/manager/notifications/${notificationId}/read`);
      return response.data?.notification || null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-notifications'] });
    }
  });

  const notifications = Array.isArray(notificationsQuery.data) ? notificationsQuery.data : [];
  const unreadCount = notifications.filter((notification) => notification.status !== 'read').length;
  const urgentCount = notifications.filter((notification) => notification.severity === 'urgent' && notification.status !== 'read').length;

  async function handleMarkRead(notification) {
    if (!notification?.id || notification.status === 'read') {
      return;
    }

    await markReadMutation.mutateAsync(notification.id);
  }

  async function handleOpenRelated(notification) {
    if (notification?.status !== 'read') {
      await handleMarkRead(notification);
    }

    const relatedPath = getRelatedPath(notification);

    if (relatedPath) {
      navigate(relatedPath);
    }
  }

  return (
    <section className="notifications-page">
      <PageHeader
        eyebrow="Manager Notifications"
        title="Notifications"
        description="Inspection review alerts and operational messages from ReadyRoute."
      />

      <div className="notifications-stat-grid">
        <StatCard label="Unread" value={unreadCount} tone={unreadCount ? 'warning' : 'active'} />
        <StatCard label="Urgent Review" value={urgentCount} tone={urgentCount ? 'urgent' : 'active'} />
        <StatCard label="Total" value={notifications.length} />
      </div>

      {notificationsQuery.isLoading ? (
        <LoadingState title="Loading notifications" variant="card" />
      ) : notificationsQuery.isError ? (
        <ErrorState
          title="Unable to load notifications"
          description="Refresh this page or try again in a moment."
          onRetry={() => notificationsQuery.refetch()}
        />
      ) : notifications.length ? (
        <div className="notifications-list" aria-live="polite">
          {notifications.map((notification) => {
            const isUnread = notification.status !== 'read';
            const relatedActionLabel = getRelatedActionLabel(notification);
            const isMarkingThisRead = markReadMutation.isPending && markReadMutation.variables === notification.id;

            return (
              <article
                className={`notification-row${isUnread ? ' unread' : ''}`}
                key={notification.id}
              >
                <div className="notification-row-main">
                  <div className="notification-row-meta">
                    <StatusBadge tone={getSeverityTone(notification.severity)}>
                      {notification.severity === 'urgent' ? 'Urgent' : notification.severity === 'warning' ? 'Warning' : 'Info'}
                    </StatusBadge>
                    <span>{formatNotificationTime(notification.created_at)}</span>
                    {isUnread ? <span className="notification-unread-dot">Unread</span> : <span>Read</span>}
                  </div>
                  <h2>{notification.title || 'Notification'}</h2>
                  {notification.body ? <p>{notification.body}</p> : null}
                </div>
                <div className="notification-row-actions">
                  {relatedActionLabel ? (
                    <button
                      className="secondary-inline-button"
                      onClick={() => handleOpenRelated(notification)}
                      type="button"
                    >
                      {relatedActionLabel}
                    </button>
                  ) : null}
                  {isUnread ? (
                    <button
                      className="secondary-inline-button"
                      disabled={isMarkingThisRead}
                      onClick={() => handleMarkRead(notification)}
                      type="button"
                    >
                      {isMarkingThisRead ? 'Marking...' : 'Mark Read'}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No notifications yet"
          description="Inspection review alerts will appear here when a driver flags something that needs manager attention."
        />
      )}
    </section>
  );
}
