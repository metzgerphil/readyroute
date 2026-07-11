const defaultSupabase = require('../lib/supabase');
const { getAccountAccess } = require('../services/accountLifecycle');

function createRequireActiveSubscription(options = {}) {
  const supabase = options.supabase || defaultSupabase;

  return async function requireActiveSubscription(req, res, next) {
    try {
      const { data: account, error } = await supabase
        .from('accounts')
        .select('id, plan, account_status, service_ends_at, retention_ends_at')
        .eq('id', req.account.account_id)
        .maybeSingle();

      if (error) {
        console.error('Billing middleware account lookup failed:', error);
        return res.status(500).json({ error: 'Failed to validate subscription status' });
      }

      if (!account) {
        return res.status(403).json({ error: 'Account is not available' });
      }

      if (account.plan === 'suspended') {
        return res.status(402).json({
          error: 'Subscription payment failed. Update payment method.'
        });
      }

      const lifecycleAccess = getAccountAccess(account, { method: req.method });
      if (!lifecycleAccess.allowed) {
        return res.status(403).json({
          error: lifecycleAccess.error,
          account_status: lifecycleAccess.status,
          retention_ends_at: account.retention_ends_at || null
        });
      }

      res.setHeader('X-ReadyRoute-Account-Status', lifecycleAccess.status);
      if (lifecycleAccess.read_only) {
        res.setHeader('X-ReadyRoute-Read-Only', 'true');
      }

      return next();
    } catch (error) {
      console.error('Billing middleware failed:', error);
      return res.status(500).json({ error: 'Failed to validate subscription status' });
    }
  };
}

module.exports = {
  createRequireActiveSubscription
};
