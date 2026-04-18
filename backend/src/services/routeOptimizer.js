require('dotenv').config();

const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

const ROUTE_OPTIMIZATION_BASE_URL = 'https://routeoptimization.googleapis.com/v1';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function isPriorityStop(stop) {
  return typeof stop.notes === 'string' && stop.notes.toUpperCase().includes('PRIORITY');
}

function applyPriorityPlacement(stops) {
  if (!Array.isArray(stops) || stops.length === 0) {
    return [];
  }

  const priorityStops = stops.filter(isPriorityStop);

  if (!priorityStops.length) {
    return [...stops];
  }

  const nonPriorityStops = stops.filter((stop) => !isPriorityStop(stop));
  const priorityWindowSize = Math.max(1, Math.ceil(stops.length * 0.2));
  const head = [];

  for (let index = 0; index < priorityWindowSize; index += 1) {
    if (priorityStops.length) {
      head.push(priorityStops.shift());
    } else if (nonPriorityStops.length) {
      head.push(nonPriorityStops.shift());
    }
  }

  return [...head, ...priorityStops, ...nonPriorityStops];
}

function buildRequestBody(stops, startLat, startLng, roadRules) {
  const shipments = stops.map((stop, index) => ({
    label: stop.id || `stop-${index + 1}`,
    deliveries: [
      {
        arrivalLocation: {
          latitude: Number(stop.lat),
          longitude: Number(stop.lng)
        }
      }
    ]
  }));

  const vehicles = [
    {
      label: 'readyroute-vehicle',
      startLocation: {
        latitude: Number(startLat),
        longitude: Number(startLng)
      }
    }
  ];

  const avoidedLocations = (Array.isArray(roadRules) ? roadRules : []).map((rule, index) => ({
    label: `road-rule-${index + 1}`,
    latitude: Number((Number(rule.lat_start) + Number(rule.lat_end)) / 2),
    longitude: Number((Number(rule.lng_start) + Number(rule.lng_end)) / 2)
  }));

  const globalStartTime = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

  const globalEndTime = new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

  return {
    timeout: '10s',
    considerRoadTraffic: true,
    model: {
      globalStartTime,
      globalEndTime,
      shipments,
      vehicles
    },
    // TODO Phase 2: use the Roads API and a richer routing model for actual road-rule avoidance.
    // The Route Optimization API does not support direct road-segment avoidance in this request.
    label: avoidedLocations.length ? `avoidedLocations:${avoidedLocations.length}` : 'readyroute-optimize'
  };
}

function buildOriginalResult(stops, warning) {
  return {
    stops: applyPriorityPlacement(stops),
    warning
  };
}

function loadServiceAccountCredentials(customPath) {
  const credentialsPath =
    customPath ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    return null;
  }

  try {
    const raw = fs.readFileSync(credentialsPath, 'utf8');
    const credentials = JSON.parse(raw);

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Service account JSON is missing client_email or private_key');
    }

    return credentials;
  } catch (error) {
    console.error('Failed to load Google service account credentials:', error.message);
    return null;
  }
}

async function fetchAccessToken(httpClient, credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  const payload = {
    iss: credentials.client_email,
    scope: GOOGLE_CLOUD_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(unsignedToken), credentials.private_key)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const assertion = `${unsignedToken}.${signature}`;
  const response = await httpClient.post(
    GOOGLE_OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 15000
    }
  );

  return response.data.access_token;
}

function createRouteOptimizer(options = {}) {
  const httpClient = options.httpClient || axios;
  const credentials = options.credentials || loadServiceAccountCredentials(options.credentialsPath);
  const projectId =
    options.projectId ||
    process.env.GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT_ID ||
    process.env.GOOGLE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    credentials?.project_id;

  async function optimizeRoute(stops, startLat, startLng, roadRules) {
    const normalizedStops = Array.isArray(stops) ? [...stops] : [];

    if (normalizedStops.length <= 1) {
      return { stops: applyPriorityPlacement(normalizedStops), warning: null };
    }

    if (!credentials || !projectId) {
      return buildOriginalResult(normalizedStops, 'optimization_unavailable');
    }

    try {
      const accessToken = await fetchAccessToken(httpClient, credentials);
      const requestBody = buildRequestBody(normalizedStops, startLat, startLng, roadRules);
      const response = await httpClient.post(
        `${ROUTE_OPTIMIZATION_BASE_URL}/projects/${encodeURIComponent(projectId)}:optimizeTours`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000
        }
      );

      const visits = response.data?.routes?.[0]?.visits || [];
      const orderedIndices = visits
        .map((visit) => visit.shipmentIndex)
        .filter((shipmentIndex) => Number.isInteger(shipmentIndex) && shipmentIndex >= 0 && shipmentIndex < normalizedStops.length);

      if (!orderedIndices.length) {
        return buildOriginalResult(normalizedStops, 'optimization_unavailable');
      }

      const seenIndices = new Set();
      const optimizedStops = [];

      for (const shipmentIndex of orderedIndices) {
        if (!seenIndices.has(shipmentIndex)) {
          seenIndices.add(shipmentIndex);
          optimizedStops.push(normalizedStops[shipmentIndex]);
        }
      }

      for (let index = 0; index < normalizedStops.length; index += 1) {
        if (!seenIndices.has(index)) {
          optimizedStops.push(normalizedStops[index]);
        }
      }

      return {
        stops: applyPriorityPlacement(optimizedStops),
        warning: null
      };
    } catch (error) {
      console.error('Route optimization failed:', error.response?.data || error.message);
      return buildOriginalResult(normalizedStops, 'optimization_unavailable');
    }
  }

  return {
    optimizeRoute
  };
}

module.exports = createRouteOptimizer();
module.exports.createRouteOptimizer = createRouteOptimizer;
module.exports.applyPriorityPlacement = applyPriorityPlacement;
