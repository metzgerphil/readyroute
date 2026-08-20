const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');

const STAGING_PROJECT_REF = 'xtzbjlmizmdfqelvhhwx';
const STAGING_COMPANY_NAME = 'Smoke Test ReadyRoute Account';

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function setStagingDriverTemporaryPassword() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_KEY');
  const temporaryPassword = requireEnv('STAGING_DRIVER_TEMPORARY_PASSWORD');
  const targetEmails = requireEnv('STAGING_DRIVER_EMAILS')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!supabaseUrl.includes(`${STAGING_PROJECT_REF}.supabase.co`)) {
    throw new Error('Refusing to update driver passwords outside ReadyRoute staging');
  }
  if (temporaryPassword.length < 10) {
    throw new Error('The staging driver temporary password must be at least 10 characters');
  }
  if (targetEmails.length === 0 || new Set(targetEmails).size !== targetEmails.length) {
    throw new Error('Provide one or more unique staging driver emails');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('id')
    .eq('company_name', STAGING_COMPANY_NAME)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account) throw new Error('The staging smoke-test account was not found');

  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const acceptedAt = new Date().toISOString();

  for (const email of targetEmails) {
    const { data: matches, error: lookupError } = await supabase
      .from('drivers')
      .select('id, email')
      .eq('account_id', account.id)
      .ilike('email', email);
    if (lookupError) throw lookupError;
    if ((matches || []).length !== 1) {
      throw new Error('A requested staging driver was not found exactly once');
    }

    const { error: updateError } = await supabase
      .from('drivers')
      .update({
        password_hash: passwordHash,
        invite_accepted_at: acceptedAt,
        is_active: true
      })
      .eq('id', matches[0].id)
      .eq('account_id', account.id);
    if (updateError) throw updateError;

    const { data: verified, error: verificationError } = await supabase
      .from('drivers')
      .select('password_hash, is_active')
      .eq('id', matches[0].id)
      .eq('account_id', account.id)
      .maybeSingle();
    if (verificationError) throw verificationError;
    if (!verified || verified.is_active !== true || !await bcrypt.compare(temporaryPassword, verified.password_hash)) {
      throw new Error('A staging driver temporary password could not be verified');
    }
  }

  console.log(JSON.stringify({ updated_and_verified: targetEmails.length }));
}

if (require.main === module) {
  setStagingDriverTemporaryPassword().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { setStagingDriverTemporaryPassword };
