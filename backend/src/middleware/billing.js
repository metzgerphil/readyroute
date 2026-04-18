const defaultSupabase = require('../lib/supabase');

function createRequireActiveSubscription(options = {}) {
  const supabase = options.supabase || defaultSupabase;

  return async function requireActiveSubscription(req, res, next) {
    try {
      const { data: account, error } = await supabase
        .from('accounts')
        .select('id, plan')
        .eq('id', req.account.account_id)
        .maybeSingle();

      if (error) {
        console.error('Billing middleware account lookup failed:', error);
        return res.status(500).json({ error: 'Failed to validate subscription status' });
      }

      if (!account) {
        return next();
      }

      if (account.plan === 'suspended') {
        return res.status(402).json({
          error: 'Subscription payment failed. Update payment method.'
        });
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
