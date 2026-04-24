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

function createApp(options = {}) {
  const app = express();
  const port = Number(process.env.PORT) || 3001;
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://app.readyroute.app',
    process.env.VITE_MANAGER_PORTAL_URL,
    process.env.VERCEL_MANAGER_PORTAL_URL
  ].filter(Boolean);
  const authRouter = options.supabase || options.jwtSecret
    ? createAuthRouter({
        supabase: options.supabase,
        jwtSecret: options.jwtSecret,
        stripeClient: options.stripeClient,
        stripePriceId: options.stripePriceId,
        trialDays: options.trialDays
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
    ? createRoutesRouter({ supabase: options.supabase })
    : routeRoutes;
  const managerRouter = options.supabase || options.now
    ? createManagerRouter({
        supabase: options.supabase,
        now: options.now,
        jwtSecret: options.jwtSecret,
        sendManagerInviteEmail: options.sendManagerInviteEmail,
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
  const requireActiveSubscription = options.enforceBilling === false || (Boolean(options.supabase) && options.enforceBilling !== true)
    ? (_req, _res, next) => next()
    : createRequireActiveSubscription({ supabase: options.supabase });

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin) || origin.startsWith('exp://')) {
          return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true
    })
  );

  app.use('/billing', billingRouter);
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
  });

  app.use('/auth', authRouter);
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
