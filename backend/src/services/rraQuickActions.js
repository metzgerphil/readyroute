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

async function loadDriverQuickActions(supabase, accountId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('rra_cxpc_phone_number, rra_primary_manager_name, rra_primary_manager_phone_number')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw error;
  return {
    cxpc: { phone: normalizePhone(data?.rra_cxpc_phone_number) },
    manager: {
      name: String(data?.rra_primary_manager_name || 'Manager').trim() || 'Manager',
      phone: normalizePhone(data?.rra_primary_manager_phone_number)
    }
  };
}

module.exports = { loadDriverQuickActions, loadRraReferenceCodes, normalizePhone, presentReferenceCode };
