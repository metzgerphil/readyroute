const jwt = require('jsonwebtoken');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('Missing JWT_SECRET environment variable');
  }

  return process.env.JWT_SECRET;
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function verifyJwt(req, res) {
  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'Authorization token required' });
    return null;
  }

  try {
    return jwt.verify(token, getJwtSecret());
  } catch (_error) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
}

function requireDriver(req, res, next) {
  try {
    const payload = verifyJwt(req, res);

    if (!payload) {
      return;
    }

    if (payload.role !== 'driver' || !payload.driver_id || !payload.account_id) {
      return res.status(403).json({ error: 'Driver access required' });
    }

    req.driver = {
      driver_id: payload.driver_id,
      account_id: payload.account_id,
      name: payload.name,
      role: payload.role
    };

    return next();
  } catch (error) {
    console.error('Driver auth middleware failed:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

function requireManager(req, res, next) {
  try {
    const payload = verifyJwt(req, res);

    if (!payload) {
      return;
    }

    if (payload.role !== 'manager' || !payload.account_id) {
      return res.status(403).json({ error: 'Manager access required' });
    }

    req.account = {
      account_id: payload.account_id,
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

module.exports = {
  requireDriver,
  requireManager
};
