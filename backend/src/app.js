const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const { createAuthRouter } = require('./routes/auth');
const { createBillingRouter } = require('./routes/billing');
const managerRoutes = require('./routes/manager');
const { createManagerRouter } = require('./routes/manager');
const { requireManager } = require('./middleware/auth');
const { createRequireActiveSubscription } = require('./middleware/billing');
const timecardRoutes = require('./routes/timecards');
const { createTimecardsRouter } = require('./routes/timecards');
const vehicleRoutes = require('./routes/vehicles');
const { createVehiclesRouter } = require('./routes/vehicles');
const { createVedrRouter } = require('./routes/vedr');
const routeRoutes = require('./routes/routes');
const { createRoutesRouter } = require('./routes/routes');
const { createInternalSyncRouter } = require('./routes/internalSync');
const waitlistRoutes = require('./routes/waitlist');
const { createWaitlistRouter } = require('./routes/waitlist');

function createApp(options = {}) {
  const app = express();
  const port = Number(process.env.PORT) || 3001;
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:4179',
    'http://127.0.0.1:4179',
    'https://readyroute.org',
    'https://www.readyroute.org',
    'https://app.readyroute.app',
    'https://portal.readyroute.org',
    process.env.VITE_MANAGER_PORTAL_URL,
    process.env.VERCEL_MANAGER_PORTAL_URL,
    process.env.MANAGER_PORTAL_URL
  ].filter(Boolean);
  function isAllowedCorsOrigin(origin) {
    if (!origin) {
      return true;
    }

    if (allowedOrigins.includes(origin)) {
      return true;
    }

    try {
      const { hostname, protocol } = new URL(origin);
      return (
        protocol === 'https:' &&
        (hostname === 'readyroute.org' || hostname.endsWith('.readyroute.org'))
      );
    } catch (_error) {
      return false;
    }
  }
  const authRouter = options.supabase || options.jwtSecret
    ? createAuthRouter({
        supabase: options.supabase,
        jwtSecret: options.jwtSecret,
        stripeClient: options.stripeClient,
        stripePriceId: options.stripePriceId,
        trialDays: options.trialDays,
        sendManagerPasswordResetEmail: options.sendManagerPasswordResetEmail
      })
    : authRoutes;
  const billingRouter = options.supabase && !options.stripeClient && !process.env.STRIPE_SECRET_KEY
    ? express.Router()
    : createBillingRouter({
        supabase: options.supabase,
        stripeClient: options.stripeClient,
        webhookSecret: options.webhookSecret,
        stripePriceId: options.stripePriceId
      });
  const routesRouter = options.supabase
    ? createRoutesRouter({
        supabase: options.supabase,
        now: options.now,
        fedexSyncService: options.fedexSyncService,
        fccProgressSyncService: options.fccProgressSyncService,
        manifestIngestService: options.manifestIngestService,
        inboundIngestSecret: options.inboundIngestSecret
      })
    : routeRoutes;
  const managerRouter = options.supabase || options.now
    ? createManagerRouter({
        supabase: options.supabase,
        now: options.now,
        jwtSecret: options.jwtSecret,
        sendManagerInviteEmail: options.sendManagerInviteEmail,
        sendManagerPasswordResetEmail: options.sendManagerPasswordResetEmail,
        stripeClient: options.stripeClient,
        stripePriceId: options.stripePriceId,
        trialDays: options.trialDays,
        billingService: options.billingService
      })
    : managerRoutes;
  const timecardsRouter = options.supabase
    ? createTimecardsRouter({ supabase: options.supabase })
    : timecardRoutes;
  const vehiclesRouter = options.supabase || options.now
    ? createVehiclesRouter({ supabase: options.supabase, now: options.now })
    : vehicleRoutes;
  const vedrRouter = createVedrRouter({ supabase: options.supabase, now: options.now });
  const internalSyncRouter = createInternalSyncRouter({
    supabase: options.supabase,
    now: options.now,
    fedexSyncService: options.fedexSyncService,
    manifestIngestService: options.manifestIngestService,
    fccProgressSyncService: options.fccProgressSyncService,
    fedexFccAdapter: options.fedexFccAdapter,
    workerSecret: options.fedexSyncWorkerSecret
  });
  const waitlistRouter = options.supabase
    ? createWaitlistRouter({ supabase: options.supabase })
    : waitlistRoutes;
  const requireActiveSubscription = options.enforceBilling === false || (Boolean(options.supabase) && options.enforceBilling !== true)
    ? (_req, _res, next) => next()
    : createRequireActiveSubscription({ supabase: options.supabase });

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedCorsOrigin(origin) || origin.startsWith('exp://')) {
          return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true
    })
  );

  app.use('/billing', billingRouter);
  app.use((req, _res, next) => {
    const contentType = req.headers['content-type'];
    if (typeof contentType === 'string' && /charset=UTF-8/i.test(contentType)) {
      req.headers['content-type'] = contentType.replace(/charset=UTF-8/i, 'charset=utf-8');
    }
    next();
  });
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date(),
      release: {
        commit:
          process.env.RAILWAY_GIT_COMMIT_SHA ||
          process.env.SOURCE_COMMIT ||
          process.env.GIT_COMMIT_SHA ||
          null
      }
    });
  });

  app.use('/auth', authRouter);
  app.use('/waitlist', waitlistRouter);
  app.use('/internal', internalSyncRouter);
  app.use('/manager', requireManager, requireActiveSubscription, managerRouter);
  app.use('/api/vedr', requireManager, requireActiveSubscription, vedrRouter);
  app.use('/routes', routesRouter);
  app.use('/timecards', timecardsRouter);
  app.use('/vehicles', vehiclesRouter);

  app.use((error, _req, res, _next) => {
    console.error('Unhandled server error:', error);

    if (res.headersSent) {
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  });

  app.locals.port = port;

  return app;
}

module.exports = {
  createApp
};
