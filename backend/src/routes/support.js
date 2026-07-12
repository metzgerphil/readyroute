const express = require('express');
const jwt = require('jsonwebtoken');

const defaultSupabase = require('../lib/supabase');
const {
  READYROUTE_STAFF_ROLES,
  READYROUTE_STAFF_WRITE_ROLES,
  readRequiredStaffContext
} = require('../services/readyRouteStaffAuth');
const { sendSupportTicketNotification: defaultSendSupportTicketNotification } = require('../services/supportEmail');

const SUPPORT_CATEGORIES = new Set([
  'login',
  'routes',
  'manifest',
  'driver_app',
  'manager_portal',
  'vehicle_inspection',
  'vehicles',
  'billing',
  'maps_location',
  'onboarding',
  'bug',
  'feature_request',
  'other'
]);

const SUPPORT_URGENCIES = new Set([
  'blocking_today',
  'needs_help_soon',
  'question',
  'low'
]);

const SUPPORT_PRIORITIES = new Set([
  'low',
  'normal',
  'high',
  'urgent'
]);

const SUPPORT_STATUSES = new Set([
  'new',
  'open',
  'waiting_on_customer',
  'resolved',
  'closed'
]);

const SUPPORT_TICKET_LIST_COLUMNS = [
  'id',
  'ticket_reference',
  'account_id',
  'requester_type',
  'requester_name',
  'requester_email',
  'requester_phone',
  'requester_role',
  'company_name',
  'category',
  'urgency',
  'priority',
  'status',
  'subject',
  'description',
  'request_call',
  'source',
  'app_surface',
  'app_version',
  'page_url',
  'context',
  'internal_notes',
  'assigned_staff_user_id',
  'resolved_at',
  'closed_at',
  'created_at',
  'updated_at'
].join(', ');

function normalizeText(value, maxLength = 500) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeChoice(value, allowedValues, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  return allowedValues.has(normalized) ? normalized : fallback;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function priorityForUrgency(urgency) {
  if (urgency === 'blocking_today') {
    return 'urgent';
  }

  if (urgency === 'needs_help_soon') {
    return 'normal';
  }

  return 'low';
}

function buildTicketReference(now = new Date()) {
  const timestamp = now.getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RR-${timestamp}-${random}`;
}

function sanitizeJson(value, maxLength = 12000) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized.length > maxLength) {
      return null;
    }

    return JSON.parse(serialized);
  } catch (_error) {
    return null;
  }
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function buildAuthContext(payload = {}) {
  if (payload.role === 'manager' && payload.account_id) {
    return {
      account_id: payload.account_id,
      manager_user_id: payload.manager_user_id || null,
      driver_id: null,
      requester_type: 'manager',
      requester_name: payload.manager_name || payload.full_name || payload.name || null,
      requester_email: payload.manager_email || payload.email || null,
      company_name: payload.company_name || payload.csa_name || null,
      requester_role: payload.primary_role || 'manager'
    };
  }

  if (payload.role === 'driver' && payload.account_id && payload.driver_id) {
    return {
      account_id: payload.account_id,
      manager_user_id: null,
      driver_id: payload.driver_id,
      requester_type: 'driver',
      requester_name: payload.full_name || payload.name || null,
      requester_email: payload.email || null,
      company_name: payload.company_name || payload.csa_name || null,
      requester_role: payload.primary_role || 'driver'
    };
  }

  return null;
}

function readOptionalAuthContext(req, jwtSecret) {
  const token = extractBearerToken(req);

  if (!token) {
    return null;
  }

  if (!jwtSecret) {
    const error = new Error('Support auth is not configured.');
    error.status = 500;
    throw error;
  }

  try {
    return buildAuthContext(jwt.verify(token, jwtSecret));
  } catch (_error) {
    const error = new Error('Invalid or expired token');
    error.status = 401;
    throw error;
  }
}

function normalizeOptionalChoice(value, allowedValues) {
  const raw = String(value || '').trim();

  if (!raw || raw.toLowerCase() === 'all') {
    return null;
  }

  return normalizeChoice(raw, allowedValues, null);
}

function buildSupportTicketPayload(body = {}, req, authContext = null, now = new Date()) {
  const category = normalizeChoice(body.category || body.issue_type, SUPPORT_CATEGORIES, 'other');
  const urgency = normalizeChoice(body.urgency, SUPPORT_URGENCIES, 'question');
  const description = normalizeText(body.description || body.message || body.problem, 6000);
  const requesterName = normalizeText(body.name || authContext?.requester_name, 180);
  const requesterEmail = normalizeEmail(body.email || authContext?.requester_email);
  const subject = normalizeText(body.subject, 180) || (description ? description.slice(0, 90) : null);

  if (!requesterName) {
    return { error: 'Name is required.' };
  }

  if (!isValidEmail(requesterEmail)) {
    return { error: 'A valid email is required.' };
  }

  if (!description || description.length < 10) {
    return { error: 'Description must be at least 10 characters.' };
  }

  return {
    payload: {
      ticket_reference: buildTicketReference(now),
      account_id: authContext?.account_id || null,
      manager_user_id: authContext?.manager_user_id || null,
      driver_id: authContext?.driver_id || null,
      requester_type: authContext?.requester_type || 'public',
      requester_name: requesterName,
      requester_email: requesterEmail,
      requester_phone: normalizeText(body.phone || body.phone_number, 80),
      requester_role: normalizeText(body.role || authContext?.requester_role, 120),
      company_name: normalizeText(body.company || body.company_name || authContext?.company_name, 200),
      category,
      urgency,
      priority: priorityForUrgency(urgency),
      status: 'new',
      subject,
      description,
      request_call: normalizeBoolean(body.request_call || body.requestCall),
      source: normalizeText(body.source, 120) || 'support_form',
      app_surface: normalizeText(body.app_surface || body.surface, 120),
      app_version: normalizeText(body.app_version || body.appVersion, 80),
      page_url: normalizeText(body.page_url || body.url || body.path || body.screen, 800),
      user_agent: normalizeText(req.get('user-agent'), 500),
      context: sanitizeJson(body.context),
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    }
  };
}

function buildSupportTicketUpdate(body = {}, now = new Date()) {
  const updates = {};
  const errors = [];

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = normalizeOptionalChoice(body.status, SUPPORT_STATUSES);

    if (!status) {
      errors.push('Status is invalid.');
    } else {
      updates.status = status;

      if (status === 'resolved') {
        updates.resolved_at = now.toISOString();
      }

      if (status === 'closed') {
        updates.closed_at = now.toISOString();
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'priority')) {
    const priority = normalizeOptionalChoice(body.priority, SUPPORT_PRIORITIES);

    if (!priority) {
      errors.push('Priority is invalid.');
    } else {
      updates.priority = priority;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'internal_notes')) {
    updates.internal_notes = normalizeText(body.internal_notes, 12000);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'assigned_staff_user_id')) {
    updates.assigned_staff_user_id = normalizeText(body.assigned_staff_user_id, 120);
  }

  if (errors.length) {
    return { error: errors[0] };
  }

  if (!Object.keys(updates).length) {
    return { error: 'No supported ticket updates were provided.' };
  }

  updates.updated_at = now.toISOString();
  return { updates };
}

function createSupportRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const now = options.now || (() => new Date());
  const sendSupportTicketNotification = options.sendSupportTicketNotification || defaultSendSupportTicketNotification;

  router.get('/tickets', async (req, res) => {
    try {
      await readRequiredStaffContext(req, jwtSecret, READYROUTE_STAFF_ROLES, { supabase });

      const status = normalizeOptionalChoice(req.query.status, SUPPORT_STATUSES);
      const priority = normalizeOptionalChoice(req.query.priority, SUPPORT_PRIORITIES);
      const category = normalizeOptionalChoice(req.query.category, SUPPORT_CATEGORIES);
      const accountId = normalizeText(req.query.account_id, 120);
      const requestedLimit = Number(req.query.limit);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 250)
        : 100;

      let query = supabase
        .from('support_tickets')
        .select(SUPPORT_TICKET_LIST_COLUMNS);

      if (status) {
        query = query.eq('status', status);
      }

      if (priority) {
        query = query.eq('priority', priority);
      }

      if (category) {
        query = query.eq('category', category);
      }

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Support ticket list failed:', error);
        return res.status(500).json({ error: 'Unable to load support tickets.' });
      }

      return res.status(200).json({ tickets: data || [] });
    } catch (error) {
      if (error.status === 401) {
        return res.status(401).json({ error: error.message || 'Invalid or expired token' });
      }

      if (error.status === 403) {
        return res.status(403).json({ error: 'ReadyRoute staff access required.' });
      }

      console.error('Support ticket list endpoint failed:', error);
      return res.status(500).json({ error: 'Unable to load support tickets.' });
    }
  });

  router.get('/tickets/:ticketId', async (req, res) => {
    try {
      await readRequiredStaffContext(req, jwtSecret, READYROUTE_STAFF_ROLES, { supabase });

      const ticketId = normalizeText(req.params.ticketId, 120);

      if (!ticketId) {
        return res.status(404).json({ error: 'Support ticket not found.' });
      }

      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .maybeSingle();

      if (error) {
        console.error('Support ticket detail failed:', error);
        return res.status(500).json({ error: 'Unable to load support ticket.' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Support ticket not found.' });
      }

      return res.status(200).json({ ticket: data });
    } catch (error) {
      if (error.status === 401) {
        return res.status(401).json({ error: error.message || 'Invalid or expired token' });
      }

      if (error.status === 403) {
        return res.status(403).json({ error: 'ReadyRoute staff access required.' });
      }

      console.error('Support ticket detail endpoint failed:', error);
      return res.status(500).json({ error: 'Unable to load support ticket.' });
    }
  });

  router.patch('/tickets/:ticketId', async (req, res) => {
    try {
      await readRequiredStaffContext(req, jwtSecret, READYROUTE_STAFF_WRITE_ROLES, { supabase });

      const ticketId = normalizeText(req.params.ticketId, 120);
      const { updates, error: updateError } = buildSupportTicketUpdate(req.body, now());

      if (!ticketId) {
        return res.status(404).json({ error: 'Support ticket not found.' });
      }

      if (updateError) {
        return res.status(400).json({ error: updateError });
      }

      const { data, error } = await supabase
        .from('support_tickets')
        .update(updates)
        .eq('id', ticketId)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('Support ticket update failed:', error);
        return res.status(500).json({ error: 'Unable to update support ticket.' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Support ticket not found.' });
      }

      return res.status(200).json({ ticket: data });
    } catch (error) {
      if (error.status === 401) {
        return res.status(401).json({ error: error.message || 'Invalid or expired token' });
      }

      if (error.status === 403) {
        return res.status(403).json({ error: 'ReadyRoute staff access required.' });
      }

      console.error('Support ticket update endpoint failed:', error);
      return res.status(500).json({ error: 'Unable to update support ticket.' });
    }
  });

  router.post('/tickets', async (req, res) => {
    try {
      const authContext = readOptionalAuthContext(req, jwtSecret);
      const { payload, error } = buildSupportTicketPayload(req.body, req, authContext, now());

      if (error) {
        return res.status(400).json({ error });
      }

      const { data, error: insertError } = await supabase
        .from('support_tickets')
        .insert(payload)
        .select('id, ticket_reference, status, priority, created_at')
        .single();

      if (insertError) {
        console.error('Support ticket insert failed:', insertError);
        return res.status(500).json({ error: 'Unable to create support ticket.' });
      }

      let notification = {
        delivered: false,
        skipped: true,
        reason: 'Notification not attempted'
      };

      try {
        notification = await sendSupportTicketNotification({
          ticket: {
            ...payload,
            ...(data || {})
          }
        });
      } catch (notificationError) {
        console.error('Support ticket notification failed:', notificationError);
        notification = {
          delivered: false,
          skipped: false,
          reason: 'Notification failed'
        };
      }

      return res.status(201).json({
        ticket: data,
        notification: {
          delivered: Boolean(notification?.delivered),
          skipped: Boolean(notification?.skipped)
        }
      });
    } catch (error) {
      if (error.status === 401) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      console.error('Support ticket endpoint failed:', error);
      return res.status(500).json({ error: 'Unable to create support ticket.' });
    }
  });

  return router;
}

module.exports = createSupportRouter();
module.exports.createSupportRouter = createSupportRouter;
module.exports.buildSupportTicketPayload = buildSupportTicketPayload;
module.exports.buildAuthContext = buildAuthContext;
