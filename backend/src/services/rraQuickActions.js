function presentReferenceCode(record) {
  const [namespace, code] = String(record.knowledge_id || '').split(':');
  const type = namespace === 'PICKUP_REASON' ? 'pickup' : 'delivery';
  const situation = String(record.canonical_situation || '');
  const label = situation.includes(' — ')
    ? situation.split(' — ').slice(1).join(' — ').trim()
    : situation.replace(/^\s*(?:delivery status|pickup reason)\s+\S+\s*/i, '').trim();
  return { code: String(code || ''), label, type };
}

async function loadRraReferenceCodes(supabase) {
  const { data, error } = await supabase
    .from('driver_help_knowledge_records')
    .select('knowledge_id, status, is_published, canonical_situation')
    .eq('is_published', true)
    .eq('status', 'SOURCE_VERIFIED');
  if (error) throw error;

  const records = (data || [])
    .filter((record) => /^(?:DELIVERY_STATUS|PICKUP_REASON):/.test(String(record.knowledge_id || '')))
    .map(presentReferenceCode)
    .filter((record) => record.code && record.label)
    .sort((left, right) => Number(left.code) - Number(right.code));
  return {
    delivery: records.filter((record) => record.type === 'delivery'),
    pickup: records.filter((record) => record.type === 'pickup')
  };
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const hasLeadingPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return hasLeadingPlus ? `+${digits}` : digits;
}

function getIsoWeekday(now = new Date(), timeZone = 'America/Los_Angeles') {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 })[weekday];
}

async function loadDriverQuickActions(supabase, accountId, now = new Date()) {
  const { data: account, error } = await supabase
    .from('accounts')
    .select('operations_timezone, rra_cxpc_phone_number, rra_primary_manager_name, rra_primary_manager_phone_number')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw error;

  const operationsTimezone = account?.operations_timezone || 'America/Los_Angeles';
  const { data: scheduled, error: scheduleError } = await supabase
    .from('rra_manager_weekly_schedule')
    .select('manager_user_id')
    .eq('account_id', accountId)
    .eq('iso_weekday', getIsoWeekday(now, operationsTimezone))
    .maybeSingle();
  if (scheduleError) throw scheduleError;

  let scheduledManager = null;
  if (scheduled?.manager_user_id) {
    const { data, error: managerError } = await supabase
      .from('manager_users')
      .select('full_name, phone')
      .eq('id', scheduled.manager_user_id)
      .eq('account_id', accountId)
      .eq('is_active', true)
      .maybeSingle();
    if (managerError) throw managerError;
    if (data && normalizePhone(data.phone)) scheduledManager = data;
  }

  return {
    cxpc: { phone: normalizePhone(account?.rra_cxpc_phone_number) },
    manager: {
      name: String(scheduledManager?.full_name || account?.rra_primary_manager_name || 'Manager').trim() || 'Manager',
      phone: normalizePhone(scheduledManager?.phone || account?.rra_primary_manager_phone_number)
    }
  };
}

module.exports = { getIsoWeekday, loadDriverQuickActions, loadRraReferenceCodes, normalizePhone, presentReferenceCode };
