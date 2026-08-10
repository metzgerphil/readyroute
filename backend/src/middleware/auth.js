const jwt = require('jsonwebtoken');

const defaultSupabase = require('../lib/supabase');
const {
  SESSION_SUBJECT_TYPES,
  getCredentialVersion
} = require('../services/credentialSession');

function getJwtSecret(override) {
  const secret = override || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Missing JWT_SECRET environment variable');
  }

  return secret;
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function sendInvalidSession(res, message = 'Invalid or expired token') {
  return res.status(401).json({ error: message });
}

async function loadCredentialSubject(supabase, payload) {
  switch (payload.auth_subject_type) {
    case SESSION_SUBJECT_TYPES.DRIVER: {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, account_id, pin, is_active')
        .eq('id', payload.auth_subject_id)
        .maybeSingle();
      if (error) throw error;
      return data && {
        id: data.id,
        account_id: data.account_id,
        credential_hash: data.pin,
        is_active: data.is_active !== false
      };
    }
    case SESSION_SUBJECT_TYPES.MANAGER_USER: {
      const { data, error } = await supabase
        .from('manager_users')
        .select('id, account_id, email, password_hash, is_active')
        .eq('id', payload.auth_subject_id)
        .maybeSingle();
      if (error) throw error;
      return data && {
        id: data.id,
        account_id: data.account_id,
        email: data.email,
        credential_hash: data.password_hash,
        is_active: data.is_active !== false
      };
    }
    case SESSION_SUBJECT_TYPES.ACCOUNT_MANAGER: {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, manager_email, manager_password_hash, account_status')
        .eq('id', payload.auth_subject_id)
        .maybeSingle();
      if (error) throw error;
      return data && {
        id: data.id,
        account_id: data.id,
        email: data.manager_email,
        credential_hash: data.manager_password_hash,
        is_active: data.account_status !== 'retained'
      };
    }
    default:
      return null;
  }
}

async function validateCredentialSession(supabase, payload) {
  if (!payload.auth_subject_type || !payload.auth_subject_id || !payload.auth_version) {
    return false;
  }

  const subject = await loadCredentialSubject(supabase, payload);
  if (!subject?.is_active || !subject.credential_hash) {
    return false;
  }

  if (subject.account_id !== payload.account_id) {
    return false;
  }

  if (
    payload.role === 'driver' &&
    payload.driver_mode_source !== 'manager' &&
    subject.id !== payload.driver_id
  ) {
    return false;
  }

  if (
    payload.role === 'manager' &&
    payload.manager_email &&
    subject.email &&
    subject.email.toLowerCase() !== String(payload.manager_email).toLowerCase()
  ) {
    return false;
  }

  return getCredentialVersion(subject.credential_hash) === payload.auth_version;
}

function createAuthMiddleware(options = {}) {
  const supabase = options.supabase || defaultSupabase;
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const enforceSessionValidation = options.enforceSessionValidation ?? process.env.NODE_ENV === 'production';

  async function verifyJwt(req, res) {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authorization token required' });
      return null;
    }

    try {
      const payload = jwt.verify(token, getJwtSecret(jwtSecret));
      if (enforceSessionValidation && !(await validateCredentialSession(supabase, payload))) {
        sendInvalidSession(res, 'Session ended. Sign in again.');
        return null;
      }
      return payload;
    } catch (error) {
      if (error?.status) {
        throw error;
      }
      sendInvalidSession(res);
      return null;
    }
  }

  async function requireDriver(req, res, next) {
    try {
      if (req.driver?.driver_id && req.driver?.account_id && req.driver?.role === 'driver') {
        return next();
      }

      const payload = await verifyJwt(req, res);
      if (!payload) return;

      if (payload.role !== 'driver' || !payload.driver_id || !payload.account_id) {
        return res.status(403).json({ error: 'Driver access required' });
      }

      req.driver = {
        driver_id: payload.driver_id,
        account_id: payload.account_id,
        name: payload.name,
        role: payload.role,
        driver_mode_source: payload.driver_mode_source || 'driver',
        auth_subject_id: payload.auth_subject_id || payload.driver_id,
        auth_subject_type: payload.auth_subject_type || 'driver'
      };
      return next();
    } catch (error) {
      console.error('Driver auth middleware failed:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  }

  async function requireManager(req, res, next) {
    try {
      if (req.account?.account_id && req.account?.role === 'manager') {
        return next();
      }

      const payload = await verifyJwt(req, res);
      if (!payload) return;

      if (payload.role !== 'manager' || !payload.account_id) {
        return res.status(403).json({ error: 'Manager access required' });
      }

      const requestedCsaId = String(req.headers['x-readyroute-csa-id'] || '').trim();
      if (requestedCsaId && requestedCsaId !== payload.account_id) {
        return res.status(409).json({
          error: 'Selected CSA does not match the authenticated workspace. Switch CSA and try again.'
        });
      }

      req.account = {
        account_id: payload.account_id,
        selected_csa_id: requestedCsaId || payload.account_id,
        manager_user_id: payload.manager_user_id || null,
        manager_email: payload.manager_email || null,
        manager_name: payload.manager_name || null,
        manager_role: payload.manager_role || 'owner',
        role: payload.role
      };
      return next();
    } catch (error) {
      console.error('Manager auth middleware failed:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  }

  return { requireDriver, requireManager };
}

const defaultAuthMiddleware = createAuthMiddleware();

module.exports = {
  createAuthMiddleware,
  requireDriver: defaultAuthMiddleware.requireDriver,
  requireManager: defaultAuthMiddleware.requireManager,
  validateCredentialSession
};
