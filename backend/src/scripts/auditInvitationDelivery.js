const { createClient } = require('@supabase/supabase-js');

function requireEnvironment(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function maskEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  return `${local.slice(0, 2)}***@${domain}`;
}

function safeRecord(type, row) {
  return {
    type,
    id: row.id,
    name: row.full_name || row.name || null,
    email: maskEmail(row.email),
    status: row.status || (row.is_active === false ? 'inactive' : row.accepted_at || row.invite_accepted_at || row.password_hash ? 'active' : 'pending'),
    invited_at: row.invited_at || row.created_at || null,
    accepted_at: row.accepted_at || row.invite_accepted_at || null,
    updated_at: row.updated_at || null,
    email_provider_accepted: Boolean(row.email_provider_id)
  };
}

async function auditInvitationDelivery({ supabase, search }) {
  const term = String(search || '').trim().replace(/[,%()]/g, '');
  if (term.length < 2) throw new Error('INVITE_SEARCH must contain at least two safe characters.');
  const pattern = `%${term}%`;
  const [staffResult, managerResult, driverResult] = await Promise.all([
    supabase.from('readyroute_staff_invites')
      .select('id, email, full_name, role, status, email_provider_id, expires_at, created_at, updated_at, accepted_at')
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`),
    supabase.from('manager_users')
      .select('id, email, full_name, is_active, invited_at, accepted_at, created_at, updated_at, password_hash')
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`),
    supabase.from('drivers')
      .select('id, email, name, is_active, invited_at, invite_accepted_at, created_at, updated_at, password_hash')
      .or(`name.ilike.${pattern},email.ilike.${pattern}`)
  ]);
  const firstError = [staffResult, managerResult, driverResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;
  return [
    ...(staffResult.data || []).map((row) => safeRecord('staff_invite', row)),
    ...(managerResult.data || []).map((row) => safeRecord('manager', row)),
    ...(driverResult.data || []).map((row) => safeRecord('driver', row))
  ];
}

async function main() {
  const supabase = createClient(
    requireEnvironment('SUPABASE_URL'),
    requireEnvironment('SUPABASE_SERVICE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const records = await auditInvitationDelivery({ supabase, search: requireEnvironment('INVITE_SEARCH') });
  console.log(JSON.stringify({ match_count: records.length, records }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Invitation audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { auditInvitationDelivery, maskEmail, safeRecord };
