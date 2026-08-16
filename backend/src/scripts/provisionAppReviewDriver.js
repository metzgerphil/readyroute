const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

try {
  require('dotenv').config();
} catch (_error) {
  // Production provisioning supplies environment variables directly.
}

const APP_REVIEW_COMPANY_NAME = 'ReadyRoute App Review';
const APP_REVIEW_EMAIL = 'app-review-driver@readyroute.org';
const APP_REVIEW_USERNAME = 'apple-review';

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function assertAppReviewIdentity(email, username) {
  if (String(email || '').toLowerCase() !== APP_REVIEW_EMAIL || String(username || '').toLowerCase() !== APP_REVIEW_USERNAME) {
    throw new Error('Refusing to provision outside the dedicated ReadyRoute App Review identity');
  }
}

async function provisionAppReviewDriver() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_KEY');
  const password = requireEnv('APP_REVIEW_DRIVER_PASSWORD');
  assertAppReviewIdentity(APP_REVIEW_EMAIL, APP_REVIEW_USERNAME);
  if (password.length < 20) throw new Error('APP_REVIEW_DRIVER_PASSWORD must be at least 20 characters');

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const passwordHash = await bcrypt.hash(password, 12);

  const { data: existingAccount, error: accountLookupError } = await supabase
    .from('accounts')
    .select('id')
    .eq('company_name', APP_REVIEW_COMPANY_NAME)
    .maybeSingle();
  if (accountLookupError) throw accountLookupError;

  let accountId = existingAccount?.id || null;
  if (!accountId) {
    const { data, error } = await supabase
      .from('accounts')
      .insert({
        company_name: APP_REVIEW_COMPANY_NAME,
        plan: 'starter',
        subscription_status: 'app_review',
        account_status: 'active',
        driver_starter_pin: String(crypto.randomInt(1000, 10000)),
        operations_timezone: 'America/Los_Angeles'
      })
      .select('id')
      .single();
    if (error) throw error;
    accountId = data.id;
  } else {
    const { error } = await supabase
      .from('accounts')
      .update({
        plan: 'starter',
        subscription_status: 'app_review',
        account_status: 'active',
        cancellation_requested_at: null,
        service_ends_at: null,
        retention_ends_at: null,
        canceled_at: null
      })
      .eq('id', accountId);
    if (error) throw error;
  }

  const { data: existingDriver, error: driverLookupError } = await supabase
    .from('drivers')
    .select('id')
    .eq('email', APP_REVIEW_EMAIL)
    .maybeSingle();
  if (driverLookupError) throw driverLookupError;

  const driverPayload = {
    account_id: accountId,
    name: 'Apple App Review',
    email: APP_REVIEW_EMAIL,
    username: APP_REVIEW_USERNAME,
    password_hash: passwordHash,
    pin: passwordHash,
    is_active: true,
    invited_at: new Date().toISOString(),
    invite_accepted_at: new Date().toISOString()
  };

  let driverId = existingDriver?.id || null;
  if (driverId) {
    const { error } = await supabase.from('drivers').update(driverPayload).eq('id', driverId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('drivers').insert(driverPayload).select('id').single();
    if (error) throw error;
    driverId = data.id;
  }

  await supabase.from('driver_authorized_devices').delete().eq('driver_id', driverId);
  await supabase.from('driver_help_ai_consents').delete().eq('driver_id', driverId);

  console.log(JSON.stringify({
    provisioned: true,
    company_name: APP_REVIEW_COMPANY_NAME,
    account_id: accountId,
    driver_id: driverId,
    email: APP_REVIEW_EMAIL,
    username: APP_REVIEW_USERNAME
  }));
}

if (require.main === module) {
  provisionAppReviewDriver().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  APP_REVIEW_COMPANY_NAME,
  APP_REVIEW_EMAIL,
  APP_REVIEW_USERNAME,
  assertAppReviewIdentity,
  provisionAppReviewDriver
};
