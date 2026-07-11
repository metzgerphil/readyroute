const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const { createAuthRouter } = require('./routes/auth');
const { createBillingRouter } = require('./routes/billing');
const managerRoutes = require('./routes/manager');
const { createManagerRouter } = require('./routes/manager');
const propertyIntelManagerRoutes = require('./routes/propertyIntelManager');
const { createPropertyIntelManagerRouter } = require('./routes/propertyIntelManager');
const { requireDriver, requireManager } = require('./middleware/auth');
const { createRequireActiveSubscription } = require('./middleware/billing');
const timecardRoutes = require('./routes/timecards');
const { createTimecardsRouter } = require('./routes/timecards');
const vehicleRoutes = require('./routes/vehicles');
const { createVehiclesRouter } = require('./routes/vehicles');
const safetyFocusesRoutes = require('./routes/safetyFocuses');
const { createSafetyFocusesRouter } = require('./routes/safetyFocuses');
const { createVedrRouter } = require('./routes/vedr');
const { createRoutesRouter } = require('./routes/routes');
const { createInternalSyncRouter } = require('./routes/internalSync');
const staffRoutes = require('./routes/staff');
const { createReadyRouteStaffRouter } = require('./routes/staff');
const supportRoutes = require('./routes/support');
const { createSupportRouter } = require('./routes/support');
const waitlistRoutes = require('./routes/waitlist');
const { createWaitlistRouter } = require('./routes/waitlist');
const { createApiRateLimiters } = require('./middleware/apiSecurity');

const PHOTO_JSON_PATHS = [
  '/routes/inspection-photo',
  '/routes/stops/:stop_id/pod-photo',
  '/vehicles/:id/inspection-photo'
];

function createApp(options = {}) {
  const app = express();
  const port = Number(process.env.PORT) || 3001;
  const isProduction = process.env.NODE_ENV === 'production';
  const rateLimiters = createApiRateLimiters({
    enabled: options.rateLimitEnabled !== false,
    limits: options.rateLimits
  });
  app.set('trust proxy', isProduction ? 1 : false);
  app.disable('x-powered-by');
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
      return protocol === 'https:' && hostname === 'readyroute.org';
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
  const requireActiveSubscription = options.enforceBilling === false || (Boolean(options.supabase) && options.enforceBilling !== true)
    ? (_req, _res, next) => next()
    : createRequireActiveSubscription({ supabase: options.supabase });
  const routesRouter = createRoutesRouter({
    supabase: options.supabase,
    now: options.now,
    fedexSyncService: options.fedexSyncService,
    fccProgressSyncService: options.fccProgressSyncService,
    manifestIngestService: options.manifestIngestService,
    inboundIngestSecret: options.inboundIngestSecret,
    requireActiveSubscription,
    rateLimitEnabled: options.rateLimitEnabled !== false,
    driverPositionRateLimit: options.rateLimits?.driverPosition
  });
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
  const propertyIntelManagerRouter = options.supabase
    ? createPropertyIntelManagerRouter({ supabase: options.supabase })
    : propertyIntelManagerRoutes;
  const timecardsRouter = options.supabase
    ? createTimecardsRouter({ supabase: options.supabase })
    : timecardRoutes;
  const vehiclesRouter = options.supabase || options.now
    ? createVehiclesRouter({ supabase: options.supabase, now: options.now })
    : vehicleRoutes;
  const safetyFocusesRouter = options.supabase || options.now
    ? createSafetyFocusesRouter({ supabase: options.supabase, now: options.now })
    : safetyFocusesRoutes;
  const vedrRouter = createVedrRouter({ supabase: options.supabase, now: options.now });
  const internalSyncRouter = createInternalSyncRouter({
    supabase: options.supabase,
    now: options.now,
    fedexSyncService: options.fedexSyncService,
    manifestIngestService: options.manifestIngestService,
    fccProgressSyncService: options.fccProgressSyncService,
    fedexFccAdapter: options.fedexFccAdapter,
    workerSecret: options.fedexSyncWorkerSecret,
    accountLifecycleWorkerSecret: options.accountLifecycleWorkerSecret
  });
  const waitlistRouter = options.supabase
    ? createWaitlistRouter({ supabase: options.supabase, sendFeedbackEmail: options.sendFeedbackEmail })
    : waitlistRoutes;
  const supportRouter = options.supabase || options.jwtSecret
    ? createSupportRouter({
        supabase: options.supabase,
        jwtSecret: options.jwtSecret,
        now: options.now,
        sendSupportTicketNotification: options.sendSupportTicketNotification
      })
    : supportRoutes;
  const staffRouter = options.supabase || options.jwtSecret
      ? createReadyRouteStaffRouter({
        supabase: options.supabase,
        jwtSecret: options.jwtSecret,
        now: options.now,
        stripeClient: options.stripeClient,
        billingService: options.staffBillingService,
        sendReadyRouteStaffInviteEmail: options.sendReadyRouteStaffInviteEmail,
        sendReadyRouteStaffPasswordResetEmail: options.sendReadyRouteStaffPasswordResetEmail
      })
    : staffRoutes;
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
  app.use(
    cors({
      origin(origin, callback) {
        const isDevelopmentExpoOrigin = !isProduction && typeof origin === 'string' && origin.startsWith('exp://');
        if (isAllowedCorsOrigin(origin) || isDevelopmentExpoOrigin) {
          return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true
    })
  );

  app.use(rateLimiters.global);
  app.use('/billing', billingRouter);
  app.use((req, _res, next) => {
    const contentType = req.headers['content-type'];
    if (typeof contentType === 'string' && /charset=UTF-8/i.test(contentType)) {
      req.headers['content-type'] = contentType.replace(/charset=UTF-8/i, 'charset=utf-8');
    }
    next();
  });
  app.use(PHOTO_JSON_PATHS, express.json({ limit: '12mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.use([
    '/auth/driver/login',
    '/auth/manager/login',
    '/auth/mobile/login',
    '/staff/login'
  ], rateLimiters.login);
  app.use([
    '/auth/manager/request-password-reset',
    '/staff/request-password-reset'
  ], rateLimiters.passwordReset);
  app.use([
    '/waitlist/early-access',
    '/waitlist/feedback',
    '/support/tickets'
  ], rateLimiters.publicForm);
  app.use([
    ...PHOTO_JSON_PATHS,
    '/manager/drivers/:driver_id/documents',
    '/manager/property-intel/import',
    '/routes/upload-manifest'
  ], rateLimiters.upload);

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
  app.use('/support', supportRouter);
  app.use('/staff', staffRouter);
  app.use('/internal', internalSyncRouter);
  app.use('/manager/property-intel', requireManager, requireActiveSubscription, propertyIntelManagerRouter);
  app.use('/manager', requireManager, requireActiveSubscription, managerRouter);
  app.use('/api/vedr', requireManager, requireActiveSubscription, vedrRouter);
  app.use('/routes', routesRouter);
  app.use('/timecards', timecardsRouter);
  app.use('/vehicles', requireManager, requireActiveSubscription, vehiclesRouter);
  app.use('/safety-focuses', requireDriver, safetyFocusesRouter);

  app.use((error, _req, res, _next) => {
    if (res.headersSent) {
      return;
    }

    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request payload is too large.' });
    }

    if (error instanceof SyntaxError && error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body contains invalid JSON.' });
    }

    if (String(error?.message || '').startsWith('CORS blocked')) {
      return res.status(403).json({ error: 'Origin is not allowed.' });
    }

    console.error('Unhandled server error:', error);

    return res.status(500).json({ error: 'Internal server error' });
  });

  app.locals.port = port;

  return app;
}

module.exports = {
  createApp
};
