import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ManagerSectionLayout from '../components/ManagerSectionLayout';
import api from '../services/api';
import appTheme from '../theme/appTheme';
import { getApiErrorMessage } from '../utils/apiError';

const NOTIFICATION_CONFIG = {
  driver: {
    authMode: 'driver',
    emptyDescription: 'Route inspection reminders and driver alerts will appear here.',
    endpoint: '/routes/notifications',
    title: 'Notifications'
  },
  manager: {
    authMode: 'manager',
    emptyDescription: 'Inspection alerts and manager review items will appear here.',
    endpoint: '/manager/notifications',
    title: 'Notifications'
  }
};

const SEVERITY_LABELS = {
  info: 'Info',
  warning: 'Warning',
  urgent: 'Urgent'
};

export function getNotificationConfig(mode) {
  return NOTIFICATION_CONFIG[mode] || NOTIFICATION_CONFIG.driver;
}

export function formatNotificationTime(value) {
  if (!value) {
    return 'Time unavailable';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Time unavailable';
  }

  return date.toLocaleString([], {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  });
}

export function getNotificationDestination(notification, mode) {
  if (mode === 'manager' && notification?.link_type === 'vehicle_inspection') {
    return 'ManagerVehicles';
  }

  if (
    mode === 'driver'
    && ['route_inspection', 'vehicle_inspection_assignment'].includes(notification?.link_type)
  ) {
    return 'Home';
  }

  return null;
}

export function getNotificationNavigationParams(notification, mode) {
  if (mode === 'manager' && notification?.link_type === 'vehicle_inspection') {
    return {
      inspectionId: notification.link_ref?.inspection_id || null,
      vehicleId: notification.link_ref?.vehicle_id || null,
      notificationId: notification.id || null,
      source: 'notification'
    };
  }

  return undefined;
}

function getSeverityTone(severity) {
  if (severity === 'urgent') {
    return 'urgent';
  }

  if (severity === 'warning') {
    return 'warning';
  }

  return 'info';
}

function getRelatedActionLabel(notification, mode) {
  if (!getNotificationDestination(notification, mode)) {
    return null;
  }

  if (mode === 'driver' && notification?.link_type === 'route_inspection') {
    return 'Open route';
  }

  if (mode === 'manager' && notification?.link_type === 'vehicle_inspection') {
    return 'Open inspection';
  }

  return mode === 'manager' ? 'Open related' : 'Open inspection';
}

function normalizeNotifications(response) {
  const notifications = response?.data?.notifications;
  return Array.isArray(notifications) ? notifications : [];
}

function NotificationCard({
  isMarkingRead,
  mode,
  notification,
  onMarkRead,
  onOpenRelated
}) {
  const isUnread = notification.status !== 'read';
  const tone = getSeverityTone(notification.severity);
  const actionLabel = getRelatedActionLabel(notification, mode);

  return (
    <View style={[styles.notificationCard, isUnread ? styles.notificationCardUnread : null]}>
      <View style={styles.notificationHeader}>
        <View style={[styles.severityBadge, styles[`severityBadge${tone}`]]}>
          <Text style={[styles.severityBadgeText, styles[`severityBadgeText${tone}`]]}>
            {SEVERITY_LABELS[notification.severity] || 'Info'}
          </Text>
        </View>
        <Text style={styles.notificationTime}>{formatNotificationTime(notification.created_at)}</Text>
      </View>

      <Text style={styles.notificationTitle}>{notification.title || 'Notification'}</Text>
      {notification.body ? <Text style={styles.notificationBody}>{notification.body}</Text> : null}

      <View style={styles.notificationFooter}>
        <Text style={[styles.readStatus, isUnread ? styles.readStatusUnread : null]}>
          {isUnread ? 'Unread' : 'Read'}
        </Text>
        <View style={styles.notificationActions}>
          {actionLabel ? (
            <Pressable
              onPress={() => onOpenRelated(notification)}
              style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
            >
              <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
            </Pressable>
          ) : null}
          {isUnread ? (
            <Pressable
              disabled={isMarkingRead}
              onPress={() => onMarkRead(notification)}
              style={({ pressed }) => [
                styles.primaryButton,
                isMarkingRead ? styles.primaryButtonDisabled : null,
                pressed && !isMarkingRead ? styles.buttonPressed : null
              ]}
            >
              {isMarkingRead ? (
                <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Mark read</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function NotificationsBody({ mode, navigation }) {
  const config = getNotificationConfig(mode);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [markingReadId, setMarkingReadId] = useState(null);

  const loadNotifications = useCallback(async ({ refreshing = false } = {}) => {
    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setErrorMessage('');

    try {
      const response = await api.get(config.endpoint, {
        authMode: config.authMode
      });
      setNotifications(normalizeNotifications(response));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Unable to load notifications.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [config.authMode, config.endpoint]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  async function handleMarkRead(notification) {
    if (!notification?.id || notification.status === 'read' || markingReadId) {
      return;
    }

    setMarkingReadId(notification.id);
    setErrorMessage('');

    try {
      const response = await api.patch(`${config.endpoint}/${notification.id}/read`, {}, {
        authMode: config.authMode
      });
      const updatedNotification = response?.data?.notification || {
        ...notification,
        status: 'read',
        read_at: new Date().toISOString()
      };

      setNotifications((currentNotifications) => currentNotifications.map((currentNotification) => (
        currentNotification.id === notification.id ? updatedNotification : currentNotification
      )));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Unable to mark notification read.'));
    } finally {
      setMarkingReadId(null);
    }
  }

  async function handleOpenRelated(notification) {
    if (notification?.status !== 'read') {
      await handleMarkRead(notification);
    }

    const destination = getNotificationDestination(notification, mode);

    if (destination) {
      const params = getNotificationNavigationParams(notification, mode);
      if (params) {
        navigation?.navigate?.(destination, params);
      } else {
        navigation?.navigate?.(destination);
      }
    }
  }

  const unreadCount = notifications.filter((notification) => notification.status !== 'read').length;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadNotifications({ refreshing: true })} />}
      showsVerticalScrollIndicator={false}
      style={styles.scroll}
    >
      <View style={styles.summaryRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryValue}>{unreadCount}</Text>
          <Text style={styles.summaryLabel}>Unread</Text>
        </View>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryValue}>{notifications.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTitle}>Notifications unavailable</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable onPress={() => loadNotifications()} style={({ pressed }) => [styles.retryButton, pressed ? styles.buttonPressed : null]}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={appTheme.colors.orange} />
          <Text style={styles.loadingText}>Loading notifications</Text>
        </View>
      ) : notifications.length ? (
        <View style={styles.list}>
          {notifications.map((notification) => (
            <NotificationCard
              isMarkingRead={markingReadId === notification.id}
              key={notification.id}
              mode={mode}
              notification={notification}
              onMarkRead={handleMarkRead}
              onOpenRelated={handleOpenRelated}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyDescription}>{config.emptyDescription}</Text>
        </View>
      )}
    </ScrollView>
  );
}

export default function NotificationsScreen({ mode = 'driver', navigation }) {
  if (mode === 'manager') {
    return (
      <ManagerSectionLayout
        compact
        eyebrow="Manager Mobile"
        scrollEnabled={false}
        subtitle="Inspection alerts and review items"
        title="Notifications"
        tone="light"
      >
        <NotificationsBody mode="manager" navigation={navigation} />
      </ManagerSectionLayout>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.driverHeader}>
        <Text style={styles.driverEyebrow}>Driver Mobile</Text>
        <Text style={styles.driverTitle}>Notifications</Text>
        <Text style={styles.driverSubtitle}>Inspection reminders and route updates</Text>
      </View>
      <NotificationsBody mode="driver" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: appTheme.colors.surfaceTint,
    flex: 1
  },
  scroll: {
    flex: 1
  },
  driverHeader: {
    paddingHorizontal: appTheme.spacing.lg,
    paddingTop: appTheme.spacing.lg,
    paddingBottom: appTheme.spacing.sm
  },
  driverEyebrow: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.eyebrow,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xs,
    textTransform: 'uppercase'
  },
  driverTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleLarge,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.titleLarge
  },
  driverSubtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.body,
    marginTop: appTheme.spacing.xs
  },
  content: {
    gap: appTheme.spacing.md,
    paddingBottom: appTheme.spacing.xl,
    paddingHorizontal: appTheme.spacing.lg
  },
  summaryRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.sm
  },
  summaryPill: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flex: 1,
    minHeight: 72,
    padding: appTheme.spacing.md
  },
  summaryValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.titleMedium
  },
  summaryLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  errorBanner: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: appTheme.colors.danger,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  errorTitle: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.label,
    fontWeight: appTheme.typography.weights.heavy
  },
  errorText: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.danger,
    borderRadius: appTheme.buttons.radius,
    borderWidth: 1,
    marginTop: appTheme.spacing.xs,
    minHeight: appTheme.buttons.compactHeight,
    paddingHorizontal: appTheme.spacing.md,
    justifyContent: 'center'
  },
  retryButtonText: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'center',
    minHeight: 96,
    padding: appTheme.spacing.lg
  },
  loadingText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  list: {
    gap: appTheme.spacing.md
  },
  notificationCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.md,
    ...appTheme.shadows.card
  },
  notificationCardUnread: {
    borderColor: appTheme.colors.orangeBorder
  },
  notificationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'space-between'
  },
  severityBadge: {
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    minHeight: 28,
    paddingHorizontal: appTheme.spacing.sm,
    justifyContent: 'center'
  },
  severityBadgeinfo: {
    backgroundColor: appTheme.colors.infoSoft,
    borderColor: appTheme.colors.border
  },
  severityBadgewarning: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: appTheme.colors.warning
  },
  severityBadgeurgent: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: appTheme.colors.danger
  },
  severityBadgeText: {
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  severityBadgeTextinfo: {
    color: appTheme.colors.infoText
  },
  severityBadgeTextwarning: {
    color: appTheme.colors.warningText
  },
  severityBadgeTexturgent: {
    color: appTheme.colors.dangerText
  },
  notificationTime: {
    color: appTheme.colors.textTertiary,
    flexShrink: 1,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold,
    textAlign: 'right'
  },
  notificationTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.bodyLarge
  },
  notificationBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  notificationFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'space-between',
    marginTop: appTheme.spacing.xs
  },
  readStatus: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  readStatusUnread: {
    color: appTheme.colors.orangeDeep
  },
  notificationActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: appTheme.spacing.xs,
    justifyContent: 'flex-end'
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.buttons.radius,
    borderWidth: 1,
    minHeight: appTheme.buttons.compactHeight,
    paddingHorizontal: appTheme.spacing.md,
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.buttons.radius,
    minHeight: appTheme.buttons.compactHeight,
    minWidth: 94,
    paddingHorizontal: appTheme.spacing.md,
    justifyContent: 'center'
  },
  primaryButtonDisabled: {
    opacity: 0.72
  },
  primaryButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  buttonPressed: {
    opacity: 0.86
  },
  emptyCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.lg
  },
  emptyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  emptyDescription: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  }
});
