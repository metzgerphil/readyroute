const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');

const defaultSupabase = require('../lib/supabase');
const { createBillingService } = require('../services/billing');
const { createStripeSignupBillingService } = require('../services/stripeSignupBilling');
const { filterProductionRows } = require('../services/testDataFilter');
const {
  buildDriverMetrics,
  buildMetrics: buildDriverHelpMetrics
} = require('../services/driverHelpMonthlyReport');
const { sendManagerInviteEmail: defaultSendManagerInviteEmail } = require('../services/managerInviteEmail');
const {
  sendReadyRouteStaffInviteEmail: defaultSendReadyRouteStaffInviteEmail,
  sendReadyRouteStaffPasswordResetEmail: defaultSendReadyRouteStaffPasswordResetEmail
} = require('../services/readyRouteStaffEmail');
const {
  READYROUTE_STAFF_ADMIN_ROLES,
  READYROUTE_STAFF_ROLES,
  READYROUTE_STAFF_WRITE_ROLES,
  isValidEmail,
  normalizeEmail,
  normalizeStaffRole,
  presentStaffUser,
  readRequiredStaffContext,
  signStaffToken
} = require('../services/readyRouteStaffAuth');

const ACCOUNT_LIFECYCLE_STATUSES = new Set([
  'lead',
  'trial',
  'onboarding',
  'active',
  'at_risk',
  'canceled'
]);

const STAFF_INVITE_STATUSES = new Set(['pending', 'accepted', 'expired', 'revoked']);
const OPERATING_COST_CATEGORIES = new Set([
  'ai_tools',
  'vercel',
  'google_cloud_run',
  'supabase',
  'email',
  'maps',
  'apple_developer',
  'stripe_fees',
  'domains',
  'software',
  'other'
]);

function normalizeText(value, maxLength = 500) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function isStrongEnoughPassword(password) {
  return typeof password === 'string' && password.length >= 10;
}

function normalizeLifecycleStatus(value, fallback = 'lead') {
  const status = String(value || '').trim().toLowerCase();
  return ACCOUNT_LIFECYCLE_STATUSES.has(status) ? status : fallback;
}

function normalizeInviteStatus(value, fallback = 'pending') {
  const status = String(value || '').trim().toLowerCase();
  return STAFF_INVITE_STATUSES.has(status) ? status : fallback;
}

function normalizeCents(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }

  return Math.round(numeric);
}

function getUtcMonthStart(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeDateOnly(value, fallback = null) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return fallback;
  }

  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return raw;
}

function normalizePeriodMonth(value, fallbackDate = new Date()) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})/);

  if (match) {
    const month = Number(match[2]);

    if (month >= 1 && month <= 12) {
      return `${match[1]}-${match[2]}-01`;
    }
  }

  const date = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function billingDateForPeriod(periodMonth, billingDay) {
  const [year, month] = String(periodMonth || '').slice(0, 7).split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Math.max(Number(billingDay) || 1, 1), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeOperatingCostCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  return OPERATING_COST_CATEGORIES.has(category) ? category : 'other';
}

function isMissingOperatingCostsTableError(error) {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    (message.includes('readyroute_operating_costs') && (
      message.includes('does not exist') ||
      message.includes('schema cache') ||
      message.includes('not found')
    ))
  );
}

function createOpaqueToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

function hashOpaqueToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function countByAccount(rows = [], predicate = () => true) {
  return rows.reduce((counts, row) => {
    if (!row?.account_id || !predicate(row)) {
      return counts;
    }

    counts[row.account_id] = (counts[row.account_id] || 0) + 1;
    return counts;
  }, {});
}

function latestByAccount(rows = [], getTimestamp = (row) => row.created_at) {
  return rows.reduce((latest, row) => {
    if (!row?.account_id) {
      return latest;
    }

    const timestamp = new Date(getTimestamp(row) || 0).getTime();
    const currentTimestamp = latest[row.account_id]
      ? new Date(getTimestamp(latest[row.account_id]) || 0).getTime()
      : 0;

    if (!latest[row.account_id] || timestamp > currentTimestamp) {
      latest[row.account_id] = row;
    }

    return latest;
  }, {});
}

function mapByAccount(rows = []) {
  return rows.reduce((map, row) => {
    if (row?.account_id) {
      map[row.account_id] = row;
    }

    return map;
  }, {});
}

function getRequestStaff(req, jwtSecret, allowedRoles = READYROUTE_STAFF_ROLES, supabase = defaultSupabase) {
  return readRequiredStaffContext(req, jwtSecret, allowedRoles, { supabase });
}

function sendAuthError(res, error) {
  if (error.status === 401) {
    return res.status(401).json({ error: error.message || 'Invalid or expired token' });
  }

  if (error.status === 403) {
    return res.status(403).json({ error: error.message || 'ReadyRoute staff access required' });
  }

  return null;
}

function presentAccountSummary(account, profile, counts = {}, latestTicket = null) {
  return {
    id: account.id,
    company_name: account.company_name,
    manager_email: account.manager_email || null,
    subscription_status: account.subscription_status || null,
    plan: account.plan || null,
    vehicle_count: account.vehicle_count || 0,
    stripe_customer_id: account.stripe_customer_id || null,
    stripe_subscription_id: account.stripe_subscription_id || null,
    billing_setup_status: account.billing_setup_status || 'not_started',
    billing_activation_status: account.billing_activation_status || 'not_started',
    billing_access_status: account.billing_access_status || 'not_provisioned',
    billing_interval: account.billing_interval || 'monthly',
    billed_driver_count: Number(account.billed_driver_count || 0),
    rra_billing_treatment: account.rra_billing_treatment || 'standard',
    rra_complimentary_reason: account.rra_complimentary_reason || null,
    rra_billing_treatment_updated_at: account.rra_billing_treatment_updated_at || null,
    account_status: account.account_status || 'active',
    cancellation_requested_at: account.cancellation_requested_at || null,
    service_ends_at: account.service_ends_at || null,
    retention_ends_at: account.retention_ends_at || null,
    canceled_at: account.canceled_at || null,
    cancellation_reason: account.cancellation_reason || null,
    driver_help_monthly_report_enabled: account.driver_help_monthly_report_enabled !== false,
    driver_help_minutes_per_answer_estimate: Number(account.driver_help_minutes_per_answer_estimate || 5),
    created_at: account.created_at || null,
    internal_profile: {
      lifecycle_status: profile?.lifecycle_status || 'lead',
      onboarding_stage: profile?.onboarding_stage || null,
      internal_notes: profile?.internal_notes || null,
      internal_owner_staff_user_id: profile?.internal_owner_staff_user_id || null,
      updated_at: profile?.updated_at || null
    },
    counts: {
      active_managers: counts.activeManagers || 0,
      active_drivers: counts.activeDrivers || 0,
      open_support_tickets: counts.openTickets || 0,
      urgent_support_tickets: counts.urgentTickets || 0
    },
    latest_support_ticket: latestTicket ? {
      id: latestTicket.id,
      ticket_reference: latestTicket.ticket_reference,
      subject: latestTicket.subject,
      status: latestTicket.status,
      priority: latestTicket.priority,
      created_at: latestTicket.created_at
    } : null
  };
}

function presentCompanySignup(row = {}) {
  return {
    id: row.id,
    name: row.name || '',
    email: normalizeEmail(row.email),
    phone_number: row.phone_number || null,
    company_name: row.company_csa || '',
    role: row.role || null,
    driver_count: Number(row.driver_count || 0),
    billing_interval: row.billing_interval || null,
    billing_setup_status: row.billing_setup_status || 'not_started',
    account_id: row.account_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function presentStaffInvite(row = {}) {
  return {
    id: row.id,
    email: normalizeEmail(row.email),
    full_name: row.full_name || '',
    role: normalizeStaffRole(row.role),
    status: normalizeInviteStatus(row.status),
    invited_by_staff_user_id: row.invited_by_staff_user_id || null,
    accepted_by_staff_user_id: row.accepted_by_staff_user_id || null,
    email_provider_id: row.email_provider_id || null,
    expires_at: row.expires_at || null,
    accepted_at: row.accepted_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function presentAuditLog(row = {}) {
  return {
    id: row.id,
    staff_user_id: row.staff_user_id || null,
    staff_email: row.staff_email || null,
    action: row.action || '',
    target_type: row.target_type || null,
    target_id: row.target_id || null,
    account_id: row.account_id || null,
    metadata: row.metadata || {},
    created_at: row.created_at || null
  };
}

function presentOperatingCost(row = {}) {
  return {
    id: row.id,
    period_month: row.period_month || null,
    category: normalizeOperatingCostCategory(row.category),
    vendor: row.vendor || '',
    amount_cents: Number(row.amount_cents || 0),
    billing_date: row.billing_date || null,
    is_recurring: row.is_recurring !== false,
    notes: row.notes || null,
    receipt_url: row.receipt_url || null,
    template_id: row.template_id || null,
    import_batch_id: row.import_batch_id || null,
    created_by_staff_user_id: row.created_by_staff_user_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function presentOperatingCostTemplate(row = {}) {
  return {
    id: row.id,
    category: normalizeOperatingCostCategory(row.category),
    vendor: row.vendor || '',
    default_amount_cents: Number(row.default_amount_cents || 0),
    billing_day: row.billing_day || null,
    notes: row.notes || null,
    is_active: row.is_active !== false,
    created_by_staff_user_id: row.created_by_staff_user_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function buildOperatingCostSummary(rows = []) {
  const costs = rows.map(presentOperatingCost);
  const categoryTotals = {};
  const vendors = new Set();
  let totalCostCents = 0;
  let recurringCostCents = 0;
  let oneTimeCostCents = 0;

  for (const cost of costs) {
    const amountCents = Number(cost.amount_cents || 0);
    totalCostCents += amountCents;
    categoryTotals[cost.category] = (categoryTotals[cost.category] || 0) + amountCents;

    if (cost.vendor) {
      vendors.add(cost.vendor.trim().toLowerCase());
    }

    if (cost.is_recurring) {
      recurringCostCents += amountCents;
    } else {
      oneTimeCostCents += amountCents;
    }
  }

  return {
    total_cost_cents: totalCostCents,
    recurring_cost_cents: recurringCostCents,
    one_time_cost_cents: oneTimeCostCents,
    category_totals: categoryTotals,
    vendor_count: vendors.size,
    entry_count: costs.length
  };
}

function buildAccountTimeline({ account, profile, supportTickets = [], auditLogs = [], billingRoutes = [] } = {}) {
  const events = [];

  if (account?.created_at) {
    events.push({
      id: `account-created-${account.id}`,
      type: 'account_created',
      title: 'Account created',
      description: account.company_name || account.manager_email || 'Customer account created',
      created_at: account.created_at
    });
  }

  if (profile?.updated_at) {
    events.push({
      id: `profile-updated-${account?.id}`,
      type: 'internal_profile_updated',
      title: 'Internal profile updated',
      description: `${profile.lifecycle_status || 'lead'}${profile.onboarding_stage ? ` · ${profile.onboarding_stage}` : ''}`,
      created_at: profile.updated_at
    });
  }

  for (const ticket of supportTickets.slice(0, 12)) {
    events.push({
      id: `ticket-${ticket.id}`,
      type: 'support_ticket',
      title: `${ticket.ticket_reference || 'Ticket'} · ${ticket.status || 'new'}`,
      description: ticket.subject || ticket.description || 'Support ticket',
      created_at: ticket.updated_at || ticket.created_at
    });
  }

  for (const route of billingRoutes.slice(0, 12)) {
    events.push({
      id: `billable-route-${route.id}`,
      type: 'billable_route',
      title: `Billable route ${route.route_display_name || route.route_key || ''}`.trim(),
      description: route.status || 'pending',
      created_at: route.last_imported_at || route.first_imported_at || route.created_at
    });
  }

  for (const log of auditLogs.slice(0, 20)) {
    events.push({
      id: `audit-${log.id}`,
      type: 'staff_audit',
      title: log.action || 'Staff action',
      description: log.staff_email || log.target_type || 'ReadyRoute staff',
      created_at: log.created_at,
      metadata: log.metadata || {}
    });
  }

  return events
    .filter((event) => event.created_at)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 40);
}

function createReadyRouteStaffRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const now = options.now || (() => new Date());
  const sendReadyRouteStaffInviteEmail =
    options.sendReadyRouteStaffInviteEmail || defaultSendReadyRouteStaffInviteEmail;
  const sendReadyRouteStaffPasswordResetEmail =
    options.sendReadyRouteStaffPasswordResetEmail || defaultSendReadyRouteStaffPasswordResetEmail;
  const sendManagerInviteEmail = options.sendManagerInviteEmail || defaultSendManagerInviteEmail;
  const billingService = options.billingService || createBillingService({
    supabase,
    stripeClient: options.stripeClient
  });
  const activationStripeClient = options.stripeClient || (process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: process.env.STRIPE_API_VERSION || '2026-06-24.dahlia' })
    : null);
  const subscriptionActivationService = options.subscriptionActivationService || createStripeSignupBillingService({
    supabase,
    stripeClient: activationStripeClient,
    monthlyPriceId: options.stripeMonthlyPriceId,
    annualPriceId: options.stripeAnnualPriceId,
    liveBillingApproved: options.liveBillingApproved
  });

  function getManagerPortalBaseUrl() {
    return (
      process.env.MANAGER_PORTAL_URL ||
      process.env.VITE_MANAGER_PORTAL_URL ||
      'http://127.0.0.1:5173'
    );
  }

  function getCompanyPortalBaseUrl() {
    return process.env.RRA_COMPANY_PORTAL_URL || getManagerPortalBaseUrl();
  }

  function getStaffPortalBaseUrl() {
    if (process.env.READYROUTE_STAFF_PORTAL_URL) {
      return process.env.READYROUTE_STAFF_PORTAL_URL;
    }

    if (process.env.NODE_ENV === 'production') {
      return 'https://readyroute.org/staff';
    }

    return `${getManagerPortalBaseUrl().replace(/\/$/, '')}/staff`;
  }

  function getPasswordVersion(hash) {
    return crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 16);
  }

  function signToken(payload, expiresIn) {
    if (!jwtSecret) {
      throw new Error('Missing JWT_SECRET environment variable');
    }

    return jwt.sign(payload, jwtSecret, { expiresIn });
  }

  function buildStaffPasswordResetUrl(token) {
    const baseUrl = getStaffPortalBaseUrl().replace(/\/$/, '');
    return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  }

  function buildStaffInviteUrl(token) {
    const baseUrl = getStaffPortalBaseUrl().replace(/\/$/, '');
    return `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`;
  }

  function buildManagerInviteUrl(token) {
    const baseUrl = getCompanyPortalBaseUrl().replace(/\/$/, '');
    return `${baseUrl}?invite=${encodeURIComponent(token)}`;
  }

  async function writeAuditLog({
    staff,
    action,
    targetType,
    targetId,
    accountId,
    metadata = {}
  }) {
    try {
      await supabase
        .from('readyroute_staff_audit_log')
        .insert({
          staff_user_id: staff?.staff_user_id || null,
          staff_email: staff?.staff_email || null,
          action,
          target_type: targetType || null,
          target_id: targetId || null,
          account_id: accountId || null,
          metadata,
          created_at: now().toISOString()
        });
    } catch (error) {
      console.warn('ReadyRoute staff audit log write failed:', error);
    }
  }

  async function findStaffUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    const { data, error } = await supabase
      .from('readyroute_staff_users')
      .select('id, email, full_name, password_hash, role, is_active, invited_at, accepted_at, last_login_at, created_at, updated_at')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  async function findStaffUserById(staffUserId) {
    const { data, error } = await supabase
      .from('readyroute_staff_users')
      .select('id, email, full_name, password_hash, role, is_active, invited_at, accepted_at, last_login_at, created_at, updated_at')
      .eq('id', staffUserId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  async function loadAccountInternalProfile(accountId) {
    const { data, error } = await supabase
      .from('account_internal_profiles')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  async function loadActiveCompanyAccessSession({ sessionId, accountId, staff }) {
    const { data, error } = await supabase
      .from('readyroute_staff_company_access_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('account_id', accountId)
      .eq('staff_user_id', staff.staff_user_id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data || data.status !== 'active') {
      return null;
    }

    if (new Date(data.expires_at).getTime() <= now().getTime()) {
      await supabase
        .from('readyroute_staff_company_access_sessions')
        .update({ status: 'expired', ended_at: now().toISOString() })
        .eq('id', data.id);
      return null;
    }

    return data;
  }

  router.post('/login', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
      const staffUser = await findStaffUserByEmail(email);

      if (!staffUser || staffUser.is_active === false || !staffUser.password_hash) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await bcrypt.compare(password, staffUser.password_hash);

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const loginTimestamp = now().toISOString();
      await supabase
        .from('readyroute_staff_users')
        .update({ last_login_at: loginTimestamp, updated_at: loginTimestamp })
        .eq('id', staffUser.id);

      const user = {
        ...staffUser,
        last_login_at: loginTimestamp
      };

      await writeAuditLog({
        staff: {
          staff_user_id: staffUser.id,
          staff_email: staffUser.email
        },
        action: 'staff.login',
        targetType: 'readyroute_staff_user',
        targetId: staffUser.id
      });

      return res.status(200).json({
        token: signStaffToken(user, jwtSecret),
        user: presentStaffUser(user)
      });
    } catch (error) {
      console.error('ReadyRoute staff login failed:', error);
      return res.status(500).json({ error: 'Failed to log in ReadyRoute staff user.' });
    }
  });

  router.post('/request-password-reset', async (req, res) => {
    const email = normalizeEmail(req.body?.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required.' });
    }

    const responsePayload = {
      message: 'If that staff account exists, a password reset link has been prepared.'
    };

    try {
      const staffUser = await findStaffUserByEmail(email);

      if (!staffUser || staffUser.is_active === false || !staffUser.password_hash) {
        return res.status(200).json(responsePayload);
      }

      const token = signToken(
        {
          staff_user_id: staffUser.id,
          email: normalizeEmail(staffUser.email),
          purpose: 'readyroute_staff_password_reset',
          pwdv: getPasswordVersion(staffUser.password_hash)
        },
        '30m'
      );
      const resetUrl = buildStaffPasswordResetUrl(token);

      let emailDelivery = {
        delivered: false,
        skipped: true,
        reason: 'Email service is not configured'
      };

      try {
        emailDelivery = await sendReadyRouteStaffPasswordResetEmail({
          to: staffUser.email,
          fullName: staffUser.full_name,
          resetUrl
        });
      } catch (emailError) {
        console.error('ReadyRoute staff password reset email delivery failed:', emailError);
        emailDelivery = {
          delivered: false,
          skipped: false,
          reason: 'Email delivery failed'
        };
      }

      if (process.env.NODE_ENV === 'production' && emailDelivery?.skipped) {
        return res.status(503).json({ error: 'Staff password reset email service is not configured yet.' });
      }

      if (process.env.NODE_ENV === 'production' && !emailDelivery?.delivered) {
        return res.status(503).json({
          error: 'Staff password reset email could not be sent. Ask a ReadyRoute owner or admin to reset your password.'
        });
      }

      if (process.env.NODE_ENV !== 'production') {
        responsePayload.reset_url = resetUrl;
      }

      if (emailDelivery?.delivered) {
        responsePayload.message = 'Password reset email sent. Check your inbox for the reset link.';
      }

      return res.status(200).json(responsePayload);
    } catch (error) {
      console.error('ReadyRoute staff password reset request failed:', error);
      return res.status(500).json({ error: 'Failed to process staff password reset request.' });
    }
  });

  router.post('/change-password', async (req, res) => {
    const currentPassword = String(req.body?.current_password || '');
    const nextPassword = String(req.body?.new_password || '');

    if (!currentPassword || !nextPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (!isStrongEnoughPassword(nextPassword)) {
      return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    }

    if (currentPassword === nextPassword) {
      return res.status(400).json({ error: 'New password must be different from the current password.' });
    }

    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ROLES, supabase);
      const staffUser = await findStaffUserById(staff.staff_user_id);

      if (!staffUser || staffUser.is_active === false || !staffUser.password_hash) {
        return res.status(403).json({ error: 'ReadyRoute staff access required.' });
      }

      const currentPasswordMatches = await bcrypt.compare(currentPassword, staffUser.password_hash);

      if (!currentPasswordMatches) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      const passwordHash = await bcrypt.hash(nextPassword, 10);
      const { error } = await supabase
        .from('readyroute_staff_users')
        .update({
          password_hash: passwordHash,
          updated_at: now().toISOString()
        })
        .eq('id', staffUser.id);

      if (error) {
        throw error;
      }

      await writeAuditLog({
        staff,
        action: 'staff.password_changed',
        targetType: 'readyroute_staff_user',
        targetId: staffUser.id
      });

      return res.status(200).json({ message: 'Password updated.' });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff password change failed:', error);
      return res.status(500).json({ error: 'Unable to update staff password.' });
    }
  });

  router.post('/reset-password', async (req, res) => {
    const token = String(req.body?.token || '');
    const password = String(req.body?.password || '');

    if (!token || !password) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }

    if (!isStrongEnoughPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    }

    try {
      let payload;

      try {
        payload = jwt.verify(token, jwtSecret);
      } catch (_error) {
        return res.status(400).json({ error: 'Reset link is invalid or expired.' });
      }

      if (
        payload?.purpose !== 'readyroute_staff_password_reset' ||
        !payload.staff_user_id ||
        !payload.email ||
        !payload.pwdv
      ) {
        return res.status(400).json({ error: 'Reset link is invalid or expired.' });
      }

      const staffUser = await findStaffUserById(payload.staff_user_id);

      if (
        !staffUser ||
        staffUser.is_active === false ||
        normalizeEmail(staffUser.email) !== normalizeEmail(payload.email) ||
        !staffUser.password_hash ||
        getPasswordVersion(staffUser.password_hash) !== payload.pwdv
      ) {
        return res.status(400).json({ error: 'Reset link is invalid or expired.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const { error } = await supabase
        .from('readyroute_staff_users')
        .update({
          password_hash: passwordHash,
          updated_at: now().toISOString()
        })
        .eq('id', staffUser.id);

      if (error) {
        throw error;
      }

      await writeAuditLog({
        staff: {
          staff_user_id: staffUser.id,
          staff_email: staffUser.email
        },
        action: 'staff.password_reset_completed',
        targetType: 'readyroute_staff_user',
        targetId: staffUser.id
      });

      return res.status(200).json({ message: 'Password updated. You can sign in now.' });
    } catch (error) {
      console.error('ReadyRoute staff password reset failed:', error);
      return res.status(500).json({ error: 'Failed to reset staff password.' });
    }
  });

  router.get('/me', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ROLES, supabase);
      return res.status(200).json({ staff });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff me failed:', error);
      return res.status(500).json({ error: 'Unable to load staff session.' });
    }
  });

  router.get('/audit-log', async (req, res) => {
    try {
      await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ROLES, supabase);
      const accountId = normalizeText(req.query?.account_id, 120);
      const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 200);
      let query = supabase
        .from('readyroute_staff_audit_log')
        .select('id, staff_user_id, staff_email, action, target_type, target_id, account_id, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return res.status(200).json({ audit_logs: (data || []).map(presentAuditLog) });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff audit log list failed:', error);
      return res.status(500).json({ error: 'Unable to load ReadyRoute staff audit log.' });
    }
  });

  router.get('/invites', async (req, res) => {
    try {
      await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);

      const { data, error } = await supabase
        .from('readyroute_staff_invites')
        .select('id, email, full_name, role, status, invited_by_staff_user_id, accepted_by_staff_user_id, email_provider_id, expires_at, accepted_at, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      return res.status(200).json({ invites: (data || []).map(presentStaffInvite) });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff invite list failed:', error);
      return res.status(500).json({ error: 'Unable to load ReadyRoute staff invites.' });
    }
  });

  router.post('/invites', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);
      const email = normalizeEmail(req.body?.email);
      const fullName = normalizeText(req.body?.full_name || req.body?.name, 180);
      const role = normalizeStaffRole(req.body?.role, 'support');
      const timestamp = now();
      const expiresAt = new Date(timestamp.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'A valid email is required.' });
      }

      if (!fullName) {
        return res.status(400).json({ error: 'Full name is required.' });
      }

      const existingStaffUser = await findStaffUserByEmail(email);

      if (existingStaffUser) {
        return res.status(409).json({ error: 'A ReadyRoute staff user already exists for that email.' });
      }

      const inviteToken = createOpaqueToken();
      const inviteUrl = buildStaffInviteUrl(inviteToken);
      const { data, error } = await supabase
        .from('readyroute_staff_invites')
        .insert({
          email,
          full_name: fullName,
          role,
          status: 'pending',
          token_hash: hashOpaqueToken(inviteToken),
          invited_by_staff_user_id: staff.staff_user_id,
          expires_at: expiresAt,
          created_at: timestamp.toISOString(),
          updated_at: timestamp.toISOString()
        })
        .select('id, email, full_name, role, status, invited_by_staff_user_id, accepted_by_staff_user_id, email_provider_id, expires_at, accepted_at, created_at, updated_at')
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'A pending ReadyRoute staff invite already exists for that email.' });
        }

        throw error;
      }

      let emailDelivery = {
        delivered: false,
        skipped: true,
        reason: 'Email service is not configured'
      };

      try {
        emailDelivery = await sendReadyRouteStaffInviteEmail({
          to: email,
          fullName,
          inviteUrl,
          inviterName: staff.staff_name || staff.staff_email,
          role
        });
      } catch (emailError) {
        console.error('ReadyRoute staff invite email delivery failed:', emailError);
        emailDelivery = {
          delivered: false,
          skipped: false,
          reason: 'Email delivery failed'
        };
      }

      if (emailDelivery?.provider_id) {
        await supabase
          .from('readyroute_staff_invites')
          .update({ email_provider_id: emailDelivery.provider_id, updated_at: now().toISOString() })
          .eq('id', data.id);
      }

      await writeAuditLog({
        staff,
        action: 'staff.invite_created',
        targetType: 'readyroute_staff_invite',
        targetId: data.id,
        metadata: {
          email,
          role,
          email_delivered: Boolean(emailDelivery?.delivered)
        }
      });

      const responsePayload = {
        invite: presentStaffInvite({
          ...data,
          email_provider_id: emailDelivery?.provider_id || data.email_provider_id || null
        }),
        email_delivery: emailDelivery
      };

      if (process.env.NODE_ENV !== 'production' || !emailDelivery?.delivered) {
        responsePayload.invite_url = inviteUrl;
      }

      return res.status(201).json(responsePayload);
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff invite create failed:', error);
      return res.status(500).json({ error: 'Unable to create ReadyRoute staff invite.' });
    }
  });

  router.post('/invites/:inviteId/resend', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);
      const inviteId = normalizeText(req.params.inviteId, 120);

      const { data: existingInvite, error: existingError } = await supabase
        .from('readyroute_staff_invites')
        .select('id, email, full_name, role, status')
        .eq('id', inviteId)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existingInvite || existingInvite.status !== 'pending') {
        return res.status(404).json({ error: 'Pending ReadyRoute staff invite not found.' });
      }

      const timestamp = now();
      const expiresAt = new Date(timestamp.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const inviteToken = createOpaqueToken();
      const inviteUrl = buildStaffInviteUrl(inviteToken);
      let emailDelivery = {
        delivered: false,
        skipped: true,
        reason: 'Email service is not configured'
      };

      try {
        emailDelivery = await sendReadyRouteStaffInviteEmail({
          to: existingInvite.email,
          fullName: existingInvite.full_name,
          inviteUrl,
          inviterName: staff.staff_name || staff.staff_email,
          role: existingInvite.role
        });
      } catch (emailError) {
        console.error('ReadyRoute staff invite resend email delivery failed:', emailError);
        emailDelivery = {
          delivered: false,
          skipped: false,
          reason: 'Email delivery failed'
        };
      }

      const { data, error } = await supabase
        .from('readyroute_staff_invites')
        .update({
          token_hash: hashOpaqueToken(inviteToken),
          email_provider_id: emailDelivery?.provider_id || null,
          expires_at: expiresAt,
          updated_at: timestamp.toISOString()
        })
        .eq('id', inviteId)
        .select('id, email, full_name, role, status, invited_by_staff_user_id, accepted_by_staff_user_id, email_provider_id, expires_at, accepted_at, created_at, updated_at')
        .maybeSingle();

      if (error) {
        throw error;
      }

      await writeAuditLog({
        staff,
        action: 'staff.invite_resent',
        targetType: 'readyroute_staff_invite',
        targetId: inviteId,
        metadata: {
          email: existingInvite.email,
          email_delivered: Boolean(emailDelivery?.delivered)
        }
      });

      const responsePayload = {
        invite: presentStaffInvite(data),
        email_delivery: emailDelivery
      };

      if (process.env.NODE_ENV !== 'production' || !emailDelivery?.delivered) {
        responsePayload.invite_url = inviteUrl;
      }

      return res.status(200).json(responsePayload);
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff invite resend failed:', error);
      return res.status(500).json({ error: 'Unable to resend ReadyRoute staff invite.' });
    }
  });

  router.post('/invites/accept', async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

    if (!token || !password) {
      return res.status(400).json({ error: 'Invite token and password are required.' });
    }

    if (!isStrongEnoughPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    }

    try {
      const tokenHash = hashOpaqueToken(token);
      const { data: invite, error: inviteError } = await supabase
        .from('readyroute_staff_invites')
        .select('id, email, full_name, role, status, expires_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (inviteError) {
        throw inviteError;
      }

      if (!invite || invite.status !== 'pending' || new Date(invite.expires_at).getTime() <= now().getTime()) {
        return res.status(400).json({ error: 'Invite link is invalid or expired.' });
      }

      const existingStaffUser = await findStaffUserByEmail(invite.email);

      if (existingStaffUser) {
        return res.status(409).json({ error: 'A ReadyRoute staff user already exists for that email.' });
      }

      const timestamp = now().toISOString();
      const passwordHash = await bcrypt.hash(password, 10);
      const { data: staffUser, error: staffError } = await supabase
        .from('readyroute_staff_users')
        .insert({
          email: invite.email,
          full_name: invite.full_name,
          password_hash: passwordHash,
          role: normalizeStaffRole(invite.role, 'support'),
          is_active: true,
          invited_at: timestamp,
          accepted_at: timestamp,
          created_at: timestamp,
          updated_at: timestamp
        })
        .select('id, email, full_name, password_hash, role, is_active, invited_at, accepted_at, last_login_at, created_at, updated_at')
        .single();

      if (staffError) {
        if (staffError.code === '23505') {
          return res.status(409).json({ error: 'A ReadyRoute staff user already exists for that email.' });
        }

        throw staffError;
      }

      const { error: updateInviteError } = await supabase
        .from('readyroute_staff_invites')
        .update({
          status: 'accepted',
          accepted_at: timestamp,
          accepted_by_staff_user_id: staffUser.id,
          updated_at: timestamp
        })
        .eq('id', invite.id);

      if (updateInviteError) {
        throw updateInviteError;
      }

      await writeAuditLog({
        staff: {
          staff_user_id: staffUser.id,
          staff_email: staffUser.email
        },
        action: 'staff.invite_accepted',
        targetType: 'readyroute_staff_invite',
        targetId: invite.id,
        metadata: {
          email: staffUser.email,
          role: staffUser.role
        }
      });

      return res.status(201).json({
        token: signStaffToken({ ...staffUser, password_hash: passwordHash }, jwtSecret),
        user: presentStaffUser(staffUser)
      });
    } catch (error) {
      console.error('ReadyRoute staff invite accept failed:', error);
      return res.status(500).json({ error: 'Unable to accept ReadyRoute staff invite.' });
    }
  });

  router.get('/users', async (req, res) => {
    try {
      await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);

      const { data, error } = await supabase
        .from('readyroute_staff_users')
        .select('id, email, full_name, role, is_active, invited_at, accepted_at, last_login_at, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return res.status(200).json({ staff_users: (data || []).map(presentStaffUser) });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff user list failed:', error);
      return res.status(500).json({ error: 'Unable to load ReadyRoute staff users.' });
    }
  });

  router.post('/users', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);
      const email = normalizeEmail(req.body?.email);
      const fullName = normalizeText(req.body?.full_name || req.body?.name, 180);
      const password = String(req.body?.password || '');
      const role = normalizeStaffRole(req.body?.role, 'support');
      const timestamp = now().toISOString();

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'A valid email is required.' });
      }

      if (!fullName) {
        return res.status(400).json({ error: 'Full name is required.' });
      }

      if (!isStrongEnoughPassword(password)) {
        return res.status(400).json({ error: 'Password must be at least 10 characters.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const { data, error } = await supabase
        .from('readyroute_staff_users')
        .insert({
          email,
          full_name: fullName,
          password_hash: passwordHash,
          role,
          is_active: true,
          invited_by_staff_user_id: staff.staff_user_id,
          invited_at: timestamp,
          accepted_at: timestamp,
          created_at: timestamp,
          updated_at: timestamp
        })
        .select('id, email, full_name, role, is_active, invited_at, accepted_at, last_login_at, created_at, updated_at')
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'A ReadyRoute staff user already exists for that email.' });
        }

        throw error;
      }

      return res.status(201).json({ staff_user: presentStaffUser(data) });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff user create failed:', error);
      return res.status(500).json({ error: 'Unable to create ReadyRoute staff user.' });
    }
  });

  router.patch('/users/:staffUserId', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);
      const staffUserId = normalizeText(req.params.staffUserId, 120);
      const updates = {
        updated_at: now().toISOString()
      };

      if (!staffUserId) {
        return res.status(404).json({ error: 'ReadyRoute staff user not found.' });
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'full_name')) {
        const fullName = normalizeText(req.body.full_name, 180);

        if (!fullName) {
          return res.status(400).json({ error: 'Full name is required.' });
        }

        updates.full_name = fullName;
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'role')) {
        updates.role = normalizeStaffRole(req.body.role, null);

        if (!updates.role) {
          return res.status(400).json({ error: 'Staff role is invalid.' });
        }
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'is_active')) {
        updates.is_active = req.body.is_active !== false;

        if (staffUserId === staff.staff_user_id && updates.is_active === false) {
          return res.status(400).json({ error: 'You cannot deactivate your own staff account.' });
        }
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'password')) {
        const password = String(req.body.password || '');

        if (!isStrongEnoughPassword(password)) {
          return res.status(400).json({ error: 'Password must be at least 10 characters.' });
        }

        updates.password_hash = await bcrypt.hash(password, 10);
      }

      const { data, error } = await supabase
        .from('readyroute_staff_users')
        .update(updates)
        .eq('id', staffUserId)
        .select('id, email, full_name, role, is_active, invited_at, accepted_at, last_login_at, created_at, updated_at')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return res.status(404).json({ error: 'ReadyRoute staff user not found.' });
      }

      return res.status(200).json({ staff_user: presentStaffUser(data) });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff user update failed:', error);
      return res.status(500).json({ error: 'Unable to update ReadyRoute staff user.' });
    }
  });

  router.get('/operating-costs', async (req, res) => {
    try {
      await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ROLES, supabase);
      const periodMonth = normalizePeriodMonth(req.query?.period_month, now());

      const { data, error } = await supabase
        .from('readyroute_operating_costs')
        .select('id, period_month, category, vendor, amount_cents, billing_date, is_recurring, notes, receipt_url, template_id, import_batch_id, created_by_staff_user_id, created_at, updated_at')
        .eq('period_month', periodMonth)
        .order('billing_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        if (isMissingOperatingCostsTableError(error)) {
          return res.status(200).json({
            period_month: periodMonth,
            operating_costs: [],
            summary: buildOperatingCostSummary([]),
            setup_required: true
          });
        }

        throw error;
      }

      const operatingCosts = (data || []).map(presentOperatingCost);

      return res.status(200).json({
        period_month: periodMonth,
        operating_costs: operatingCosts,
        summary: buildOperatingCostSummary(operatingCosts),
        setup_required: false
      });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute operating costs list failed:', error);
      return res.status(500).json({ error: 'Unable to load ReadyRoute operating costs.' });
    }
  });

  router.post('/operating-costs', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);
      const timestamp = now().toISOString();
      const periodMonth = normalizePeriodMonth(req.body?.period_month, now());
      const vendor = normalizeText(req.body?.vendor, 180);
      const amountCents = normalizeCents(req.body?.amount_cents, -1);

      if (!vendor) {
        return res.status(400).json({ error: 'Vendor or tool name is required.' });
      }

      if (amountCents < 0) {
        return res.status(400).json({ error: 'Amount must be zero or greater.' });
      }

      const payload = {
        period_month: periodMonth,
        category: normalizeOperatingCostCategory(req.body?.category),
        vendor,
        amount_cents: amountCents,
        billing_date: normalizeDateOnly(req.body?.billing_date, periodMonth),
        is_recurring: normalizeBoolean(req.body?.is_recurring, true),
        notes: normalizeText(req.body?.notes, 2000),
        receipt_url: normalizeText(req.body?.receipt_url, 1000),
        created_by_staff_user_id: staff.staff_user_id,
        updated_at: timestamp
      };

      const { data, error } = await supabase
        .from('readyroute_operating_costs')
        .insert(payload)
        .select('id, period_month, category, vendor, amount_cents, billing_date, is_recurring, notes, receipt_url, template_id, import_batch_id, created_by_staff_user_id, created_at, updated_at')
        .single();

      if (error) {
        if (isMissingOperatingCostsTableError(error)) {
          return res.status(409).json({ error: 'Operating costs table is not installed yet.' });
        }

        throw error;
      }

      const operatingCost = presentOperatingCost(data);

      await writeAuditLog({
        staff,
        action: 'operating_cost.created',
        targetType: 'readyroute_operating_cost',
        targetId: data.id,
        metadata: {
          period_month: periodMonth,
          category: operatingCost.category,
          vendor: operatingCost.vendor,
          amount_cents: operatingCost.amount_cents
        }
      });

      return res.status(201).json({ operating_cost: operatingCost });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute operating cost create failed:', error);
      return res.status(500).json({ error: 'Unable to save ReadyRoute operating cost.' });
    }
  });

  router.patch('/operating-costs/:costId', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);
      const costId = normalizeText(req.params.costId, 120);
      const updates = {
        updated_at: now().toISOString()
      };

      if (!costId) {
        return res.status(404).json({ error: 'Operating cost not found.' });
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'period_month')) {
        updates.period_month = normalizePeriodMonth(req.body.period_month, now());
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'category')) {
        updates.category = normalizeOperatingCostCategory(req.body.category);
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'vendor')) {
        const vendor = normalizeText(req.body.vendor, 180);
        if (!vendor) {
          return res.status(400).json({ error: 'Vendor or tool name is required.' });
        }
        updates.vendor = vendor;
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'amount_cents')) {
        const amountCents = normalizeCents(req.body.amount_cents, -1);
        if (amountCents < 0) {
          return res.status(400).json({ error: 'Amount must be zero or greater.' });
        }
        updates.amount_cents = amountCents;
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'billing_date')) {
        updates.billing_date = normalizeDateOnly(req.body.billing_date, null);
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'is_recurring')) {
        updates.is_recurring = normalizeBoolean(req.body.is_recurring, true);
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) {
        updates.notes = normalizeText(req.body.notes, 2000);
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'receipt_url')) {
        updates.receipt_url = normalizeText(req.body.receipt_url, 1000);
      }

      const { data, error } = await supabase
        .from('readyroute_operating_costs')
        .update(updates)
        .eq('id', costId)
        .select('id, period_month, category, vendor, amount_cents, billing_date, is_recurring, notes, receipt_url, template_id, import_batch_id, created_by_staff_user_id, created_at, updated_at')
        .maybeSingle();

      if (error) {
        if (isMissingOperatingCostsTableError(error)) {
          return res.status(409).json({ error: 'Operating costs table is not installed yet.' });
        }

        throw error;
      }

      if (!data) {
        return res.status(404).json({ error: 'Operating cost not found.' });
      }

      const operatingCost = presentOperatingCost(data);

      await writeAuditLog({
        staff,
        action: 'operating_cost.updated',
        targetType: 'readyroute_operating_cost',
        targetId: data.id,
        metadata: {
          period_month: operatingCost.period_month,
          category: operatingCost.category,
          vendor: operatingCost.vendor,
          amount_cents: operatingCost.amount_cents
        }
      });

      return res.status(200).json({ operating_cost: operatingCost });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute operating cost update failed:', error);
      return res.status(500).json({ error: 'Unable to update ReadyRoute operating cost.' });
    }
  });

  router.get('/operating-cost-templates', async (req, res) => {
    try {
      await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ROLES, supabase);
      const { data, error } = await supabase
        .from('readyroute_operating_cost_templates')
        .select('*')
        .order('is_active', { ascending: false })
        .order('vendor', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ templates: (data || []).map(presentOperatingCostTemplate) });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) return authResponse;
      console.error('ReadyRoute operating cost templates list failed:', error);
      return res.status(500).json({ error: 'Unable to load operating cost templates.' });
    }
  });

  router.post('/operating-cost-templates', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);
      const vendor = normalizeText(req.body?.vendor, 180);
      const amountCents = normalizeCents(req.body?.default_amount_cents, -1);
      const billingDay = Math.trunc(Number(req.body?.billing_day || 1));
      if (!vendor) return res.status(400).json({ error: 'Vendor or tool name is required.' });
      if (amountCents < 0) return res.status(400).json({ error: 'Default amount must be zero or greater.' });
      if (billingDay < 1 || billingDay > 31) return res.status(400).json({ error: 'Billing day must be between 1 and 31.' });

      const timestamp = now().toISOString();
      const { data, error } = await supabase
        .from('readyroute_operating_cost_templates')
        .insert({
          category: normalizeOperatingCostCategory(req.body?.category),
          vendor,
          default_amount_cents: amountCents,
          billing_day: billingDay,
          notes: normalizeText(req.body?.notes, 2000),
          is_active: normalizeBoolean(req.body?.is_active, true),
          created_by_staff_user_id: staff.staff_user_id,
          created_at: timestamp,
          updated_at: timestamp
        })
        .select('*')
        .single();
      if (error) throw error;
      await writeAuditLog({
        staff,
        action: 'operating_cost_template.created',
        targetType: 'readyroute_operating_cost_template',
        targetId: data.id,
        metadata: { vendor, amount_cents: amountCents }
      });
      return res.status(201).json({ template: presentOperatingCostTemplate(data) });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) return authResponse;
      console.error('ReadyRoute operating cost template create failed:', error);
      return res.status(500).json({ error: 'Unable to save the operating cost template.' });
    }
  });

  router.post('/operating-cost-templates/apply', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);
      const periodMonth = normalizePeriodMonth(req.body?.period_month, now());
      const [templatesResult, existingResult] = await Promise.all([
        supabase.from('readyroute_operating_cost_templates').select('*').eq('is_active', true),
        supabase.from('readyroute_operating_costs').select('template_id').eq('period_month', periodMonth).not('template_id', 'is', null)
      ]);
      const firstError = templatesResult.error || existingResult.error;
      if (firstError) throw firstError;
      const existingTemplateIds = new Set((existingResult.data || []).map((row) => row.template_id));
      const rows = (templatesResult.data || [])
        .filter((template) => !existingTemplateIds.has(template.id))
        .map((template) => ({
          period_month: periodMonth,
          category: template.category,
          vendor: template.vendor,
          amount_cents: template.default_amount_cents,
          billing_date: billingDateForPeriod(periodMonth, template.billing_day),
          is_recurring: true,
          notes: template.notes,
          template_id: template.id,
          created_by_staff_user_id: staff.staff_user_id,
          updated_at: now().toISOString()
        }));
      let inserted = [];
      if (rows.length) {
        const { data, error } = await supabase
          .from('readyroute_operating_costs')
          .insert(rows)
          .select('*');
        if (error) throw error;
        inserted = data || [];
      }
      await writeAuditLog({
        staff,
        action: 'operating_cost_templates.applied',
        targetType: 'readyroute_operating_cost',
        metadata: { period_month: periodMonth, inserted_count: inserted.length }
      });
      return res.status(200).json({
        period_month: periodMonth,
        inserted_count: inserted.length,
        skipped_count: (templatesResult.data || []).length - inserted.length,
        operating_costs: inserted.map(presentOperatingCost)
      });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) return authResponse;
      console.error('ReadyRoute operating cost template apply failed:', error);
      return res.status(500).json({ error: 'Unable to apply recurring cost templates.' });
    }
  });

  router.post('/operating-costs/import', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);
      const sourceRows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 500) : [];
      if (!sourceRows.length) return res.status(400).json({ error: 'At least one CSV row is required.' });
      const importBatchId = crypto.randomUUID();
      const rows = sourceRows.map((row, index) => {
        const vendor = normalizeText(row.vendor || row.tool || row.description, 180);
        const amountCents = row.amount_cents !== undefined
          ? normalizeCents(row.amount_cents, -1)
          : Math.round(Number(row.amount || row.cost || -1) * 100);
        if (!vendor || !Number.isFinite(amountCents) || amountCents < 0) {
          const error = new Error(`CSV row ${index + 2} needs a vendor and nonnegative amount.`);
          error.status = 400;
          throw error;
        }
        const periodMonth = normalizePeriodMonth(row.period_month || row.month, now());
        return {
          period_month: periodMonth,
          category: normalizeOperatingCostCategory(row.category),
          vendor,
          amount_cents: amountCents,
          billing_date: normalizeDateOnly(row.billing_date || row.date, periodMonth),
          is_recurring: normalizeBoolean(row.is_recurring ?? row.recurring, false),
          notes: normalizeText(row.notes, 2000),
          receipt_url: normalizeText(row.receipt_url, 1000),
          import_batch_id: importBatchId,
          created_by_staff_user_id: staff.staff_user_id,
          updated_at: now().toISOString()
        };
      });
      const { data, error } = await supabase
        .from('readyroute_operating_costs')
        .insert(rows)
        .select('*');
      if (error) throw error;
      await writeAuditLog({
        staff,
        action: 'operating_costs.imported',
        targetType: 'readyroute_operating_cost',
        targetId: importBatchId,
        metadata: { import_batch_id: importBatchId, row_count: rows.length }
      });
      return res.status(201).json({
        import_batch_id: importBatchId,
        imported_count: rows.length,
        operating_costs: (data || []).map(presentOperatingCost)
      });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) return authResponse;
      if (error.status === 400) return res.status(400).json({ error: error.message });
      console.error('ReadyRoute operating costs CSV import failed:', error);
      return res.status(500).json({ error: 'Unable to import operating costs.' });
    }
  });

  router.get('/company-signups', async (req, res) => {
    try {
      await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ROLES, supabase);
      const { data, error } = await supabase
        .from('early_access_signups')
        .select('id, name, email, phone_number, company_csa, role, driver_count, billing_interval, billing_setup_status, account_id, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const signups = (data || []).map(presentCompanySignup);
      return res.status(200).json({ signups, pending_signups: signups.filter((signup) => !signup.account_id) });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) return authResponse;
      console.error('ReadyRoute company signup queue failed:', error);
      return res.status(500).json({ error: 'Unable to load company signups.' });
    }
  });

  router.post('/accounts', async (req, res) => {
    let createdAccountId = null;
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_WRITE_ROLES, supabase);
      const companyName = normalizeText(req.body?.company_name, 180);
      const managerName = normalizeText(req.body?.manager_name, 180);
      const managerEmail = normalizeEmail(req.body?.manager_email);

      if (!companyName || !managerName || !isValidEmail(managerEmail)) {
        return res.status(400).json({ error: 'Company name, manager name, and a valid manager email are required.' });
      }

      const existing = await supabase
        .from('manager_users')
        .select('id, password_hash, full_name')
        .eq('email', managerEmail)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (existing.error) throw existing.error;

      const signupLookup = await supabase
        .from('early_access_signups')
        .select('id, stripe_customer_id, stripe_payment_method_id, billing_setup_status, billing_policy_version, billing_consent_at, billing_interval')
        .eq('email', managerEmail)
        .maybeSingle();
      if (signupLookup.error) throw signupLookup.error;
      const signup = signupLookup.data;

      const inaccessiblePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .insert({
          company_name: companyName,
          manager_email: managerEmail,
          manager_password_hash: inaccessiblePasswordHash,
          vehicle_count: 0,
          plan: 'starter',
          subscription_status: 'incomplete',
          stripe_customer_id: signup?.stripe_customer_id || null,
          stripe_default_payment_method_id: signup?.stripe_payment_method_id || null,
          billing_setup_status: signup?.billing_setup_status || 'not_started',
          billing_activation_status: signup?.billing_setup_status === 'succeeded' ? 'ready' : 'not_started',
          billing_interval: signup?.billing_interval || 'monthly',
          billing_policy_version: signup?.billing_policy_version || null,
          billing_consent_at: signup?.billing_consent_at || null
        })
        .select('id, company_name, manager_email, subscription_status, plan, created_at')
        .single();
      if (accountError || !account) throw accountError || new Error('Account was not created');
      createdAccountId = account.id;

      if (signup?.id) {
        const { error: signupUpdateError } = await supabase
          .from('early_access_signups')
          .update({ account_id: account.id, updated_at: now().toISOString() })
          .eq('id', signup.id);
        if (signupUpdateError) throw signupUpdateError;
      }

      const invitedAt = now().toISOString();
      const linkedExistingManager = Boolean(existing.data?.password_hash);
      const { data: manager, error: managerError } = await supabase
        .from('manager_users')
        .insert({
          account_id: account.id,
          email: managerEmail,
          full_name: managerName,
          password_hash: linkedExistingManager ? existing.data.password_hash : null,
          is_active: true,
          invited_at: invitedAt,
          accepted_at: linkedExistingManager ? invitedAt : null
        })
        .select('id, account_id, email, full_name, invited_at')
        .single();
      if (managerError || !manager) throw managerError || new Error('Manager was not created');

      await supabase.from('account_internal_profiles').upsert({
        account_id: account.id,
        lifecycle_status: 'onboarding',
        onboarding_stage: 'manager_invited',
        updated_at: invitedAt
      }, { onConflict: 'account_id' });

      let inviteUrl = null;
      let delivery = { delivered: false, skipped: true };
      if (!linkedExistingManager) {
        const inviteToken = signToken({
          account_id: account.id,
          manager_user_id: manager.id,
          email: manager.email,
          purpose: 'manager_invite'
        }, '7d');
        inviteUrl = buildManagerInviteUrl(inviteToken);
        try {
          delivery = await sendManagerInviteEmail({
            to: manager.email,
            fullName: manager.full_name,
            inviteUrl,
            companyName: account.company_name,
            inviterName: staff.full_name || staff.email || 'Ready Route'
          });
        } catch (emailError) {
          console.error('Staff company manager invite delivery failed:', emailError);
          delivery = { delivered: false, skipped: false };
        }
      }

      await writeAuditLog({
        staff,
        action: 'company.created',
        targetType: 'account',
        targetId: account.id,
        accountId: account.id,
        metadata: { manager_email: manager.email }
      });

      return res.status(201).json({
        account,
        manager: { ...manager, access_status: linkedExistingManager ? 'active' : 'invited' },
        invitation: {
          email_delivery: linkedExistingManager ? 'not_required' : delivery.delivered ? 'sent' : delivery.skipped ? 'not_configured' : 'failed',
          invite_url: delivery.delivered ? null : inviteUrl
        }
      });
    } catch (error) {
      if (createdAccountId) {
        await supabase.from('accounts').delete().eq('id', createdAccountId);
      }
      const authResponse = sendAuthError(res, error);
      if (authResponse) return authResponse;
      console.error('ReadyRoute company creation failed:', error);
      return res.status(500).json({ error: 'Unable to create the company and manager invitation.' });
    }
  });

  router.post('/accounts/:accountId/billing/activate', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);
      const accountId = normalizeText(req.params.accountId, 120);
      const companyName = normalizeText(req.body?.confirm_company_name, 180);
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, company_name, rra_billing_treatment, billing_activation_status, stripe_subscription_id')
        .eq('id', accountId)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account) return res.status(404).json({ error: 'Account not found.' });
      if (account.rra_billing_treatment === 'complimentary') {
        return res.status(409).json({ error: 'Complimentary accounts do not require billing activation.' });
      }
      if (companyName !== account.company_name) {
        return res.status(400).json({ error: 'Type the company name exactly to confirm live billing.' });
      }

      const result = await subscriptionActivationService.activateSubscription(accountId);
      await writeAuditLog({
        staff,
        action: 'company.billing_activated',
        targetType: 'account',
        targetId: accountId,
        accountId,
        metadata: {
          subscription_id: result.subscription_id,
          active_driver_count: result.active_driver_count,
          billing_interval: result.billing_interval
        }
      });
      return res.status(result.already_exists ? 200 : 201).json(result);
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) return authResponse;
      if (['PAYMENT_SETUP_REQUIRED', 'ACTIVE_DRIVER_REQUIRED'].includes(error.code)) {
        return res.status(409).json({ error: error.message, code: error.code });
      }
      if (['STRIPE_ACTIVATION_DISABLED', 'STRIPE_TAX_NOT_READY', 'LIVE_BILLING_NOT_APPROVED'].includes(error.code)) {
        return res.status(503).json({ error: error.message, code: error.code });
      }
      console.error('ReadyRoute staff billing activation failed:', error);
      return res.status(500).json({ error: 'Unable to activate company billing.' });
    }
  });

  router.post('/accounts/:accountId/managers/:managerId/invite', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_WRITE_ROLES, supabase);
      const accountId = normalizeText(req.params.accountId, 120);
      const managerId = normalizeText(req.params.managerId, 120);
      const [{ data: account, error: accountError }, { data: manager, error: managerError }] = await Promise.all([
        supabase
          .from('accounts')
          .select('id, company_name')
          .eq('id', accountId)
          .maybeSingle(),
        supabase
          .from('manager_users')
          .select('id, account_id, email, full_name, password_hash, is_active, invited_at, accepted_at')
          .eq('id', managerId)
          .eq('account_id', accountId)
          .maybeSingle()
      ]);

      if (accountError || managerError) throw accountError || managerError;
      if (!account || !manager) return res.status(404).json({ error: 'Company manager invitation not found.' });
      if (manager.is_active === false) return res.status(409).json({ error: 'Reactivate this manager before sending an invitation.' });
      if (manager.password_hash || manager.accepted_at) {
        return res.status(409).json({ error: 'This manager has already activated their account.' });
      }

      const invitedAt = now().toISOString();
      const inviteToken = signToken({
        account_id: account.id,
        manager_user_id: manager.id,
        email: manager.email,
        purpose: 'manager_invite'
      }, '7d');
      const inviteUrl = buildManagerInviteUrl(inviteToken);
      const { data: updatedManager, error: updateError } = await supabase
        .from('manager_users')
        .update({ invited_at: invitedAt, accepted_at: null })
        .eq('id', manager.id)
        .eq('account_id', account.id)
        .select('id, account_id, email, full_name, is_active, invited_at, accepted_at')
        .maybeSingle();
      if (updateError) throw updateError;

      let delivery = { delivered: false, skipped: true, reason: 'Email service is not configured' };
      try {
        delivery = await sendManagerInviteEmail({
          to: manager.email,
          fullName: manager.full_name,
          inviteUrl,
          companyName: account.company_name,
          inviterName: staff.staff_name || staff.staff_email || 'Ready Route'
        });
      } catch (emailError) {
        console.error('Staff manager invite resend delivery failed:', emailError);
        delivery = { delivered: false, skipped: false, reason: 'Email delivery failed' };
      }

      await writeAuditLog({
        staff,
        action: 'company.manager_invite_resent',
        targetType: 'manager_user',
        targetId: manager.id,
        accountId: account.id,
        metadata: {
          email: manager.email,
          email_delivered: Boolean(delivery.delivered),
          provider_message_id: delivery.provider_id || null
        }
      });

      return res.status(200).json({
        manager: { ...updatedManager, access_status: 'invited' },
        email_delivery: delivery,
        invite_url: delivery.delivered ? null : inviteUrl
      });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) return authResponse;
      console.error('ReadyRoute manager invite resend failed:', error);
      return res.status(500).json({ error: 'Unable to resend the manager invitation.' });
    }
  });

  router.get('/accounts', async (req, res) => {
    try {
      await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ROLES, supabase);

      const [accountsResult, profilesResult, managersResult, driversResult, ticketsResult] = await Promise.all([
        supabase
          .from('accounts')
          .select('id, company_name, manager_email, subscription_status, plan, vehicle_count, stripe_customer_id, stripe_subscription_id, billing_setup_status, billing_activation_status, billing_access_status, billing_interval, billed_driver_count, rra_billing_treatment, rra_complimentary_reason, rra_billing_treatment_updated_at, account_status, cancellation_requested_at, service_ends_at, retention_ends_at, canceled_at, cancellation_reason, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('account_internal_profiles')
          .select('account_id, lifecycle_status, onboarding_stage, internal_notes, internal_owner_staff_user_id, updated_at'),
        supabase
          .from('manager_users')
          .select('account_id, is_active'),
        supabase
          .from('drivers')
          .select('account_id, is_active'),
        supabase
          .from('support_tickets')
          .select('id, account_id, ticket_reference, subject, status, priority, created_at')
          .order('created_at', { ascending: false })
          .limit(1000)
      ]);

      const firstError = [accountsResult, profilesResult, managersResult, driversResult, ticketsResult]
        .find((result) => result.error)?.error;

      if (firstError) {
        throw firstError;
      }

      const profilesByAccount = mapByAccount(profilesResult.data || []);
      const activeManagersByAccount = countByAccount(managersResult.data || [], (manager) => manager.is_active !== false);
      const activeDriversByAccount = countByAccount(driversResult.data || [], (driver) => driver.is_active !== false);
      const openTicketsByAccount = countByAccount(ticketsResult.data || [], (ticket) => !['resolved', 'closed'].includes(ticket.status));
      const urgentTicketsByAccount = countByAccount(ticketsResult.data || [], (ticket) => ['urgent', 'high'].includes(ticket.priority) && !['resolved', 'closed'].includes(ticket.status));
      const latestTicketByAccount = latestByAccount(ticketsResult.data || []);

      const accounts = filterProductionRows(accountsResult.data || [], ['company_name', 'manager_email'])
        .filter((account) => !['smoke_test', 'app_review'].includes(account.subscription_status))
        .map((account) => presentAccountSummary(
        account,
        profilesByAccount[account.id],
        {
          activeManagers: activeManagersByAccount[account.id],
          activeDrivers: activeDriversByAccount[account.id],
          openTickets: openTicketsByAccount[account.id],
          urgentTickets: urgentTicketsByAccount[account.id]
        },
        latestTicketByAccount[account.id]
        ));

      return res.status(200).json({ accounts });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff accounts list failed:', error);
      return res.status(500).json({ error: 'Unable to load ReadyRoute accounts.' });
    }
  });

  router.post('/accounts/:accountId/access-sessions', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_WRITE_ROLES, supabase);
      const accountId = normalizeText(req.params.accountId, 120);
      const reason = normalizeText(req.body?.reason, 1000);
      const supportTicketId = normalizeText(req.body?.support_ticket_id, 120);

      if (!reason || reason.length < 10) {
        return res.status(400).json({ error: 'Explain why company access is needed in at least 10 characters.' });
      }

      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, company_name')
        .eq('id', accountId)
        .maybeSingle();
      if (accountError) {
        throw accountError;
      }
      if (!account) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      if (supportTicketId) {
        const { data: supportTicket, error: supportTicketError } = await supabase
          .from('support_tickets')
          .select('id')
          .eq('id', supportTicketId)
          .eq('account_id', accountId)
          .maybeSingle();
        if (supportTicketError) {
          throw supportTicketError;
        }
        if (!supportTicket) {
          return res.status(400).json({ error: 'The selected support ticket does not belong to this company.' });
        }
      }

      const timestamp = now();
      const expiresAt = new Date(timestamp.getTime() + 30 * 60 * 1000).toISOString();
      const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      const { data, error } = await supabase
        .from('readyroute_staff_company_access_sessions')
        .insert({
          staff_user_id: staff.staff_user_id,
          account_id: accountId,
          support_ticket_id: supportTicketId,
          reason,
          status: 'active',
          expires_at: expiresAt,
          request_ip: normalizeText(forwardedFor || req.ip, 120),
          user_agent: normalizeText(req.get('user-agent'), 500),
          created_at: timestamp.toISOString()
        })
        .select('*')
        .single();
      if (error) {
        throw error;
      }

      await writeAuditLog({
        staff,
        action: 'company_support_view.started',
        targetType: 'account',
        targetId: accountId,
        accountId,
        metadata: {
          access_session_id: data.id,
          reason,
          support_ticket_id: supportTicketId,
          expires_at: expiresAt
        }
      });

      return res.status(201).json({
        access_session: data,
        account: { id: account.id, company_name: account.company_name }
      });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }
      console.error('ReadyRoute company support view start failed:', error);
      return res.status(500).json({ error: 'Unable to start the company support view.' });
    }
  });

  router.get('/accounts/:accountId/support-view', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_WRITE_ROLES, supabase);
      const accountId = normalizeText(req.params.accountId, 120);
      const sessionId = normalizeText(req.query?.session_id, 120);
      const accessSession = await loadActiveCompanyAccessSession({ sessionId, accountId, staff });

      if (!accessSession) {
        return res.status(403).json({ error: 'This Support View session has ended or expired.' });
      }

      const [accountResult, managersResult, driversResult, vehiclesResult, routesResult, inspectionsResult, ticketsResult] = await Promise.all([
        supabase
          .from('accounts')
          .select('id, company_name, manager_email, subscription_status, plan, account_status, created_at')
          .eq('id', accountId)
          .maybeSingle(),
        supabase
          .from('manager_users')
          .select('id, full_name, email, is_active, accepted_at, created_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false }),
        supabase
          .from('drivers')
          .select('id, name, email, is_active, created_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false }),
        supabase
          .from('vehicles')
          .select('id, name, make, model, year, plate, truck_type, is_active, current_mileage')
          .eq('account_id', accountId)
          .order('name', { ascending: true })
          .limit(250),
        supabase
          .from('routes')
          .select('id, work_area_name, date, status, dispatch_state, total_stops, completed_stops, created_at')
          .eq('account_id', accountId)
          .order('date', { ascending: false })
          .limit(50),
        supabase
          .from('vehicle_inspections')
          .select('id, vehicle_id, inspection_date, status, issue_reported, submitted_by_type, submitted_by_name, submitted_at, created_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('support_tickets')
          .select('id, ticket_reference, subject, category, priority, status, created_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(50)
      ]);
      const firstError = [accountResult, managersResult, driversResult, vehiclesResult, routesResult, inspectionsResult, ticketsResult]
        .find((result) => result.error)?.error;
      if (firstError) {
        throw firstError;
      }
      if (!accountResult.data) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      await writeAuditLog({
        staff,
        action: 'company_support_view.viewed',
        targetType: 'account',
        targetId: accountId,
        accountId,
        metadata: { access_session_id: accessSession.id, surface: 'company_overview' }
      });

      return res.status(200).json({
        access_session: accessSession,
        read_only: true,
        account: accountResult.data,
        managers: managersResult.data || [],
        drivers: driversResult.data || [],
        vehicles: vehiclesResult.data || [],
        routes: routesResult.data || [],
        inspections: inspectionsResult.data || [],
        support_tickets: ticketsResult.data || []
      });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }
      console.error('ReadyRoute company support view failed:', error);
      return res.status(500).json({ error: 'Unable to load the company support view.' });
    }
  });

  router.delete('/accounts/:accountId/access-sessions/:sessionId', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_WRITE_ROLES, supabase);
      const accountId = normalizeText(req.params.accountId, 120);
      const sessionId = normalizeText(req.params.sessionId, 120);
      const { data, error } = await supabase
        .from('readyroute_staff_company_access_sessions')
        .update({ status: 'ended', ended_at: now().toISOString() })
        .eq('id', sessionId)
        .eq('account_id', accountId)
        .eq('staff_user_id', staff.staff_user_id)
        .eq('status', 'active')
        .select('id')
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!data) {
        return res.status(404).json({ error: 'Active Support View session not found.' });
      }

      await writeAuditLog({
        staff,
        action: 'company_support_view.ended',
        targetType: 'account',
        targetId: accountId,
        accountId,
        metadata: { access_session_id: sessionId }
      });
      return res.status(200).json({ message: 'Support View ended.' });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }
      console.error('ReadyRoute company support view end failed:', error);
      return res.status(500).json({ error: 'Unable to end the company support view.' });
    }
  });

  router.get('/accounts/:accountId', async (req, res) => {
    try {
      await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ROLES, supabase);
      const accountId = normalizeText(req.params.accountId, 120);

      const accountResult = await supabase
        .from('accounts')
        .select('id, company_name, manager_email, subscription_status, plan, stripe_customer_id, stripe_subscription_id, billing_setup_status, billing_activation_status, billing_access_status, billing_interval, billed_driver_count, rra_billing_treatment, rra_complimentary_reason, rra_billing_treatment_updated_at, account_status, driver_help_monthly_report_enabled, driver_help_minutes_per_answer_estimate, created_at')
        .eq('id', accountId)
        .maybeSingle();

      if (accountResult.error) {
        throw accountResult.error;
      }

      if (!accountResult.data) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      const [
        profile,
        managersResult,
        driversResult,
        ticketsResult,
        billingSettingsResult,
        billingRoutesResult,
        routesResult,
        auditLogsResult,
        interactionsResult,
        feedbackResult,
        unansweredResult,
        monthlyReportsResult
      ] = await Promise.all([
        loadAccountInternalProfile(accountId),
        supabase
          .from('manager_users')
          .select('id, email, full_name, is_active, invited_at, accepted_at, created_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false }),
        supabase
          .from('drivers')
          .select('id, name, email, is_active, created_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false }),
        supabase
          .from('support_tickets')
          .select('id, ticket_reference, requester_name, requester_email, category, priority, status, subject, description, created_at, updated_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('account_billing_settings')
          .select('account_id, committed_route_count, billing_rate_cents, currency, is_billing_exempt, billing_notes, updated_at')
          .eq('account_id', accountId)
          .maybeSingle(),
        supabase
          .from('billable_route_months')
          .select('id, billing_period_start, billing_period_end, route_key, route_display_name, first_imported_at, last_imported_at, status')
          .eq('account_id', accountId)
          .order('last_imported_at', { ascending: false })
          .limit(50),
        supabase
          .from('routes')
          .select('id, work_area_name, date, status, dispatch_state, total_stops, completed_stops, created_at')
          .eq('account_id', accountId)
          .order('date', { ascending: false })
          .limit(50),
        supabase
          .from('readyroute_staff_audit_log')
          .select('id, staff_user_id, staff_email, action, target_type, target_id, account_id, metadata, created_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('driver_help_interactions')
          .select('id, session_id, driver_id, question, response_mode, selected_knowledge_ids, response_latency_ms, created_at')
          .eq('account_id', accountId)
          .gte('created_at', getUtcMonthStart(now()))
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('driver_help_feedback')
          .select('id, interaction_id, driver_id, rating, comment, created_at')
          .eq('account_id', accountId)
          .gte('created_at', getUtcMonthStart(now()))
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('driver_help_unanswered_questions')
          .select('id, interaction_id, driver_id, question, status, created_at, resolved_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('driver_help_monthly_report_deliveries')
          .select('id, report_month, recipient_email, metrics, delivery_status, delivered_at, created_at')
          .eq('account_id', accountId)
          .order('report_month', { ascending: false })
          .limit(24)
      ]);

      const firstError = [
        managersResult,
        driversResult,
        ticketsResult,
        billingSettingsResult,
        billingRoutesResult,
        routesResult,
        auditLogsResult,
        interactionsResult,
        feedbackResult,
        unansweredResult,
        monthlyReportsResult
      ].find((result) => result.error)?.error;

      if (firstError) {
        throw firstError;
      }

      const supportTickets = ticketsResult.data || [];
      const auditLogs = (auditLogsResult.data || []).map(presentAuditLog);
      const interactions = interactionsResult.data || [];
      const feedback = feedbackResult.data || [];
      const minutesPerAnswer = Number(accountResult.data.driver_help_minutes_per_answer_estimate || 5);
      const usageMetrics = buildDriverHelpMetrics(interactions, feedback, minutesPerAnswer);
      const driverMetrics = buildDriverMetrics(interactions, feedback, driversResult.data || []);
      const account = presentAccountSummary(
        accountResult.data,
        profile,
        {
          activeManagers: (managersResult.data || []).filter((manager) => manager.is_active !== false).length,
          activeDrivers: (driversResult.data || []).filter((driver) => driver.is_active !== false).length,
          openTickets: supportTickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status)).length,
          urgentTickets: supportTickets.filter((ticket) => ['urgent', 'high'].includes(ticket.priority) && !['resolved', 'closed'].includes(ticket.status)).length
        },
        supportTickets[0] || null
      );

      return res.status(200).json({
        account,
        managers: managersResult.data || [],
        drivers: driversResult.data || [],
        support_tickets: supportTickets,
        billing_settings: billingSettingsResult.data || null,
        billing_routes: billingRoutesResult.data || [],
        routes: routesResult.data || [],
        audit_logs: auditLogs,
        driver_help: {
          month_start: getUtcMonthStart(now()).slice(0, 10),
          metrics: usageMetrics,
          driver_metrics: driverMetrics,
          recent_interactions: interactions.slice(0, 100),
          recent_feedback: feedback.slice(0, 100),
          unanswered_questions: unansweredResult.data || [],
          monthly_reports: monthlyReportsResult.data || []
        },
        timeline: buildAccountTimeline({
          account: accountResult.data,
          profile,
          supportTickets,
          auditLogs,
          billingRoutes: billingRoutesResult.data || []
        })
      });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff account detail failed:', error);
      return res.status(500).json({ error: 'Unable to load ReadyRoute account.' });
    }
  });

  router.patch('/accounts/:accountId/rra-billing-treatment', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_WRITE_ROLES, supabase);
      const accountId = normalizeText(req.params.accountId, 120);
      const treatment = normalizeText(req.body?.treatment, 40).toLowerCase();
      const reason = normalizeText(req.body?.reason, 1000);

      if (!['standard', 'complimentary'].includes(treatment)) {
        return res.status(400).json({ error: 'Choose standard or complimentary billing.' });
      }

      if (treatment === 'complimentary' && !reason) {
        return res.status(400).json({ error: 'Add an internal reason for complimentary service.' });
      }

      const { data: existingAccount, error: accountLookupError } = await supabase
        .from('accounts')
        .select('id, company_name, rra_billing_treatment, billing_activation_status, stripe_subscription_id')
        .eq('id', accountId)
        .maybeSingle();
      if (accountLookupError) throw accountLookupError;
      if (!existingAccount) {
        return res.status(404).json({ error: 'Account not found.' });
      }
      if (treatment === 'complimentary' && existingAccount.stripe_subscription_id) {
        return res.status(409).json({ error: 'End the active paid subscription before changing this company to complimentary.' });
      }

      const updatedAt = now().toISOString();
      const { error: updateError } = await supabase.rpc('readyroute_set_rra_billing_treatment', {
        p_account_id: accountId,
        p_treatment: treatment,
        p_reason: treatment === 'complimentary' ? reason : null,
        p_updated_at: updatedAt
      });
      if (updateError) throw updateError;

      await writeAuditLog({
        staff,
        action: 'account.rra_billing_treatment_updated',
        targetType: 'account',
        targetId: accountId,
        accountId,
        metadata: {
          previous_treatment: existingAccount.rra_billing_treatment || 'standard',
          treatment,
          reason: treatment === 'complimentary' ? reason : null
        }
      });

      return res.status(200).json({
        account: {
          id: accountId,
          company_name: existingAccount.company_name,
          rra_billing_treatment: treatment,
          rra_complimentary_reason: treatment === 'complimentary' ? reason : null,
          rra_billing_treatment_updated_at: updatedAt
        }
      });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) return authResponse;
      console.error('ReadyRoute Answers billing treatment update failed:', error);
      return res.status(500).json({ error: 'Unable to update Ready Route Answers billing treatment.' });
    }
  });

  router.patch('/accounts/:accountId/internal-profile', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_WRITE_ROLES, supabase);
      const accountId = normalizeText(req.params.accountId, 120);

      if (!accountId) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id')
        .eq('id', accountId)
        .maybeSingle();

      if (accountError) {
        throw accountError;
      }

      if (!account) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      const profilePayload = {
        account_id: accountId,
        updated_at: now().toISOString()
      };

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'lifecycle_status')) {
        profilePayload.lifecycle_status = normalizeLifecycleStatus(req.body.lifecycle_status);
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'onboarding_stage')) {
        profilePayload.onboarding_stage = normalizeText(req.body.onboarding_stage, 180);
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'internal_notes')) {
        profilePayload.internal_notes = normalizeText(req.body.internal_notes, 12000);
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'internal_owner_staff_user_id')) {
        profilePayload.internal_owner_staff_user_id = normalizeText(req.body.internal_owner_staff_user_id, 120);
      }

      const { data, error } = await supabase
        .from('account_internal_profiles')
        .upsert(profilePayload, { onConflict: 'account_id' })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      await writeAuditLog({
        staff,
        action: 'account.profile_updated',
        targetType: 'account_internal_profile',
        targetId: accountId,
        accountId,
        metadata: {
          lifecycle_status: data.lifecycle_status,
          onboarding_stage: data.onboarding_stage
        }
      });

      return res.status(200).json({ internal_profile: data });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff account profile update failed:', error);
      return res.status(500).json({ error: 'Unable to update account profile.' });
    }
  });

  router.post('/accounts/:accountId/recover', async (req, res) => {
    try {
      const staff = await getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES, supabase);
      const accountId = normalizeText(req.params.accountId, 120);
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, company_name, account_status, stripe_subscription_id, retention_ends_at')
        .eq('id', accountId)
        .maybeSingle();

      if (accountError) {
        throw accountError;
      }

      if (!account) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      if (!['canceling', 'retained'].includes(account.account_status)) {
        return res.status(409).json({ error: 'This account is not scheduled for cancellation.' });
      }

      const billingResume = await billingService.resumeAccountSubscription(accountId);
      const recoveredAt = now().toISOString();
      const { data: recoveredAccount, error: updateError } = await supabase
        .from('accounts')
        .update({
          account_status: 'active',
          cancellation_requested_at: null,
          service_ends_at: null,
          retention_ends_at: null,
          canceled_at: null,
          cancellation_reason: null
        })
        .eq('id', accountId)
        .select('id, company_name, manager_email, subscription_status, plan, vehicle_count, stripe_customer_id, stripe_subscription_id, account_status, cancellation_requested_at, service_ends_at, retention_ends_at, canceled_at, cancellation_reason, created_at')
        .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      const { error: eventError } = await supabase
        .from('account_cancellation_events')
        .insert({
          account_id: accountId,
          event_type: 'recovered',
          requested_by_staff_user_id: staff.staff_user_id,
          actor_email: staff.staff_email,
          metadata: {
            recovered_at: recoveredAt,
            subscription_resumed: billingResume.resumed,
            subscription_id: billingResume.subscription_id || null
          }
        });

      if (eventError) {
        throw eventError;
      }

      await writeAuditLog({
        staff,
        action: 'account.recovered',
        targetType: 'account',
        targetId: accountId,
        accountId,
        metadata: {
          previous_status: account.account_status,
          subscription_resumed: billingResume.resumed
        }
      });

      return res.status(200).json({
        account: recoveredAccount,
        subscription_resumed: billingResume.resumed,
        billing_reactivation_required: !billingResume.resumed && Boolean(account.stripe_subscription_id)
      });
    } catch (error) {
      const authResponse = sendAuthError(res, error);
      if (authResponse) {
        return authResponse;
      }

      console.error('ReadyRoute staff account recovery failed:', error);
      return res.status(500).json({ error: 'Unable to recover ReadyRoute account.' });
    }
  });

  return router;
}

module.exports = createReadyRouteStaffRouter();
module.exports.createReadyRouteStaffRouter = createReadyRouteStaffRouter;
