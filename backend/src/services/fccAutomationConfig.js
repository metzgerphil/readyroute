function parseRouteFilter(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function renderTemplate(value, replacements) {
  return String(value || '').replace(/\{(\w+)\}/g, (_match, key) => replacements[key] ?? '');
}

function resolveFccAutomationConfig(env = process.env) {
  return {
    loginUrl: String(env.FEDEX_FCC_LOGIN_URL || '').trim(),
    portalUrl: String(env.FEDEX_FCC_PORTAL_URL || '').trim(),
    manifestUrl: String(env.FEDEX_FCC_MANIFEST_URL || env.FEDEX_FCC_MANIFEST_URL_TEMPLATE || '').trim(),
    usernameSelector: String(
      env.FEDEX_FCC_USERNAME_SELECTOR ||
        'input[name="identifier"], input[autocomplete="username"], input[type="email"], input[name="username"], input[name="email"]'
    ).trim(),
    passwordSelector: String(env.FEDEX_FCC_PASSWORD_SELECTOR || 'input[type="password"]').trim(),
    submitSelector: String(env.FEDEX_FCC_SUBMIT_SELECTOR || 'button[type="submit"], input[type="submit"]').trim(),
    postLoginSelector: String(env.FEDEX_FCC_POST_LOGIN_SELECTOR || '').trim(),
    mfaSelector: String(env.FEDEX_FCC_MFA_SELECTOR || '').trim(),
    portalManifestSelector: String(
      env.FEDEX_FCC_PORTAL_MANIFEST_SELECTOR ||
        'a:has-text("FedEx Customer Connection"), button:has-text("FedEx Customer Connection"), text="FedEx Customer Connection", a:has-text("P&D Manifests"), button:has-text("P&D Manifests"), text="P&D Manifests"'
    ).trim(),
    portalWarmupMs: Number(env.FEDEX_FCC_PORTAL_WARMUP_MS || 8000),
    manifestNavigationSelector: String(env.FEDEX_FCC_MANIFEST_NAV_SELECTOR || 'text=P&D Manifests').trim(),
    workAreaSelectSelector: String(env.FEDEX_FCC_WORK_AREA_SELECT_SELECTOR || 'select').trim(),
    relatedWorkAreaItemSelector: String(
      env.FEDEX_FCC_RELATED_WORK_AREA_ITEM_SELECTOR || 'xpath=//*[contains(normalize-space(),"Related Work Areas")]/following::*[self::li or self::div or self::span][normalize-space()]'
    ).trim(),
    searchButtonSelector: String(env.FEDEX_FCC_SEARCH_BUTTON_SELECTOR || 'button:has-text("Search"), input[value="Search"]').trim(),
    combinedManifestTabSelector: String(env.FEDEX_FCC_COMBINED_TAB_SELECTOR || 'text=Combined Manifest').trim(),
    recordsFoundSelector: String(env.FEDEX_FCC_RECORDS_FOUND_SELECTOR || 'text=/records found/i').trim(),
    exportXlsSelector: String(
      env.FEDEX_FCC_XLS_LINK_SELECTOR ||
        'input[src*="excel"], img[src*="excel"], button:has(img[src*="excel"]), a:has(img[src*="excel"])'
    ).trim(),
    exportGpxSelector: String(
      env.FEDEX_FCC_GPX_LINK_SELECTOR ||
        'input[src*="gpx"], img[src*="gpx"], button:has(img[src*="gpx"]), a:has(img[src*="gpx"])'
    ).trim(),
    manifestRowSelector: String(env.FEDEX_FCC_MANIFEST_ROW_SELECTOR || 'xpath=(//table)[last()]//tr[td]').trim(),
    routeValueSelector: String(env.FEDEX_FCC_ROUTE_VALUE_SELECTOR || '').trim(),
    dateValueSelector: String(env.FEDEX_FCC_DATE_VALUE_SELECTOR || '').trim(),
    routeFilter: parseRouteFilter(env.READYROUTE_FCC_ROUTE_FILTER || ''),
    runMode: String(env.READYROUTE_FCC_RUN_MODE || 'daily').trim().toLowerCase(),
    headless: String(env.FEDEX_FCC_HEADLESS || 'true').trim().toLowerCase() !== 'false',
    slowMoMs: Number(env.FEDEX_FCC_SLOW_MO_MS || 0)
  };
}

module.exports = {
  parseRouteFilter,
  renderTemplate,
  resolveFccAutomationConfig
};
