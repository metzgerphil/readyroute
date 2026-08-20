const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { createAuthRouter } = require('./routes/auth');
const { createBillingRouter } = require('./routes/billing');
const { createDriverHelpRouter } = require('./routes/driverHelp');
const { createPublicAccountRouter } = require('./routes/publicAccount');
const { createResendWebhookRouter } = require('./routes/resendWebhook');
const { createManagerRouter } = require('./routes/manager');
const { createManagerDriverHelpRouter } = require('./routes/managerDriverHelp');
const propertyIntelManagerRoutes = require('./routes/propertyIntelManager');
const { createPropertyIntelManagerRouter } = require('./routes/propertyIntelManager');
const { createAuthMiddleware } = require('./middleware/auth');
const { createRequireActiveSubscription } = require('./middleware/billing');
const { createTimecardsRouter } = require('./routes/timecards');
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
const defaultSupabase = require('./lib/supabase');
const { createHealthService } = require('./services/health');
const { createRequestObservability, logUnhandledRequestError } = require('./middleware/observability');
const { READYROUTE_STAFF_ROLES, readRequiredStaffContext } = require('./services/readyRouteStaffAuth');

const PHOTO_JSON_PATHS = [
  '/routes/inspection-photo',
  '/routes/stops/:stop_id/pod-photo',
  '/vehicles/:id/inspection-photo',
  '/support/tickets',
  '/support/tickets/:ticketId/messages'
];

function createApp(options = {}) {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  const healthService = createHealthService({ supabase: options.supabase || defaultSupabase });
  const requestLoggingEnabled = options.requestLoggingEnabled ?? (
    isProduction || process.env.REQUEST_LOGGING === 'true'
  );
  const port = Number(process.env.PORT) || 3001;
  const rateLimiters = createApiRateLimiters({
    enabled: options.rateLimitEnabled !== false,
    limits: options.rateLimits
  });
  const { requireDriver, requireManager } = createAuthMiddleware({
    supabase: options.supabase || defaultSupabase,
    jwtSecret: options.jwtSecret,
    enforceSessionValidation: options.enforceSessionValidation
  });
  app.set('trust proxy', isProduction ? 1 : false);
  app.disable('x-powered-by');
  app.use(createRequestObservability({
    enabled: requestLoggingEnabled,
    log: options.structuredLog
  }));
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
    'https://ready-route-project.web.app',
    'https://ready-route-project.firebaseapp.com',
    'https://ready-route-landing.web.app',
    'https://ready-route-landing.firebaseapp.com',
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
      return protocol === 'https:' && (
        hostname === 'readyroute.org'
        || /^ready-route-project--[a-z0-9-]+\.web\.app$/.test(hostname)
      );
    } catch (_error) {
      return false;
    }
  }
  const authRouter = createAuthRouter({
    supabase: options.supabase,
    jwtSecret: options.jwtSecret,
    stripeClient: options.stripeClient,
    stripePriceId: options.stripePriceId,
    stripeMonthlyPriceId: options.stripeMonthlyPriceId,
    stripeAnnualPriceId: options.stripeAnnualPriceId,
    trialDays: options.trialDays,
    requireManager,
    requireDriver,
    sendManagerPasswordResetEmail: options.sendManagerPasswordResetEmail,
    sendDriverPasswordResetEmail: options.sendDriverPasswordResetEmail,
    authorizeDriverDevice: options.authorizeDriverDevice,
    requireDriverDeviceId: options.requireDriverDeviceId
  });
  const publicAccountRouter = createPublicAccountRouter({
    supabase: options.supabase,
    jwtSecret: options.jwtSecret,
    now: options.now
  });
  const billingRouter = createBillingRouter({
    supabase: options.supabase,
    jwtSecret: options.jwtSecret,
    now: options.now,
    requireManager,
    stripeClient: options.stripeClient,
    webhookSecret: options.webhookSecret,
    stripePriceId: options.stripePriceId,
    stripeMonthlyPriceId: options.stripeMonthlyPriceId,
    stripeAnnualPriceId: options.stripeAnnualPriceId,
    stripePublishableKey: options.stripePublishableKey,
    stripeSignupEnabled: options.stripeSignupEnabled,
    liveBillingApproved: options.liveBillingApproved,
    stripeTaxEnabled: options.stripeTaxEnabled,
    stripeTaxRegistrationsConfirmed: options.stripeTaxRegistrationsConfirmed,
    signupReturnUrl: options.signupReturnUrl,
    sendRraCompanyReadyEmail: options.sendRraCompanyReadyEmail,
    publicFormLimiter: rateLimiters.publicForm
  });
  const resendWebhookRouter = createResendWebhookRouter({
    supabase: options.supabase,
    webhookSecret: options.resendWebhookSecret
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
    driverPositionRateLimit: options.rateLimits?.driverPosition,
    requireDriver,
    requireManager
  });
  const managerRouter = createManagerRouter({
    supabase: options.supabase,
    now: options.now,
    jwtSecret: options.jwtSecret,
    sendManagerInviteEmail: options.sendManagerInviteEmail,
    sendDriverInviteEmail: options.sendDriverInviteEmail,
    sendDriverPasswordResetEmail: options.sendDriverPasswordResetEmail,
    sendManagerPasswordResetEmail: options.sendManagerPasswordResetEmail,
    stripeClient: options.stripeClient,
    stripePriceId: options.stripePriceId,
    stripeMonthlyPriceId: options.stripeMonthlyPriceId,
    stripeAnnualPriceId: options.stripeAnnualPriceId,
    trialDays: options.trialDays,
    billingService: options.billingService,
    requireManager
  });
  const driverHelpRouter = createDriverHelpRouter({
    supabase: options.supabase || defaultSupabase,
    now: options.now,
    service: options.driverHelpService
  });
  const managerDriverHelpRouter = createManagerDriverHelpRouter({
    supabase: options.supabase,
    now: options.now,
    service: options.driverHelpService
  });
  const requireReadyRouteStaff = async (req, res, next) => {
    try {
      await readRequiredStaffContext(req, options.jwtSecret || process.env.JWT_SECRET, READYROUTE_STAFF_ROLES, {
        supabase: options.supabase || defaultSupabase,
        enforceSessionValidation: options.enforceSessionValidation
      });
      return next();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('ReadyRoute staff authorization failed:', error);
      return res.status(500).json({ error: 'Unable to verify ReadyRoute staff access.' });
    }
  };
  const staffDriverHelpRouter = createManagerDriverHelpRouter({
    supabase: options.supabase,
    now: options.now,
    service: options.driverHelpService,
    globalOverview: true,
    authorizeReview: (req) => req.readyrouteStaff.staff_role !== 'read_only',
    getRequestContext: (req) => ({
      accountId: null,
      actorType: 'manager',
      actorId: req.readyrouteStaff.staff_user_id,
      persist: false,
      sessionContext: req.body?.session_context || null
    })
  });
  const propertyIntelManagerRouter = options.supabase
    ? createPropertyIntelManagerRouter({ supabase: options.supabase })
    : propertyIntelManagerRoutes;
  const timecardsRouter = createTimecardsRouter({ supabase: options.supabase, requireDriver });
  const vehiclesRouter = createVehiclesRouter({
    supabase: options.supabase,
    now: options.now,
    requireDriver,
    requireManager
  });
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
    accountLifecycleWorkerSecret: options.accountLifecycleWorkerSecret,
    driverHelpMonthlyReportService: options.driverHelpMonthlyReportService,
    sendMonthlyReportEmail: options.sendMonthlyReportEmail,
    driverMonthBillingService: options.driverMonthBillingService,
    driverMonthBillingMode: options.driverMonthBillingMode,
    stripeClient: options.stripeClient
  });
  const waitlistRouter = options.supabase
    ? createWaitlistRouter({ supabase: options.supabase, sendFeedbackEmail: options.sendFeedbackEmail })
    : waitlistRoutes;
  const supportRouter = options.supabase || options.jwtSecret
    ? createSupportRouter({
        supabase: options.supabase,
        jwtSecret: options.jwtSecret,
        now: options.now,
        sendSupportAssignmentNotification: options.sendSupportAssignmentNotification,
        sendSupportReplyNotification: options.sendSupportReplyNotification,
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
        subscriptionActivationService: options.staffSubscriptionActivationService,
        stripeMonthlyPriceId: options.stripeMonthlyPriceId,
        stripeAnnualPriceId: options.stripeAnnualPriceId,
        liveBillingApproved: options.liveBillingApproved,
        sendReadyRouteStaffInviteEmail: options.sendReadyRouteStaffInviteEmail,
        sendReadyRouteStaffPasswordResetEmail: options.sendReadyRouteStaffPasswordResetEmail,
        sendManagerInviteEmail: options.sendManagerInviteEmail
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
  app.use('/webhooks/resend', resendWebhookRouter);
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
    '/staff/login',
    '/account/login'
  ], rateLimiters.login);
  app.use([
    '/auth/driver/accept-invite',
    '/auth/driver/request-password-reset',
    '/auth/manager/request-password-reset',
    '/manager/drivers/:driver_id/invite',
    '/manager/drivers/:driver_id/password-reset',
    '/manager/manager-users/:managerUserId/password-reset',
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

  app.get('/health', async (_req, res) => {
    res.status(200).json(await healthService.snapshot());
  });

  app.get('/health/ready', async (_req, res) => {
    const health = await healthService.snapshot();
    res.status(health.schema.compatible ? 200 : 503).json(health);
  });

  app.use('/auth', authRouter);
  app.use('/account', publicAccountRouter);
  app.use('/waitlist', waitlistRouter);
  app.use('/support', supportRouter);
  app.use('/staff/driver-help', requireReadyRouteStaff, staffDriverHelpRouter);
  app.use('/staff', staffRouter);
  app.use('/internal', internalSyncRouter);
  app.use('/manager/property-intel', requireManager, requireActiveSubscription, propertyIntelManagerRouter);
  app.use('/manager/driver-help', requireManager, requireActiveSubscription, managerDriverHelpRouter);
  app.use('/manager', requireManager, requireActiveSubscription, managerRouter);
  app.use('/api/vedr', requireManager, requireActiveSubscription, vedrRouter);
  app.use('/routes', routesRouter);
  app.use('/timecards', timecardsRouter);
  app.use('/vehicles', requireManager, requireActiveSubscription, vehiclesRouter);
  app.use('/safety-focuses', requireDriver, safetyFocusesRouter);
  app.use('/driver-help', requireDriver, driverHelpRouter);

  app.use((error, req, res, _next) => {
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

    if (requestLoggingEnabled) {
      logUnhandledRequestError(error, req, { log: options.structuredLog });
    } else {
      console.error('Unhandled server error:', error);
    }

    return res.status(500).json({ error: 'Internal server error' });
  });

  app.locals.port = port;

  return app;
}

module.exports = {
  createApp
};
