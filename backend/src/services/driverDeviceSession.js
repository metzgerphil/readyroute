const crypto = require('crypto');

function hashDeviceId(deviceId) {
  return crypto.createHash('sha256').update(String(deviceId || '')).digest('hex');
}

function normalizeDeviceId(deviceId) {
  const value = String(deviceId || '').trim();
  return /^[A-Za-z0-9._:-]{16,200}$/.test(value) ? value : null;
}

async function authorizeDriverDevice(supabase, { driverId, accountId, deviceId, deviceName = null, now = new Date() }) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  if (!normalizedDeviceId) return null;

  const authorizedAt = now.toISOString();
  const deviceHash = hashDeviceId(normalizedDeviceId);
  const { error: revokeError } = await supabase
    .from('driver_authorized_devices')
    .update({ revoked_at: authorizedAt, updated_at: authorizedAt })
    .eq('driver_id', driverId)
    .is('revoked_at', null)
    .neq('device_hash', deviceHash);
  if (revokeError) throw revokeError;

  const { data, error } = await supabase
    .from('driver_authorized_devices')
    .upsert({
      account_id: accountId,
      driver_id: driverId,
      device_hash: deviceHash,
      device_name: String(deviceName || '').trim().slice(0, 120) || null,
      authorized_at: authorizedAt,
      last_authenticated_at: authorizedAt,
      revoked_at: null,
      updated_at: authorizedAt
    }, { onConflict: 'driver_id,device_hash' })
    .select('id, device_hash')
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  authorizeDriverDevice,
  hashDeviceId,
  normalizeDeviceId
};
