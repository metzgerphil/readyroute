const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');

try {
  require('dotenv').config();
} catch (_error) {
  // Environment variables are supplied directly in CI and provisioning shells.
}

const SMOKE_COMPANY_NAME = 'Smoke Test ReadyRoute Account';

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assertSmokeManagerEmail(email) {
  if (!/^production-smoke@readyroute\.test$/i.test(String(email || '').trim())) {
    throw new Error('Refusing to provision a manager outside the dedicated ReadyRoute smoke identity');
  }
}

async function provisionProductionSmokeManager() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_KEY');
  const email = requireEnv('SMOKE_MANAGER_EMAIL').toLowerCase();
  const password = requireEnv('SMOKE_MANAGER_PASSWORD');

  assertSmokeManagerEmail(email);
  if (password.length < 24) {
    throw new Error('SMOKE_MANAGER_PASSWORD must be at least 24 characters');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const passwordHash = await bcrypt.hash(password, 12);

  const { data: existingAccount, error: accountLookupError } = await supabase
    .from('accounts')
    .select('id, company_name')
    .eq('company_name', SMOKE_COMPANY_NAME)
    .maybeSingle();

  if (accountLookupError) {
    throw accountLookupError;
  }

  let accountId = existingAccount?.id || null;
  if (!accountId) {
    const { data: createdAccount, error: accountCreateError } = await supabase
      .from('accounts')
      .insert({
        company_name: SMOKE_COMPANY_NAME,
        plan: 'starter',
        subscription_status: 'smoke_test',
        account_status: 'active',
        driver_starter_pin: '1234',
        operations_timezone: 'America/Los_Angeles'
      })
      .select('id')
      .single();

    if (accountCreateError) {
      throw accountCreateError;
    }
    accountId = createdAccount.id;
  } else {
    const { error: accountUpdateError } = await supabase
      .from('accounts')
      .update({
        plan: 'starter',
        subscription_status: 'smoke_test',
        account_status: 'active',
        cancellation_requested_at: null,
        service_ends_at: null,
        retention_ends_at: null,
        canceled_at: null
      })
      .eq('id', accountId);

    if (accountUpdateError) {
      throw accountUpdateError;
    }
  }

  const { data: existingManager, error: managerLookupError } = await supabase
    .from('manager_users')
    .select('id')
    .eq('account_id', accountId)
    .ilike('email', email)
    .maybeSingle();

  if (managerLookupError) {
    throw managerLookupError;
  }

  const managerPayload = {
    account_id: accountId,
    email,
    full_name: 'ReadyRoute Production Smoke',
    password_hash: passwordHash,
    is_active: true,
    invited_at: new Date().toISOString(),
    accepted_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  let managerId = existingManager?.id || null;
  if (managerId) {
    const { error: managerUpdateError } = await supabase
      .from('manager_users')
      .update(managerPayload)
      .eq('id', managerId)
      .eq('account_id', accountId);

    if (managerUpdateError) {
      throw managerUpdateError;
    }
  } else {
    const { data: createdManager, error: managerCreateError } = await supabase
      .from('manager_users')
      .insert(managerPayload)
      .select('id')
      .single();

    if (managerCreateError) {
      throw managerCreateError;
    }
    managerId = createdManager.id;
  }

  console.log(JSON.stringify({
    provisioned: true,
    company_name: SMOKE_COMPANY_NAME,
    account_id: accountId,
    manager_id: managerId,
    email
  }));
}

if (require.main === module) {
  provisionProductionSmokeManager().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  assertSmokeManagerEmail,
  provisionProductionSmokeManager,
  SMOKE_COMPANY_NAME
};
