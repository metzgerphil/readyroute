const express = require('express');
const bcrypt = require('bcrypt');

const defaultSupabase = require('../lib/supabase');
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

function getRequestStaff(req, jwtSecret, allowedRoles = READYROUTE_STAFF_ROLES) {
  return readRequiredStaffContext(req, jwtSecret, allowedRoles);
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

function createReadyRouteStaffRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const now = options.now || (() => new Date());

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

  router.post('/bootstrap', async (req, res) => {
    const configuredSecret = String(process.env.READYROUTE_STAFF_BOOTSTRAP_SECRET || '').trim();
    const providedSecret = String(req.get('x-readyroute-bootstrap-secret') || req.body?.bootstrap_secret || '').trim();

    if (!configuredSecret || providedSecret !== configuredSecret) {
      return res.status(404).json({ error: 'Not found' });
    }

    const email = normalizeEmail(req.body?.email);
    const fullName = normalizeText(req.body?.full_name || req.body?.name, 180);
    const password = String(req.body?.password || '');
    const role = normalizeStaffRole(req.body?.role, 'owner');
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

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const { data, error } = await supabase
        .from('readyroute_staff_users')
        .insert({
          email,
          full_name: fullName,
          password_hash: passwordHash,
          role,
          is_active: true,
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
      console.error('ReadyRoute staff bootstrap failed:', error);
      return res.status(500).json({ error: 'Unable to create ReadyRoute staff user.' });
    }
  });

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

      return res.status(200).json({
        token: signStaffToken(user, jwtSecret),
        user: presentStaffUser(user)
      });
    } catch (error) {
      console.error('ReadyRoute staff login failed:', error);
      return res.status(500).json({ error: 'Failed to log in ReadyRoute staff user.' });
    }
  });

  router.get('/me', async (req, res) => {
    try {
      const staff = getRequestStaff(req, jwtSecret);
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

  router.get('/users', async (req, res) => {
    try {
      getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES);

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
      const staff = getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES);
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
      const staff = getRequestStaff(req, jwtSecret, READYROUTE_STAFF_ADMIN_ROLES);
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

  router.get('/accounts', async (req, res) => {
    try {
      getRequestStaff(req, jwtSecret);

      const [accountsResult, profilesResult, managersResult, driversResult, ticketsResult] = await Promise.all([
        supabase
          .from('accounts')
          .select('id, company_name, manager_email, subscription_status, plan, vehicle_count, stripe_customer_id, stripe_subscription_id, created_at')
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

      const accounts = (accountsResult.data || []).map((account) => presentAccountSummary(
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

  router.get('/accounts/:accountId', async (req, res) => {
    try {
      getRequestStaff(req, jwtSecret);
      const accountId = normalizeText(req.params.accountId, 120);

      const accountResult = await supabase
        .from('accounts')
        .select('id, company_name, manager_email, subscription_status, plan, vehicle_count, stripe_customer_id, stripe_subscription_id, created_at')
        .eq('id', accountId)
        .maybeSingle();

      if (accountResult.error) {
        throw accountResult.error;
      }

      if (!accountResult.data) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      const [profile, managersResult, driversResult, ticketsResult] = await Promise.all([
        loadAccountInternalProfile(accountId),
        supabase
          .from('manager_users')
          .select('id, email, full_name, is_active, created_at, accepted_at')
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
          .limit(25)
      ]);

      const firstError = [managersResult, driversResult, ticketsResult].find((result) => result.error)?.error;

      if (firstError) {
        throw firstError;
      }

      const supportTickets = ticketsResult.data || [];
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
        support_tickets: supportTickets
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

  router.patch('/accounts/:accountId/internal-profile', async (req, res) => {
    try {
      getRequestStaff(req, jwtSecret, READYROUTE_STAFF_WRITE_ROLES);
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

  return router;
}

module.exports = createReadyRouteStaffRouter();
module.exports.createReadyRouteStaffRouter = createReadyRouteStaffRouter;
