const DEFAULT_ROUTE_RATE_CENTS = 1500;
const DEFAULT_CURRENCY = 'usd';
const MAX_COMMITTED_ROUTE_COUNT = 10000;

function normalizeRouteBillingKey(workAreaName) {
  const normalized = String(workAreaName || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || null;
}

function parseDateParts(dateValue) {
  const value = String(dateValue || '').trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year, month, day };
}

function getBillingPeriodForDate(dateValue) {
  const parts = parseDateParts(dateValue);

  if (!parts) {
    return null;
  }

  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;

  return {
    start: `${parts.year}-${String(parts.month).padStart(2, '0')}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  };
}

function parseBillingMonth(monthValue, nowProvider = () => new Date()) {
  const raw = String(monthValue || '').trim();
  const value = raw || nowProvider().toISOString().slice(0, 7);
  const match = value.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return getBillingPeriodForDate(`${year}-${String(month).padStart(2, '0')}-01`);
}

function isMissingBillingTableError(error) {
  const message = String(error?.message || error?.details || '');
  return /account_billing_settings|billing_manifest_imports|billable_route_months|schema cache|does not exist/i.test(message);
}

function normalizeCommittedRouteCount(value) {
  const rawValue = typeof value === 'string' ? value.trim() : value;

  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > MAX_COMMITTED_ROUTE_COUNT) {
    return null;
  }

  return parsed;
}

async function loadBillingSettings(supabase, accountId) {
  const { data, error } = await supabase
    .from('account_billing_settings')
    .select('committed_route_count, billing_rate_cents, currency, free_month_started_on, free_month_ends_on, is_billing_exempt')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    if (isMissingBillingTableError(error)) {
      return null;
    }

    throw error;
  }

  return data || null;
}

async function updateRouteBillingSettings({
  supabase,
  accountId,
  committedRouteCount,
  updatedAt = new Date().toISOString()
}) {
  if (!supabase) {
    throw new Error('updateRouteBillingSettings requires a Supabase client');
  }

  const normalizedCommittedRouteCount = normalizeCommittedRouteCount(committedRouteCount);

  if (normalizedCommittedRouteCount === null) {
    return {
      valid: false,
      error: `committed_route_count must be a whole number from 0 to ${MAX_COMMITTED_ROUTE_COUNT}`
    };
  }

  const { data, error } = await supabase
    .from('account_billing_settings')
    .upsert({
      account_id: accountId,
      committed_route_count: normalizedCommittedRouteCount,
      updated_at: updatedAt
    }, { onConflict: 'account_id' })
    .select('committed_route_count, billing_rate_cents, currency, free_month_started_on, free_month_ends_on, is_billing_exempt')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    valid: true,
    settings: data || {
      committed_route_count: normalizedCommittedRouteCount
    }
  };
}

function buildSettingsWithDefaults(settings = null, account = {}) {
  const hasCommittedRouteSetting = Object.prototype.hasOwnProperty.call(settings || {}, 'committed_route_count');
  const fallbackCommittedRoutes = Number(account?.vehicle_count || 0);
  const committedRouteCount = Number(settings?.committed_route_count ?? fallbackCommittedRoutes);
  const billingRateCents = Number(settings?.billing_rate_cents ?? DEFAULT_ROUTE_RATE_CENTS);
  const currency = String(settings?.currency || DEFAULT_CURRENCY).toLowerCase();

  return {
    committed_route_count: Number.isFinite(committedRouteCount) && committedRouteCount > 0
      ? Math.round(committedRouteCount)
      : 0,
    billing_rate_cents: Number.isFinite(billingRateCents) && billingRateCents >= 0
      ? Math.round(billingRateCents)
      : DEFAULT_ROUTE_RATE_CENTS,
    currency: currency || DEFAULT_CURRENCY,
    free_month_started_on: settings?.free_month_started_on || null,
    free_month_ends_on: settings?.free_month_ends_on || null,
    is_billing_exempt: Boolean(settings?.is_billing_exempt),
    commitment_source: hasCommittedRouteSetting ? 'billing_settings' : 'legacy_vehicle_count'
  };
}

function isPeriodInsideFreeMonth(periodStart, settings) {
  if (!settings?.free_month_started_on || !settings?.free_month_ends_on) {
    return false;
  }

  return periodStart >= settings.free_month_started_on && periodStart < settings.free_month_ends_on;
}

async function recordBillableManifestImport({
  supabase,
  accountId,
  routeId,
  routeDate,
  workAreaName,
  source = 'manifest_upload',
  manifestFingerprint = null,
  manifestLayers = [],
  managerUserId = null,
  importedAt = new Date().toISOString(),
  metadata = {}
}) {
  if (!supabase) {
    throw new Error('recordBillableManifestImport requires a Supabase client');
  }

  const routeKey = normalizeRouteBillingKey(workAreaName);
  const billingPeriod = getBillingPeriodForDate(routeDate);

  if (!accountId || !routeId || !routeKey || !billingPeriod) {
    return {
      recorded: false,
      skipped_reason: 'missing_required_route_billing_fields'
    };
  }

  const settings = buildSettingsWithDefaults(await loadBillingSettings(supabase, accountId));
  const billingExempt = settings.is_billing_exempt;
  const routeDisplayName = String(workAreaName || routeKey).trim();
  const baseMetadata = {
    ...metadata,
    manifest_layers: manifestLayers,
    route_date: routeDate
  };

  const { error: importError } = await supabase
    .from('billing_manifest_imports')
    .insert({
      account_id: accountId,
      route_id: routeId,
      route_date: routeDate,
      billing_period_start: billingPeriod.start,
      billing_period_end: billingPeriod.end,
      route_key: routeKey,
      route_display_name: routeDisplayName,
      source,
      manifest_fingerprint: manifestFingerprint || null,
      manifest_layer_count: Array.isArray(manifestLayers) ? manifestLayers.length : 0,
      manager_user_id: managerUserId || null,
      imported_at: importedAt,
      billing_exempt: billingExempt,
      metadata: baseMetadata
    });

  if (importError) {
    throw importError;
  }

  if (billingExempt) {
    return {
      recorded: true,
      billable: false,
      skipped_reason: 'account_billing_exempt',
      route_key: routeKey,
      billing_period_start: billingPeriod.start,
      billing_period_end: billingPeriod.end
    };
  }

  const ledgerPayload = {
    account_id: accountId,
    billing_period_start: billingPeriod.start,
    billing_period_end: billingPeriod.end,
    route_key: routeKey,
    route_display_name: routeDisplayName,
    first_route_id: routeId,
    last_route_id: routeId,
    first_imported_at: importedAt,
    last_imported_at: importedAt,
    status: 'pending',
    metadata: baseMetadata
  };
  const { error: ledgerInsertError } = await supabase
    .from('billable_route_months')
    .insert(ledgerPayload);

  if (ledgerInsertError) {
    if (ledgerInsertError.code !== '23505') {
      throw ledgerInsertError;
    }

    const { error: ledgerUpdateError } = await supabase
      .from('billable_route_months')
      .update({
        route_display_name: routeDisplayName,
        last_route_id: routeId,
        last_imported_at: importedAt,
        metadata: baseMetadata,
        updated_at: importedAt
      })
      .eq('account_id', accountId)
      .eq('billing_period_start', billingPeriod.start)
      .eq('route_key', routeKey);

    if (ledgerUpdateError) {
      throw ledgerUpdateError;
    }

    return {
      recorded: true,
      billable: true,
      ledger_action: 'updated',
      route_key: routeKey,
      billing_period_start: billingPeriod.start,
      billing_period_end: billingPeriod.end
    };
  }

  return {
    recorded: true,
    billable: true,
    ledger_action: 'inserted',
    route_key: routeKey,
    billing_period_start: billingPeriod.start,
    billing_period_end: billingPeriod.end
  };
}

async function getRouteBillingSummary({
  supabase,
  accountId,
  month,
  nowProvider = () => new Date()
}) {
  if (!supabase) {
    throw new Error('getRouteBillingSummary requires a Supabase client');
  }

  const billingPeriod = parseBillingMonth(month, nowProvider);

  if (!billingPeriod) {
    return null;
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('id, vehicle_count')
    .eq('id', accountId)
    .maybeSingle();

  if (accountError) {
    throw accountError;
  }

  if (!account) {
    return {
      not_found: true
    };
  }

  const settings = buildSettingsWithDefaults(await loadBillingSettings(supabase, accountId), account);
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('billable_route_months')
    .select('id, route_key, route_display_name, first_route_id, last_route_id, first_imported_at, last_imported_at, status')
    .eq('account_id', accountId)
    .eq('billing_period_start', billingPeriod.start)
    .order('route_display_name');

  if (ledgerError) {
    throw ledgerError;
  }

  const billableRoutes = (ledgerRows || []).filter((row) => row.status !== 'void');
  const importedBillableRoutes = billableRoutes.length;
  const committedRouteCount = settings.committed_route_count;
  const billableQuantity = Math.max(committedRouteCount, importedBillableRoutes);
  const additionalRouteCount = Math.max(0, importedBillableRoutes - committedRouteCount);
  const estimatedBeforeDiscountCents = billableQuantity * settings.billing_rate_cents;
  const freeMonthApplied = isPeriodInsideFreeMonth(billingPeriod.start, settings);
  const estimatedTotalCents = settings.is_billing_exempt || freeMonthApplied
    ? 0
    : estimatedBeforeDiscountCents;

  return {
    account_id: accountId,
    billing_period: {
      start: billingPeriod.start,
      end: billingPeriod.end,
      month: billingPeriod.start.slice(0, 7)
    },
    committed_route_count: committedRouteCount,
    commitment_source: settings.commitment_source,
    imported_billable_routes: importedBillableRoutes,
    billable_quantity: billableQuantity,
    included_route_count: Math.min(importedBillableRoutes, committedRouteCount),
    additional_route_count: additionalRouteCount,
    billing_rate_cents: settings.billing_rate_cents,
    currency: settings.currency,
    estimated_before_discount_cents: estimatedBeforeDiscountCents,
    estimated_total_cents: estimatedTotalCents,
    free_month_applied: freeMonthApplied,
    is_billing_exempt: settings.is_billing_exempt,
    billing_mode: 'shadow',
    routes: billableRoutes.map((row) => ({
      id: row.id,
      route_key: row.route_key,
      route_display_name: row.route_display_name,
      first_route_id: row.first_route_id,
      last_route_id: row.last_route_id,
      first_imported_at: row.first_imported_at,
      last_imported_at: row.last_imported_at,
      status: row.status
    }))
  };
}

module.exports = {
  DEFAULT_ROUTE_RATE_CENTS,
  DEFAULT_CURRENCY,
  MAX_COMMITTED_ROUTE_COUNT,
  normalizeRouteBillingKey,
  getBillingPeriodForDate,
  parseBillingMonth,
  recordBillableManifestImport,
  getRouteBillingSummary,
  updateRouteBillingSettings,
  __private: {
    buildSettingsWithDefaults,
    isPeriodInsideFreeMonth,
    normalizeCommittedRouteCount
  }
};
