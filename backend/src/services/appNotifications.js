const NOTIFICATION_TABLE = 'app_notifications';
const DEVICE_TOKEN_TABLE = 'app_notification_device_tokens';
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_CHUNK_SIZE = 100;

const NOTIFICATION_TYPES = {
  DRIVER_ROUTE_INSPECTION_ASSIGNED: 'driver_route_inspection_assigned',
  DRIVER_MANUAL_INSPECTION_ASSIGNED: 'driver_manual_inspection_assigned',
  MANAGER_INSPECTION_URGENT_REVIEW: 'manager_inspection_urgent_review'
};

const NOTIFICATION_SEVERITIES = new Set(['info', 'warning', 'urgent']);
const PUSH_PLATFORMS = new Set(['ios', 'android', 'web', 'unknown']);

function isMissingNotificationTableError(error) {
  return ['42P01', 'PGRST106', 'PGRST205'].includes(error?.code);
}

function normalizeLimit(value, fallback = 50) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), 100);
}

function isExpoPushToken(value) {
  return /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(String(value || '').trim());
}

function normalizeDeviceTokenPayload(payload = {}) {
  const platform = PUSH_PLATFORMS.has(payload.platform) ? payload.platform : 'unknown';

  return {
    account_id: payload.account_id,
    recipient_type: payload.recipient_type,
    driver_id: payload.driver_id || null,
    manager_user_id: payload.manager_user_id || null,
    expo_push_token: String(payload.expo_push_token || '').trim(),
    platform,
    device_id: payload.device_id ? String(payload.device_id).trim().slice(0, 180) : null,
    app_version: payload.app_version ? String(payload.app_version).trim().slice(0, 80) : null,
    device_name: payload.device_name ? String(payload.device_name).trim().slice(0, 180) : null,
    status: 'active',
    disabled_at: null,
    last_registered_at: payload.registered_at || new Date().toISOString(),
    updated_at: payload.updated_at || new Date().toISOString()
  };
}

function validateDeviceTokenPayload(payload) {
  if (!payload.account_id) {
    return 'account_id is required';
  }

  if (!['driver', 'manager'].includes(payload.recipient_type)) {
    return 'recipient_type must be driver or manager';
  }

  if (payload.recipient_type === 'driver' && !payload.driver_id) {
    return 'driver_id is required for driver device tokens';
  }

  if (payload.recipient_type === 'manager' && !payload.manager_user_id) {
    return 'manager_user_id is required for manager device tokens';
  }

  if (!isExpoPushToken(payload.expo_push_token)) {
    return 'expo_push_token must be a valid Expo push token';
  }

  return null;
}

function normalizeNotificationPayload(payload = {}) {
  const severity = NOTIFICATION_SEVERITIES.has(payload.severity) ? payload.severity : 'info';

  return {
    account_id: payload.account_id,
    recipient_type: payload.recipient_type,
    driver_id: payload.driver_id || null,
    manager_user_id: payload.manager_user_id || null,
    notification_type: payload.notification_type,
    title: String(payload.title || '').trim(),
    body: String(payload.body || '').trim(),
    severity,
    link_type: payload.link_type || null,
    link_ref: payload.link_ref || {},
    metadata: payload.metadata || {},
    status: payload.status || 'unread',
    created_at: payload.created_at || new Date().toISOString()
  };
}

function validateNotificationPayload(payload) {
  if (!payload.account_id) {
    return 'account_id is required';
  }

  if (!['driver', 'manager'].includes(payload.recipient_type)) {
    return 'recipient_type must be driver or manager';
  }

  if (payload.recipient_type === 'driver' && !payload.driver_id) {
    return 'driver_id is required for driver notifications';
  }

  if (!payload.notification_type) {
    return 'notification_type is required';
  }

  if (!payload.title) {
    return 'title is required';
  }

  return null;
}

function presentNotification(row = {}) {
  return {
    id: row.id,
    account_id: row.account_id,
    recipient_type: row.recipient_type,
    driver_id: row.driver_id || null,
    manager_user_id: row.manager_user_id || null,
    notification_type: row.notification_type,
    title: row.title,
    body: row.body || '',
    severity: row.severity || 'info',
    link_type: row.link_type || null,
    link_ref: row.link_ref || {},
    metadata: row.metadata || {},
    status: row.status || 'unread',
    read_at: row.read_at || null,
    created_at: row.created_at || null
  };
}

function presentDeviceToken(row = {}) {
  return {
    id: row.id,
    account_id: row.account_id,
    recipient_type: row.recipient_type,
    driver_id: row.driver_id || null,
    manager_user_id: row.manager_user_id || null,
    expo_push_token: row.expo_push_token,
    platform: row.platform || 'unknown',
    device_id: row.device_id || null,
    app_version: row.app_version || null,
    device_name: row.device_name || null,
    status: row.status || 'active',
    last_registered_at: row.last_registered_at || null,
    disabled_at: row.disabled_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

async function createAppNotification(supabase, payload) {
  const normalized = normalizeNotificationPayload(payload);
  const validationError = validateNotificationPayload(normalized);

  if (validationError) {
    return { notification: null, error: { message: validationError } };
  }

  const { data, error } = await supabase
    .from(NOTIFICATION_TABLE)
    .insert(normalized)
    .select('*')
    .single();

  if (error) {
    return { notification: null, error };
  }

  return { notification: presentNotification(data || normalized), error: null };
}

function shouldSendPushNotifications(options = {}) {
  if (typeof options.pushEnabled === 'boolean') {
    return options.pushEnabled;
  }

  return String(process.env.READYROUTE_PUSH_NOTIFICATIONS || '').trim().toLowerCase() === 'true';
}

function getPushFetch(options = {}) {
  return options.fetchImpl || globalThis.fetch;
}

function buildExpoPushMessages(notification, tokens = []) {
  return tokens
    .filter((token) => isExpoPushToken(token))
    .map((token) => ({
      to: token,
      sound: 'default',
      priority: notification.severity === 'urgent' ? 'high' : 'default',
      title: notification.title,
      body: notification.body || '',
      data: {
        notification_id: notification.id,
        notification_type: notification.notification_type,
        recipient_type: notification.recipient_type,
        severity: notification.severity,
        link_type: notification.link_type,
        link_ref: notification.link_ref || {}
      }
    }));
}

function chunkArray(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function sendExpoPushMessages(messages, options = {}) {
  if (!messages.length) {
    return { sent: 0, responses: [], error: null };
  }

  const fetchImpl = getPushFetch(options);

  if (typeof fetchImpl !== 'function') {
    return { sent: 0, responses: [], error: { message: 'fetch is unavailable' } };
  }

  const responses = [];
  let sent = 0;

  for (const chunk of chunkArray(messages, EXPO_PUSH_CHUNK_SIZE)) {
    const response = await fetchImpl(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(chunk)
    });

    let responseBody = null;

    try {
      responseBody = await response.json();
    } catch (_error) {
      responseBody = null;
    }

    responses.push({
      ok: response.ok,
      status: response.status,
      body: responseBody
    });

    if (!response.ok) {
      return {
        sent,
        responses,
        error: { message: `Expo push request failed with status ${response.status}` }
      };
    }

    sent += chunk.length;
  }

  return { sent, responses, error: null };
}

async function registerNotificationDeviceToken(supabase, payload) {
  const normalized = normalizeDeviceTokenPayload(payload);
  const validationError = validateDeviceTokenPayload(normalized);

  if (validationError) {
    return { deviceToken: null, error: { message: validationError } };
  }

  let existingQuery = supabase
    .from(DEVICE_TOKEN_TABLE)
    .select('*')
    .eq('account_id', normalized.account_id)
    .eq('recipient_type', normalized.recipient_type)
    .eq('expo_push_token', normalized.expo_push_token);

  if (normalized.recipient_type === 'driver') {
    existingQuery = existingQuery.eq('driver_id', normalized.driver_id);
  } else {
    existingQuery = existingQuery.eq('manager_user_id', normalized.manager_user_id);
  }

  const { data: existingToken, error: lookupError } = await existingQuery.maybeSingle();

  if (lookupError) {
    if (isMissingNotificationTableError(lookupError)) {
      return { deviceToken: null, error: null };
    }

    return { deviceToken: null, error: lookupError };
  }

  if (existingToken?.id) {
    const { data, error } = await supabase
      .from(DEVICE_TOKEN_TABLE)
      .update({
        ...normalized,
        updated_at: normalized.updated_at || new Date().toISOString()
      })
      .eq('id', existingToken.id)
      .select('*')
      .single();

    if (error) {
      if (isMissingNotificationTableError(error)) {
        return { deviceToken: null, error: null };
      }

      return { deviceToken: null, error };
    }

    return { deviceToken: presentDeviceToken(data || { ...existingToken, ...normalized }), error: null };
  }

  const { data, error } = await supabase
    .from(DEVICE_TOKEN_TABLE)
    .insert(normalized)
    .select('*')
    .single();

  if (error) {
    if (isMissingNotificationTableError(error)) {
      return { deviceToken: null, error: null };
    }

    return { deviceToken: null, error };
  }

  return { deviceToken: presentDeviceToken(data || normalized), error: null };
}

async function listNotificationDeviceTokens(supabase, notification) {
  let query = supabase
    .from(DEVICE_TOKEN_TABLE)
    .select('*')
    .eq('account_id', notification.account_id)
    .eq('recipient_type', notification.recipient_type)
    .eq('status', 'active');

  if (notification.recipient_type === 'driver') {
    query = query.eq('driver_id', notification.driver_id);
  }

  if (notification.recipient_type === 'manager' && notification.manager_user_id) {
    query = query.eq('manager_user_id', notification.manager_user_id);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingNotificationTableError(error)) {
      return { deviceTokens: [], error: null };
    }

    return { deviceTokens: [], error };
  }

  return { deviceTokens: (data || []).map(presentDeviceToken), error: null };
}

async function sendPushForNotification(supabase, notification, options = {}) {
  if (!notification?.id || !shouldSendPushNotifications(options)) {
    return { sent: 0, error: null };
  }

  const { deviceTokens, error: tokenError } = await listNotificationDeviceTokens(supabase, notification);

  if (tokenError) {
    return { sent: 0, error: tokenError };
  }

  const messages = buildExpoPushMessages(
    notification,
    deviceTokens.map((deviceToken) => deviceToken.expo_push_token)
  );
  return sendExpoPushMessages(messages, options);
}

async function safelySendPushForNotification(supabase, notification, options = {}, logContext = 'notification push') {
  try {
    const result = await sendPushForNotification(supabase, notification, options);

    if (result.error) {
      console.error(`App notification push failed (${logContext}):`, result.error);
    }

    return result;
  } catch (error) {
    console.error(`App notification push failed (${logContext}):`, error);
    return { sent: 0, error };
  }
}

async function safelyCreateAppNotification(supabase, payload, logContext = 'notification', options = {}) {
  try {
    const result = await createAppNotification(supabase, payload);

    if (result.error && !isMissingNotificationTableError(result.error)) {
      console.error(`App notification write failed (${logContext}):`, result.error);
    }

    if (result.notification) {
      await safelySendPushForNotification(supabase, result.notification, options, logContext);
    }

    return result;
  } catch (error) {
    console.error(`App notification write failed (${logContext}):`, error);
    return { notification: null, error };
  }
}

async function notifyDriverRouteInspectionAssigned(supabase, {
  accountId,
  driverId,
  route,
  vehicle,
  pushOptions
}) {
  if (!driverId || !route?.id) {
    return { notification: null, error: null };
  }

  const routeLabel = route.work_area_name ? `Route ${route.work_area_name}` : 'Your route';
  const vehicleLabel = vehicle?.name || route.vehicle_name || route.vehicle_id || vehicle?.id || 'your assigned vehicle';

  return safelyCreateAppNotification(supabase, {
    account_id: accountId,
    recipient_type: 'driver',
    driver_id: driverId,
    notification_type: NOTIFICATION_TYPES.DRIVER_ROUTE_INSPECTION_ASSIGNED,
    title: 'Vehicle inspection upcoming',
    body: `${routeLabel} is assigned. Complete the inspection for ${vehicleLabel} before starting.`,
    severity: 'info',
    link_type: 'route_inspection',
    link_ref: {
      route_id: route.id,
      vehicle_id: route.vehicle_id || vehicle?.id || null,
      date: route.date || null
    },
    metadata: {
      work_area_name: route.work_area_name || null
    }
  }, 'driver route inspection assigned', pushOptions);
}

async function notifyDriverManualInspectionAssigned(supabase, {
  accountId,
  driverId,
  assignment,
  vehicle,
  managerName,
  pushOptions
}) {
  if (!driverId || !assignment?.id) {
    return { notification: null, error: null };
  }

  const vehicleLabel = vehicle?.name || assignment.vehicle_id || 'your assigned vehicle';
  const dueLabel = assignment.due_date ? ` Due ${assignment.due_date}.` : '';
  const managerLabel = managerName ? `${managerName} assigned` : 'Your manager assigned';

  return safelyCreateAppNotification(supabase, {
    account_id: accountId,
    recipient_type: 'driver',
    driver_id: driverId,
    notification_type: NOTIFICATION_TYPES.DRIVER_MANUAL_INSPECTION_ASSIGNED,
    title: assignment.priority === 'urgent' ? 'Urgent vehicle inspection assigned' : 'Vehicle inspection assigned',
    body: `${managerLabel} an inspection for ${vehicleLabel}.${dueLabel}`,
    severity: assignment.priority === 'urgent' ? 'warning' : 'info',
    link_type: 'vehicle_inspection_assignment',
    link_ref: {
      assignment_id: assignment.id,
      vehicle_id: assignment.vehicle_id || vehicle?.id || null,
      due_date: assignment.due_date || null
    },
    metadata: {
      priority: assignment.priority || 'normal',
      require_before_route_start: Boolean(assignment.require_before_route_start)
    }
  }, 'driver manual inspection assigned', pushOptions);
}

async function notifyManagersInspectionUrgentReview(supabase, {
  accountId,
  inspection,
  vehicle,
  driverName,
  route,
  pushOptions
}) {
  if (!inspection?.id) {
    return { notification: null, error: null };
  }

  const vehicleLabel = vehicle?.name || inspection.vehicle_name || inspection.vehicle_id || 'Vehicle';
  const driverLabel = driverName || inspection.submitted_by_name || 'Driver';

  return safelyCreateAppNotification(supabase, {
    account_id: accountId,
    recipient_type: 'manager',
    notification_type: NOTIFICATION_TYPES.MANAGER_INSPECTION_URGENT_REVIEW,
    title: 'Urgent vehicle inspection review',
    body: `${driverLabel} marked ${vehicleLabel} unsafe. Review the inspection before dispatch decisions continue.`,
    severity: 'urgent',
    link_type: 'vehicle_inspection',
    link_ref: {
      inspection_id: inspection.id,
      vehicle_id: inspection.vehicle_id || vehicle?.id || null,
      route_id: inspection.route_id || route?.id || null
    },
    metadata: {
      issue_count: inspection.issue_count ?? inspection.inspection_summary?.issue_count ?? null,
      highest_severity: inspection.highest_severity ?? inspection.inspection_summary?.highest_severity ?? 'unsafe'
    }
  }, 'manager urgent inspection review', pushOptions);
}

async function listDriverNotifications(supabase, {
  accountId,
  driverId,
  limit
}) {
  const { data, error } = await supabase
    .from(NOTIFICATION_TABLE)
    .select('*')
    .eq('account_id', accountId)
    .eq('recipient_type', 'driver')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(normalizeLimit(limit));

  if (error) {
    if (isMissingNotificationTableError(error)) {
      return { notifications: [], error: null };
    }

    return { notifications: [], error };
  }

  return { notifications: (data || []).map(presentNotification), error: null };
}

async function listManagerNotifications(supabase, {
  accountId,
  managerUserId,
  limit
}) {
  const { data, error } = await supabase
    .from(NOTIFICATION_TABLE)
    .select('*')
    .eq('account_id', accountId)
    .eq('recipient_type', 'manager')
    .order('created_at', { ascending: false })
    .limit(normalizeLimit(limit));

  if (error) {
    if (isMissingNotificationTableError(error)) {
      return { notifications: [], error: null };
    }

    return { notifications: [], error };
  }

  const notifications = (data || [])
    .filter((row) => !row.manager_user_id || row.manager_user_id === managerUserId)
    .map(presentNotification);

  return { notifications, error: null };
}

async function markNotificationRead(supabase, {
  accountId,
  notificationId,
  recipientType,
  driverId,
  managerUserId,
  readAt = new Date().toISOString()
}) {
  if (recipientType === 'manager') {
    const { data: existingNotification, error: lookupError } = await supabase
      .from(NOTIFICATION_TABLE)
      .select('id, manager_user_id')
      .eq('id', notificationId)
      .eq('account_id', accountId)
      .eq('recipient_type', 'manager')
      .maybeSingle();

    if (lookupError) {
      if (isMissingNotificationTableError(lookupError)) {
        return { notification: null, error: null };
      }

      return { notification: null, error: lookupError };
    }

    if (!existingNotification || (existingNotification.manager_user_id && existingNotification.manager_user_id !== managerUserId)) {
      return { notification: null, error: null };
    }
  }

  let query = supabase
    .from(NOTIFICATION_TABLE)
    .update({
      status: 'read',
      read_at: readAt
    })
    .eq('id', notificationId)
    .eq('account_id', accountId)
    .eq('recipient_type', recipientType);

  if (recipientType === 'driver') {
    query = query.eq('driver_id', driverId);
  }

  const { data, error } = await query
    .select('*')
    .maybeSingle();

  if (error) {
    if (isMissingNotificationTableError(error)) {
      return { notification: null, error: null };
    }

    return { notification: null, error };
  }

  return { notification: data ? presentNotification(data) : null, error: null };
}

module.exports = {
  NOTIFICATION_TYPES,
  buildExpoPushMessages,
  createAppNotification,
  isExpoPushToken,
  listDriverNotifications,
  listManagerNotifications,
  listNotificationDeviceTokens,
  markNotificationRead,
  notifyDriverManualInspectionAssigned,
  notifyDriverRouteInspectionAssigned,
  notifyManagersInspectionUrgentReview,
  presentDeviceToken,
  presentNotification,
  registerNotificationDeviceToken,
  safelySendPushForNotification,
  sendExpoPushMessages,
  sendPushForNotification,
  safelyCreateAppNotification
};
