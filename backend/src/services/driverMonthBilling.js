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

module.exports = {
  DRIVER_MONTH_PRICE_CENTS,
  getDriverMonthChargeKey,
  getUtcBillingMonth,
  summarizeDriverMonthCharges
};
