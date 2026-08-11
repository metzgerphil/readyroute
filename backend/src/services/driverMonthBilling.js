const DRIVER_MONTH_PRICE_CENTS = 500;

function getUtcBillingMonth(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid activation date is required');
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function getDriverMonthChargeKey(accountId, driverId, value) {
  if (!accountId || !driverId) throw new Error('Account and driver are required');
  return `${accountId}:${driverId}:${getUtcBillingMonth(value)}`;
}

function summarizeDriverMonthCharges(rows = [], activeDriverCount = 0) {
  const billable = rows.filter((row) => row.charge_status !== 'voided');
  return {
    active_driver_count: Number(activeDriverCount) || 0,
    charged_driver_count: billable.length,
    unit_amount_cents: DRIVER_MONTH_PRICE_CENTS,
    total_amount_cents: billable.reduce((sum, row) => sum + Number(row.unit_amount_cents || DRIVER_MONTH_PRICE_CENTS), 0),
    currency: 'usd',
    live_charging_enabled: false
  };
}

function createDriverMonthBillingService({ supabase, stripeClient, now = () => new Date(), billingMode = process.env.DRIVER_MONTH_BILLING_MODE || 'shadow' } = {}) {
  async function run() {
    const currentMonth = getUtcBillingMonth(now());
    const previousDate = new Date(`${currentMonth}T00:00:00.000Z`);
    previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
    const billingMonth = getUtcBillingMonth(previousDate);

    const accrual = await supabase.rpc('readyroute_accrue_active_driver_month', { p_billing_month: currentMonth });
    if (accrual.error) throw accrual.error;

    const { data: rows, error: rowsError } = await supabase
      .from('driver_month_activation_charges')
      .select('id, account_id, driver_id, billing_month, unit_amount_cents, charge_status')
      .eq('billing_month', billingMonth)
      .eq('charge_status', 'accrued');
    if (rowsError) throw rowsError;

    const byAccount = (rows || []).reduce((groups, row) => {
      (groups[row.account_id] ||= []).push(row);
      return groups;
    }, {});
    const results = [];
    for (const [accountId, accountRows] of Object.entries(byAccount)) {
      const amount = accountRows.length * DRIVER_MONTH_PRICE_CENTS;
      if (billingMode !== 'live') {
        results.push({ account_id: accountId, billing_month: billingMonth, drivers: accountRows.length, amount_cents: amount, status: 'shadow' });
        continue;
      }
      if (!stripeClient) throw new Error('Stripe is required when driver-month billing is live');
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, stripe_customer_id')
        .eq('id', accountId)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account?.stripe_customer_id) {
        results.push({ account_id: accountId, status: 'payment_setup_required' });
        continue;
      }
      const idempotencyKey = `readyroute-driver-month:${accountId}:${billingMonth}`;
      const item = await stripeClient.invoiceItems.create({
        customer: account.stripe_customer_id,
        amount,
        currency: 'usd',
        description: `${accountRows.length} Ready Route driver${accountRows.length === 1 ? '' : 's'} · ${billingMonth.slice(0, 7)}`,
        metadata: { readyroute_account_id: accountId, readyroute_driver_month: billingMonth }
      }, { idempotencyKey: `${idempotencyKey}:item` });
      const invoice = await stripeClient.invoices.create({
        customer: account.stripe_customer_id,
        auto_advance: true,
        metadata: { readyroute_account_id: accountId, readyroute_driver_month: billingMonth }
      }, { idempotencyKey: `${idempotencyKey}:invoice` });
      const { error: updateError } = await supabase
        .from('driver_month_activation_charges')
        .update({ charge_status: 'invoiced', provider_invoice_item_id: item.id, updated_at: now().toISOString() })
        .in('id', accountRows.map((row) => row.id));
      if (updateError) throw updateError;
      results.push({ account_id: accountId, billing_month: billingMonth, drivers: accountRows.length, amount_cents: amount, status: 'invoiced', invoice_id: invoice.id });
    }
    return { billing_mode: billingMode, billing_month: billingMonth, active_month: currentMonth, results };
  }
  return { run };
}

module.exports = {
  DRIVER_MONTH_PRICE_CENTS,
  createDriverMonthBillingService,
  getDriverMonthChargeKey,
  getUtcBillingMonth,
  summarizeDriverMonthCharges
};
