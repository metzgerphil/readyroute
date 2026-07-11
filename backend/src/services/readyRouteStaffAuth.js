const jwt = require('jsonwebtoken');

const READYROUTE_STAFF_ROLES = new Set(['owner', 'admin', 'support', 'read_only']);
const READYROUTE_STAFF_WRITE_ROLES = new Set(['owner', 'admin', 'support']);
const READYROUTE_STAFF_ADMIN_ROLES = new Set(['owner', 'admin']);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStaffRole(value, fallback = 'support') {
  const role = String(value || '').trim().toLowerCase();
  return READYROUTE_STAFF_ROLES.has(role) ? role : fallback;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function buildStaffTokenPayload(staffUser) {
  return {
    staff_user_id: staffUser.id,
    staff_email: normalizeEmail(staffUser.email),
    staff_name: staffUser.full_name || null,
    staff_role: normalizeStaffRole(staffUser.role),
    primary_role: 'readyroute_staff',
    role: 'readyroute_staff'
  };
}

function presentStaffUser(row = {}) {
  return {
    id: row.id,
    email: normalizeEmail(row.email),
    full_name: row.full_name || '',
    role: normalizeStaffRole(row.role),
    is_active: row.is_active !== false,
    invited_at: row.invited_at || null,
    accepted_at: row.accepted_at || null,
    last_login_at: row.last_login_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function signStaffToken(staffUser, jwtSecret, expiresIn = '12h') {
  if (!jwtSecret) {
    throw new Error('Missing JWT_SECRET environment variable');
  }

  return jwt.sign(buildStaffTokenPayload(staffUser), jwtSecret, { expiresIn });
}

function readRequiredStaffContext(req, jwtSecret, allowedRoles = READYROUTE_STAFF_ROLES) {
  const token = extractBearerToken(req);

  if (!token) {
    const error = new Error('Authorization token required');
    error.status = 401;
    throw error;
  }

  if (!jwtSecret) {
    const error = new Error('Staff auth is not configured.');
    error.status = 500;
    throw error;
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const staffRole = normalizeStaffRole(payload.staff_role, '');

    if (payload.role !== 'readyroute_staff' || !payload.staff_user_id || !payload.staff_email) {
      const error = new Error('ReadyRoute staff access required');
      error.status = 403;
      throw error;
    }

    if (!allowedRoles.has(staffRole)) {
      const error = new Error('ReadyRoute staff role is not permitted for this action');
      error.status = 403;
      throw error;
    }

    const staffContext = {
      staff_user_id: payload.staff_user_id,
      staff_email: normalizeEmail(payload.staff_email),
      staff_name: payload.staff_name || null,
      staff_role: staffRole,
      role: payload.role
    };
    req.readyrouteStaff = staffContext;
    return staffContext;
  } catch (error) {
    if (error.status) {
      throw error;
    }

    const authError = new Error('Invalid or expired token');
    authError.status = 401;
    throw authError;
  }
}

module.exports = {
  READYROUTE_STAFF_ADMIN_ROLES,
  READYROUTE_STAFF_ROLES,
  READYROUTE_STAFF_WRITE_ROLES,
  buildStaffTokenPayload,
  isValidEmail,
  normalizeEmail,
  normalizeStaffRole,
  presentStaffUser,
  readRequiredStaffContext,
  signStaffToken
};
