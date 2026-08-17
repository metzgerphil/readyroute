const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { sendManagerInviteEmail: defaultSendManagerInviteEmail } = require('./managerInviteEmail');

function getManagerPortalBaseUrl(options = {}) {
  return String(
    options.managerPortalUrl ||
    process.env.MANAGER_PORTAL_URL ||
    process.env.VITE_MANAGER_PORTAL_URL ||
    'http://127.0.0.1:5173'
  ).replace(/\/$/, '');
}

function buildManagerInviteUrl(token, options = {}) {
  return `${getManagerPortalBaseUrl(options)}/reset-password?token=${encodeURIComponent(token)}&mode=invite`;
}

function createCompanySignupOnboardingService(options = {}) {
  const supabase = options.supabase;
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const now = options.now || (() => new Date());
  const sendManagerInviteEmail = options.sendManagerInviteEmail || defaultSendManagerInviteEmail;

  async function onboardSignup(signup) {
    if (!supabase) throw new Error('Company onboarding requires a database connection');
    if (!jwtSecret) throw new Error('Company onboarding requires JWT_SECRET');
    if (!signup?.id || !signup?.email || !signup?.company_csa || !signup?.name) {
      const error = new Error('Complete company and administrator details are required.');
      error.code = 'INCOMPLETE_SIGNUP';
      throw error;
    }

    if (signup.account_id) {
      return {
        account: { id: signup.account_id, company_name: signup.company_csa, manager_email: signup.email },
        already_onboarded: true,
        invitation: { email_delivery: 'already_created', invite_url: null }
      };
    }

    let createdAccountId = null;
    try {
      const existingManager = await supabase
        .from('manager_users')
        .select('id, password_hash')
        .eq('email', signup.email)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (existingManager.error) throw existingManager.error;

      const inaccessiblePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .insert({
          company_name: signup.company_csa,
          manager_email: signup.email,
          manager_password_hash: inaccessiblePasswordHash,
          vehicle_count: 0,
          plan: 'starter',
          subscription_status: 'incomplete',
          stripe_customer_id: signup.stripe_customer_id || null,
          stripe_default_payment_method_id: signup.stripe_payment_method_id || null,
          billing_setup_status: signup.billing_setup_status || 'not_started',
          billing_activation_status: signup.billing_setup_status === 'succeeded' ? 'ready' : 'not_started',
          billing_interval: signup.billing_interval || 'monthly',
          billing_policy_version: signup.billing_policy_version || null,
          billing_consent_at: signup.billing_consent_at || null
        })
        .select('id, company_name, manager_email, subscription_status, plan, created_at')
        .single();
      if (accountError || !account) throw accountError || new Error('Company account was not created');
      createdAccountId = account.id;

      const createdAt = now().toISOString();
      const linkedExistingManager = Boolean(existingManager.data?.password_hash);
      const { data: manager, error: managerError } = await supabase
        .from('manager_users')
        .insert({
          account_id: account.id,
          email: signup.email,
          full_name: signup.name,
          password_hash: linkedExistingManager ? existingManager.data.password_hash : null,
          is_active: true,
          invited_at: createdAt,
          accepted_at: linkedExistingManager ? createdAt : null
        })
        .select('id, account_id, email, full_name, invited_at, accepted_at')
        .single();
      if (managerError || !manager) throw managerError || new Error('Company administrator was not created');

      const profileResult = await supabase.from('account_internal_profiles').upsert({
        account_id: account.id,
        lifecycle_status: 'onboarding',
        onboarding_stage: linkedExistingManager ? 'manager_active' : 'manager_invited',
        updated_at: createdAt
      }, { onConflict: 'account_id' });
      if (profileResult.error) throw profileResult.error;

      const signupUpdate = await supabase
        .from('early_access_signups')
        .update({ account_id: account.id, updated_at: createdAt })
        .eq('id', signup.id);
      if (signupUpdate.error) throw signupUpdate.error;

      let inviteUrl = null;
      let delivery = { delivered: false, skipped: true };
      if (!linkedExistingManager) {
        const inviteToken = jwt.sign({
          account_id: account.id,
          manager_user_id: manager.id,
          email: manager.email,
          purpose: 'manager_invite'
        }, jwtSecret, { expiresIn: '7d' });
        inviteUrl = buildManagerInviteUrl(inviteToken, options);
        try {
          delivery = await sendManagerInviteEmail({
            to: manager.email,
            fullName: manager.full_name,
            inviteUrl,
            companyName: account.company_name,
            inviterName: 'Ready Route'
          });
        } catch (emailError) {
          console.error('Automatic company manager invite delivery failed:', emailError);
          delivery = { delivered: false, skipped: false };
        }
      }

      return {
        account,
        manager,
        already_onboarded: false,
        invitation: {
          email_delivery: linkedExistingManager ? 'not_required' : delivery.delivered ? 'sent' : delivery.skipped ? 'not_configured' : 'failed',
          invite_url: process.env.NODE_ENV === 'production' || delivery.delivered ? null : inviteUrl
        }
      };
    } catch (error) {
      if (createdAccountId) await supabase.from('accounts').delete().eq('id', createdAccountId);
      throw error;
    }
  }

  return { onboardSignup };
}

module.exports = {
  buildManagerInviteUrl,
  createCompanySignupOnboardingService
};
