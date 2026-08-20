const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const STAGING_PROJECT_REF = 'xtzbjlmizmdfqelvhhwx';
const STAGING_COMPANY_NAME = 'Smoke Test ReadyRoute Account';
const STAGING_AUTOMATION_EMAIL = 'rra-staging-automation@readyroute.test';
const STAGING_DRIVER_INVITE_REQUEST_PATH = path.resolve(process.cwd(), '.staging-driver-invite-request.json');

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Staging request failed with status ${response.status}`);
  }
  return body;
}

async function fulfillStagingDriverInviteRequest({ email, password, supabase, accountId }) {
  if (!fs.existsSync(STAGING_DRIVER_INVITE_REQUEST_PATH)) return null;

  const backendUrl = requireEnv('STAGING_BACKEND_URL').replace(/\/$/, '');
  const request = JSON.parse(fs.readFileSync(STAGING_DRIVER_INVITE_REQUEST_PATH, 'utf8'));
  const requestedEmails = Array.isArray(request.driver_emails)
    ? request.driver_emails.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (requestedEmails.length === 0) {
    throw new Error('The staging driver invitation request does not contain any email addresses');
  }

  const login = await requestJson(`${backendUrl}/auth/manager/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!login.token) throw new Error('Staging manager login did not return a token');
  const authenticatedHeaders = { Authorization: `Bearer ${login.token}` };

  for (const requestedEmail of requestedEmails) {
    let drivers = await requestJson(`${backendUrl}/manager/drivers`, {
      headers: authenticatedHeaders
    });
    const matches = (drivers.drivers || []).filter(
      (driver) => String(driver.email || '').trim().toLowerCase() === requestedEmail
    );
    if (matches.length !== 1) {
      throw new Error('A requested staging driver was not found exactly once');
    }
    const driver = matches[0];

    if (driver.is_active !== true) {
      await requestJson(`${backendUrl}/manager/drivers/${driver.id}/status`, {
        method: 'PATCH',
        headers: { ...authenticatedHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true })
      });
    }

    const invitation = await requestJson(`${backendUrl}/manager/drivers/${driver.id}/invite`, {
      method: 'POST',
      headers: authenticatedHeaders
    });
    if (invitation.email_delivery !== 'sent') {
      throw new Error('The ReadyRoute email provider did not accept a requested driver invitation');
    }

    const { data: verifiedDriver, error: verificationError } = await supabase
      .from('drivers')
      .select('id, is_active, invited_at')
      .eq('id', driver.id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (verificationError) throw verificationError;
    if (!verifiedDriver || verifiedDriver.is_active !== true || !verifiedDriver.invited_at) {
      throw new Error('A staging driver invitation could not be verified after delivery');
    }
  }

  return { activated_and_invited: requestedEmails.length };
}

async function provisionStagingManager() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_KEY');
  // This identity is intentionally fixed and non-human. Staging releases rotate
  // its password on every run, so accepting a configured manager email here
  // could silently invalidate a real tester's password.
  const email = STAGING_AUTOMATION_EMAIL;
  const bootstrapPassword = String(process.env.STAGING_MANAGER_BOOTSTRAP_PASSWORD || '');

  if (!supabaseUrl.includes(`${STAGING_PROJECT_REF}.supabase.co`)) {
    throw new Error('Refusing to provision a manager outside the ReadyRoute staging project');
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('STAGING_MANAGER_BOOTSTRAP_EMAIL must be a valid email address');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: existingAccount, error: accountError } = await supabase
    .from('accounts')
    .select('id, company_name')
    .eq('company_name', STAGING_COMPANY_NAME)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accountError) {
    throw accountError;
  }
  let account = existingAccount;
  if (!account) {
    const { data: createdAccount, error: createAccountError } = await supabase
      .from('accounts')
      .insert({
        company_name: STAGING_COMPANY_NAME,
        plan: 'starter',
        subscription_status: 'smoke_test',
        account_status: 'active',
        driver_starter_pin: '1234',
        operations_timezone: 'America/Los_Angeles'
      })
      .select('id, company_name')
      .single();
    if (createAccountError) throw createAccountError;
    account = createdAccount;
  }

  const { data: existingManager, error: lookupError } = await supabase
    .from('manager_users')
    .select('id, password_hash, is_active')
    .eq('account_id', account.id)
    .ilike('email', email)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  const now = new Date().toISOString();
  if (bootstrapPassword && bootstrapPassword.length < 16) {
    throw new Error('STAGING_MANAGER_BOOTSTRAP_PASSWORD must be at least 16 characters');
  }

  const passwordHash = bootstrapPassword
    ? await bcrypt.hash(bootstrapPassword, 12)
    : existingManager?.password_hash || await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  const managerPayload = {
    account_id: account.id,
    email,
    full_name: 'ReadyRoute Manager',
    password_hash: passwordHash,
    is_active: true,
    invited_at: now,
    accepted_at: existingManager?.password_hash ? undefined : now,
    updated_at: now
  };

  Object.keys(managerPayload).forEach((key) => managerPayload[key] === undefined && delete managerPayload[key]);

  let managerId = existingManager?.id || null;
  if (managerId) {
    const { error: updateError } = await supabase
      .from('manager_users')
      .update(managerPayload)
      .eq('id', managerId)
      .eq('account_id', account.id);
    if (updateError) throw updateError;
  } else {
    const { data: createdManager, error: insertError } = await supabase
      .from('manager_users')
      .insert(managerPayload)
      .select('id')
      .single();
    if (insertError) throw insertError;
    managerId = createdManager.id;
  }

  const driverInviteResult = await fulfillStagingDriverInviteRequest({
    email,
    password: bootstrapPassword,
    supabase,
    accountId: account.id
  });

  console.log(JSON.stringify({
    provisioned: true,
    created: !existingManager,
    account_id: account.id,
    manager_id: managerId,
    email,
    ...(driverInviteResult || {})
  }));
}

if (require.main === module) {
  provisionStagingManager().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  provisionStagingManager,
  STAGING_AUTOMATION_EMAIL,
  STAGING_COMPANY_NAME,
  STAGING_PROJECT_REF,
  fulfillStagingDriverInviteRequest
};
