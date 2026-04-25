#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const { chromium } = require('playwright');
const { renderTemplate, resolveFccAutomationConfig } = require('../services/fccAutomationConfig');

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function saveDebugSnapshot(page, downloadDir, label) {
  const safeLabel = String(label || 'debug').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const debugDir = path.join(downloadDir || process.cwd(), '_debug');
  await fs.mkdir(debugDir, { recursive: true });

  const metadata = {
    url: page.url(),
    title: await page.title().catch(() => ''),
    captured_at: new Date().toISOString()
  };

  await fs.writeFile(path.join(debugDir, `${safeLabel}.json`), JSON.stringify(metadata, null, 2));
  await fs.writeFile(path.join(debugDir, `${safeLabel}.html`), await page.content().catch(() => ''));
  await page.screenshot({ path: path.join(debugDir, `${safeLabel}.png`), fullPage: true }).catch(() => null);

  const frameMetadata = [];
  const frames = page.frames();

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const frameLabel = `${safeLabel}.frame-${index}`;

    frameMetadata.push({
      index,
      name: frame.name(),
      url: frame.url()
    });

    await fs.writeFile(path.join(debugDir, `${frameLabel}.html`), await frame.content().catch(() => '')).catch(() => null);
    await fs.writeFile(
      path.join(debugDir, `${frameLabel}.txt`),
      await frame.locator('body').textContent({ timeout: 2000 }).catch(() => '')
    ).catch(() => null);
  }

  await fs.writeFile(path.join(debugDir, `${safeLabel}.frames.json`), JSON.stringify(frameMetadata, null, 2)).catch(() => null);

  return debugDir;
}

async function gotoWithRetry(page, url, options = {}, attempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.goto(url, options);
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await page.waitForTimeout(1000 * attempt);
      }
    }
  }

  throw lastError;
}

async function pageHasText(page, pattern) {
  const bodyText = await page.locator('body').textContent({ timeout: 3000 }).catch(() => '');
  return pattern.test(normalizeText(bodyText));
}

async function hasFccWorkAreaUi(page, config) {
  return (
    Boolean(await findWorkAreaSelect(page, config, { timeout: 3000 })) ||
    await page.locator(config.combinedManifestTabSelector).first().isVisible({ timeout: 3000 }).catch(() => false)
  );
}

async function hasMgbaAuthenticationError(page) {
  return pageHasText(page, /error authenticating with mgba/i);
}

async function findVisibleLocator(page, selector, timeout = 5000) {
  const locator = page.locator(selector);
  const deadline = Date.now() + timeout;

  while (Date.now() <= deadline) {
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const visible = await candidate.isVisible({ timeout: 200 }).catch(() => false);

      if (visible) {
        return candidate;
      }
    }

    await page.waitForTimeout(250);
  }

  return null;
}

function buildManifestUrl(config, workDate) {
  if (!config.manifestUrl) {
    throw new Error('FEDEX_FCC_MANIFEST_URL or FEDEX_FCC_MANIFEST_URL_TEMPLATE is required');
  }

  return renderTemplate(config.manifestUrl, { workDate });
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWorkAreaKey(value) {
  return normalizeText(value).toLowerCase();
}

function extractRouteCode(value) {
  const match = normalizeText(value).match(/\b(\d{3,5})\b/);
  return match ? match[1] : null;
}

function isMeaningfulWorkAreaName(value) {
  const text = normalizeText(value);
  return Boolean(
    text &&
      text.length <= 120 &&
      text.toLowerCase() !== 'null' &&
      !/[{};=]/.test(text) &&
      !/\b(function|var|getElementById|window|document)\b/i.test(text) &&
      extractRouteCode(text)
  );
}

function colorLooksGreen(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);

  if (!match) {
    return false;
  }

  const [, r, g, b] = match.map(Number);
  return g >= 150 && g > r + 15 && g > b + 15;
}

function toInt(value) {
  const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function ensureLoggedIn(page, config, credentials) {
  if (!config.loginUrl) {
    return;
  }

  if (await hasFccWorkAreaUi(page, config)) {
    return;
  }

  const currentUrl = page.url();
  const onLoginPage = currentUrl.startsWith(config.loginUrl);

  if (!onLoginPage && config.postLoginSelector) {
    const visible = await page.locator(config.postLoginSelector).first().isVisible().catch(() => false);
    if (visible) {
      return;
    }
  }

  const myBizSignInButton = await findVisibleLocator(page, 'input[value="Sign In"], button:has-text("Sign In")');

  if (myBizSignInButton) {
    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => null),
      myBizSignInButton.click()
    ]);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
  }

  const usernameField = await findVisibleLocator(page, config.usernameSelector);
  const passwordField = await findVisibleLocator(page, config.passwordSelector);

  if (usernameField) {
    await usernameField.fill(credentials.username);
  }

  if (!passwordField && usernameField) {
    const submitButton = await findVisibleLocator(page, config.submitSelector);

    if (!submitButton) {
      const debugDir = await saveDebugSnapshot(page, config.downloadDir, 'fcc-login-submit-missing');
      throw new Error(`Could not find the PurpleID/FCC submit button after entering the username. Debug saved to ${debugDir}`);
    }

    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => null),
      submitButton.click()
    ]);
  }

  const resolvedPasswordField = await findVisibleLocator(page, config.passwordSelector, 15000);

  if (!resolvedPasswordField) {
    const currentUrl = page.url();
    const loginFlowAdvanced = config.loginUrl && !currentUrl.startsWith(config.loginUrl);

    if (!usernameField && loginFlowAdvanced) {
      return;
    }

    const debugDir = await saveDebugSnapshot(page, config.downloadDir, 'fcc-login-password-missing');
    throw new Error(`Could not find the PurpleID/FCC password field after opening the login page. Debug saved to ${debugDir}`);
  }

  await resolvedPasswordField.fill(credentials.password);
  const submitButton = await findVisibleLocator(page, config.submitSelector);

  if (!submitButton) {
    const debugDir = await saveDebugSnapshot(page, config.downloadDir, 'fcc-login-password-submit-missing');
    throw new Error(`Could not find the PurpleID/FCC submit button after entering the password. Debug saved to ${debugDir}`);
  }

  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => null),
    submitButton.click()
  ]);

  if (config.mfaSelector) {
    const mfaVisible = await page.locator(config.mfaSelector).first().isVisible().catch(() => false);
    if (mfaVisible) {
      throw new Error('FCC portal requires MFA before automation can continue.');
    }
  }

  if (config.postLoginSelector) {
    await page.locator(config.postLoginSelector).first().waitFor({ state: 'visible', timeout: 15000 });
  }
}

async function clickPortalManifestEntry(page, config) {
  const fccLinksFrame = page.frameLocator('iframe[title="FCC Links"]');
  const fccLinksFrameSelectors = [
    '#GF_FLUID_TL_WRK_GF_HYPERLINK1\\$0',
    'a:has-text("FedEx Customer Connection")',
    'tr:has-text("FedEx Customer Connection")'
  ];

  for (const selector of fccLinksFrameSelectors) {
    const fccLinksFrameEntry = fccLinksFrame.locator(selector).first();
    const fccLinksFrameEntryVisible = await fccLinksFrameEntry.isVisible({ timeout: 5000 }).catch(() => false);

    if (fccLinksFrameEntryVisible) {
      await Promise.all([
        page.waitForLoadState('domcontentloaded').catch(() => null),
        fccLinksFrameEntry.click()
      ]);
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => null);
      await page.waitForTimeout(5000);
      return true;
    }
  }

  const selectors = [
    config.portalManifestSelector,
    'text=FedEx Customer Connection',
    'xpath=//*[contains(normalize-space(.), "FedEx Customer Connection") and not(self::script)]',
    'text=P&D Manifests',
    'xpath=//*[contains(normalize-space(.), "P&D Manifests") and not(self::script)]'
  ].filter(Boolean);

  let entry = null;

  for (const selector of selectors) {
    entry = await findVisibleLocator(page, selector, 2000);

    if (entry) {
      break;
    }
  }

  if (!entry) {
    return false;
  }

  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => null),
    entry.click()
  ]);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
  return true;
}

async function enterFccThroughPortal(page, config, downloadDir) {
  if (!config.portalUrl) {
    return false;
  }

  await gotoWithRetry(page, config.portalUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(config.portalWarmupMs);

  if (await hasFccWorkAreaUi(page, config)) {
    await saveDebugSnapshot(page, downloadDir, 'fcc-portal-entered');
    return true;
  }

  const clickedManifestEntry = await clickPortalManifestEntry(page, config);

  if (clickedManifestEntry) {
    await page.waitForTimeout(3000);
  }

  if (await hasFccWorkAreaUi(page, config)) {
    await saveDebugSnapshot(page, downloadDir, 'fcc-portal-entered');
    return true;
  }

  await saveDebugSnapshot(page, downloadDir, clickedManifestEntry ? 'fcc-portal-after-manifest-click' : 'fcc-portal-no-manifest-entry');
  return clickedManifestEntry;
}

async function openManifestPage(page, config, manifestUrl, downloadDir) {
  await gotoWithRetry(page, manifestUrl, { waitUntil: 'networkidle' });

  if (await hasMgbaAuthenticationError(page)) {
    const debugDir = await saveDebugSnapshot(page, downloadDir, 'fcc-mgba-authentication-error');
    throw new Error(
      `FedEx rejected the direct FCC page with "Error authenticating with MGBA". ` +
        `ReadyRoute needs the portal entry route before cpc-mi can load. Debug saved to ${debugDir}`
    );
  }

  if (await hasFccWorkAreaUi(page, config)) {
    return true;
  }

  if (config.manifestNavigationSelector) {
    const manifestNavigation = await findVisibleLocator(page, config.manifestNavigationSelector, 5000);

    if (manifestNavigation) {
      await Promise.all([
        page.waitForLoadState('domcontentloaded').catch(() => null),
        manifestNavigation.click()
      ]);
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => null);
      await page.waitForTimeout(5000);
    }
  }

  return hasFccWorkAreaUi(page, config);
}

async function preparePortalSession(page, config, credentials, downloadDir) {
  await enterFccThroughPortal(page, config, downloadDir);

  if (await hasFccWorkAreaUi(page, config)) {
    return;
  }

  await ensureLoggedIn(page, config, credentials);
  await enterFccThroughPortal(page, config, downloadDir);
}

async function ensureCombinedManifestTab(page, config) {
  if (!config.combinedManifestTabSelector) {
    return;
  }

  await waitForFccIdle(page);

  const tab = page.locator(config.combinedManifestTabSelector).first();
  const visible = await tab.isVisible().catch(() => false);

  if (visible) {
    await tab.click({ timeout: 10000 }).catch(async (error) => {
      if (!/intercepts pointer events|Timeout/i.test(String(error?.message || error))) {
        throw error;
      }

      await waitForFccIdle(page, 60000);
      await tab.click({ force: true, timeout: 5000 });
    });
    await waitForFccIdle(page);
  }
}

async function waitForFccIdle(page, timeout = 60000) {
  const overlaySelectors = [
    '#manifestForm\\:submitTransferNotification_bg',
    '.mobi-submitnotific-bg'
  ];

  for (const selector of overlaySelectors) {
    const overlay = page.locator(selector).first();
    const count = await overlay.count().catch(() => 0);

    if (count > 0) {
      await overlay.waitFor({ state: 'hidden', timeout }).catch(() => null);
    }
  }
}

async function findWorkAreaSelect(page, config, { timeout = 1000 } = {}) {
  const deadline = Date.now() + timeout;

  while (Date.now() <= deadline) {
    const selects = page.locator(config.workAreaSelectSelector);
    const count = await selects.count().catch(() => 0);
    let firstVisible = null;

    for (let index = 0; index < count; index += 1) {
      const candidate = selects.nth(index);
      const hasRouteOptions = await candidate.evaluate((element) => {
        return Array.from(element.options || []).some((option) => {
          const text = String(option.textContent || option.value || '').replace(/\s+/g, ' ').trim();
          return text.toLowerCase() !== 'null' && /\b\d{3,5}\b/.test(text);
        });
      }).catch(() => false);

      if (hasRouteOptions) {
        return candidate;
      }

      if (!firstVisible && await candidate.isVisible({ timeout: 200 }).catch(() => false)) {
        firstVisible = candidate;
      }
    }

    if (firstVisible) {
      return firstVisible;
    }

    await page.waitForTimeout(250);
  }

  return null;
}

async function clickSearch(page, config) {
  await waitForFccIdle(page);
  const trigger = page.locator(config.searchButtonSelector).first();
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => null),
    trigger.click()
  ]);
  await waitForFccIdle(page);
}

async function readSelectedWorkArea(page, config) {
  const select = await findWorkAreaSelect(page, config);

  if (!select) {
    return null;
  }

  return normalizeText(
    await select.evaluate((element) => {
      const selectedIndex = Number(element.selectedIndex || 0);
      return element.options?.[selectedIndex]?.textContent || element.value || '';
    })
  );
}

async function readWorkAreaOptions(page, config) {
  const select = await findWorkAreaSelect(page, config);

  if (!select) {
    return [];
  }

  return select.evaluate((element) =>
    Array.from(element.options || [])
      .map((option) => option.textContent || option.value || '')
      .filter(Boolean)
  ).catch(() => []);
}

async function writeWorkAreaDebug(page, config, downloadDir, label, workAreas = []) {
  const safeLabel = String(label || 'work-area-debug').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const debugDir = path.join(downloadDir || process.cwd(), '_debug');
  await fs.mkdir(debugDir, { recursive: true });

  const selectSnapshots = [];
  const selects = page.locator(config.workAreaSelectSelector);
  const count = await selects.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const select = selects.nth(index);
    const snapshot = await select.evaluate((element) => {
      const options = Array.from(element.options || []).map((option) => ({
        value: option.value || '',
        text: String(option.textContent || '').replace(/\s+/g, ' ').trim()
      }));

      return {
        id: element.id || '',
        name: element.getAttribute('name') || '',
        className: element.getAttribute('class') || '',
        value: element.value || '',
        selectedIndex: Number(element.selectedIndex || 0),
        selectedText: options[Number(element.selectedIndex || 0)]?.text || '',
        optionCount: options.length,
        options: options.slice(0, 100)
      };
    }).catch((error) => ({ error: error.message || String(error) }));

    selectSnapshots.push({
      index,
      visible: await select.isVisible({ timeout: 200 }).catch(() => false),
      ...snapshot
    });
  }

  await fs.writeFile(
    path.join(debugDir, `${safeLabel}.json`),
    JSON.stringify({
      url: page.url(),
      title: await page.title().catch(() => ''),
      workAreas,
      selectSnapshots
    }, null, 2)
  );

  return debugDir;
}

async function listCandidateWorkAreas(page, config) {
  const currentWorkArea = await readSelectedWorkArea(page, config);
  const optionWorkAreas = await readWorkAreaOptions(page, config);
  const workAreas = [];

  for (const optionWorkArea of optionWorkAreas) {
    const text = normalizeText(optionWorkArea);

    if (isMeaningfulWorkAreaName(text)) {
      workAreas.push(text);
    }
  }

  if (isMeaningfulWorkAreaName(currentWorkArea)) {
    workAreas.push(currentWorkArea);
  }

  const deduped = [];
  const seen = new Set();

  for (const workArea of workAreas) {
    const key = extractRouteCode(workArea) || normalizeWorkAreaKey(workArea);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(workArea);
  }

  if (config.routeFilter.length === 0) {
    return deduped;
  }

  return deduped.filter((workArea) => {
    const routeCode = extractRouteCode(workArea);
    return config.routeFilter.some((route) => workArea.includes(route) || (routeCode && routeCode === route));
  });
}

async function selectWorkArea(page, config, targetWorkArea) {
  const select = await findWorkAreaSelect(page, config);

  if (!select) {
    throw new Error('FCC work area selector is not visible.');
  }

  const resolvedValue = await select.evaluate((element, target) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const targetNormalized = normalize(target);
    const targetCodeMatch = String(target || '').match(/\b(\d{3,5})\b/);
    const targetCode = targetCodeMatch ? targetCodeMatch[1] : null;

    const options = Array.from(element.options || []);
    const matched = options.find((option) => {
      const optionText = normalize(option.textContent || option.value || '');
      const optionCodeMatch = optionText.match(/\b(\d{3,5})\b/);
      const optionCode = optionCodeMatch ? optionCodeMatch[1] : null;

      return optionText === targetNormalized ||
        optionText.includes(targetNormalized) ||
        targetNormalized.includes(optionText) ||
        (targetCode && optionCode && targetCode === optionCode);
    });

    if (!matched) {
      return null;
    }

    element.value = matched.value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return matched.textContent || matched.value;
  }, targetWorkArea);

  if (!resolvedValue) {
    throw new Error(`Could not find FCC work area option for "${targetWorkArea}".`);
  }

  if (!isMeaningfulWorkAreaName(resolvedValue)) {
    throw new Error(`FCC selected an invalid work area value for "${targetWorkArea}": "${normalizeText(resolvedValue)}".`);
  }

  return normalizeText(resolvedValue);
}

async function downloadFromPage(page, selector, destinationPath) {
  const trigger = page.locator(selector).first();
  const visible = await trigger.isVisible().catch(() => false);

  if (!visible) {
    return null;
  }

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    trigger.click()
  ]);

  await download.saveAs(destinationPath);
  return destinationPath;
}

async function parseRecordCount(page) {
  const bodyText = normalizeText(await page.locator('body').textContent().catch(() => ''));
  const match = bodyText.match(/(\d+)\s+records found/i);
  return match ? Number(match[1]) : 0;
}

async function collectProgressRows(page, config) {
  const rows = page.locator(config.manifestRowSelector);
  const rowCount = await rows.count().catch(() => 0);
  const collected = [];

  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    const cells = await row.locator('td').allTextContents().catch(() => []);

    if (!cells || cells.length < 10) {
      continue;
    }

    const [stopNumber, sid, deliveryPickup, contactName, address, cityState, postalCode, readyTime, closeTime, packageCount] = cells.map(
      normalizeText
    );
    const cityStateParts = String(cityState || '').split(/\s+/);
    const state = cityStateParts.pop() || '';
    const city = cityStateParts.join(' ');
    const rowColors = await row.evaluate((element) => {
      const rowStyle = window.getComputedStyle(element).backgroundColor || '';
      const cellStyles = Array.from(element.querySelectorAll('td')).map((cell) => window.getComputedStyle(cell).backgroundColor || '');
      return [rowStyle, ...cellStyles].filter(Boolean);
    }).catch(() => '');
    const colors = Array.isArray(rowColors) ? rowColors : [rowColors].filter(Boolean);
    const completedColor = colors.find(colorLooksGreen) || '';

    collected.push({
      stop_number: toInt(stopNumber),
      sid: sid || null,
      delivery_pickup: deliveryPickup || null,
      contact_name: contactName || null,
      address: address || null,
      city: city || null,
      state: state || null,
      postal_code: postalCode || null,
      ready_time: readyTime || null,
      close_time: closeTime || null,
      package_count: toInt(packageCount),
      is_completed: Boolean(completedColor),
      row_color: completedColor || colors[0] || ''
    });
  }

  return collected;
}

async function collectWorkAreaSnapshot(page, config, workAreaName, workDate, downloadDir, { includeDownloads }) {
  await ensureCombinedManifestTab(page, config);
  const resolvedWorkAreaName = await selectWorkArea(page, config, workAreaName);
  await clickSearch(page, config);
  await ensureCombinedManifestTab(page, config);

  const rowDir = path.join(
    downloadDir,
    resolvedWorkAreaName.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'work-area'
  );
  await fs.mkdir(rowDir, { recursive: true });

  const rows = await collectProgressRows(page, config);
  const recordCount = await parseRecordCount(page);
  let xlsPath = null;
  let gpxPath = null;

  if (rows.length > 0) {
    await fs.writeFile(
      path.join(rowDir, 'progress_rows_sample.json'),
      JSON.stringify(rows.slice(0, 10), null, 2)
    ).catch(() => null);
  }

  if (includeDownloads && recordCount > 0) {
    xlsPath = await downloadFromPage(
      page,
      config.exportXlsSelector,
      path.join(rowDir, `${resolvedWorkAreaName || 'manifest'}.xls`)
    );
    gpxPath = await downloadFromPage(
      page,
      config.exportGpxSelector,
      path.join(rowDir, `${resolvedWorkAreaName || 'manifest'}.gpx`)
    );
  }

  return {
    work_area_name: resolvedWorkAreaName,
    date: workDate,
    record_count: recordCount,
    delivered_packages: 0,
    rows,
    xls_path: xlsPath,
    gpx_path: gpxPath
  };
}

async function main() {
  const config = resolveFccAutomationConfig(process.env);
  const username = requiredEnv('READYROUTE_FCC_USERNAME');
  const password = requiredEnv('READYROUTE_FCC_PASSWORD');
  const workDate = requiredEnv('READYROUTE_FCC_WORK_DATE');
  const downloadDir = requiredEnv('READYROUTE_FCC_DOWNLOAD_DIR');
  const sessionStatePath = requiredEnv('READYROUTE_FCC_SESSION_STATE_PATH');
  config.downloadDir = downloadDir;

  await fs.mkdir(downloadDir, { recursive: true });
  await fs.mkdir(path.dirname(sessionStatePath), { recursive: true });

  const browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMoMs
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      ...(await exists(sessionStatePath) ? { storageState: sessionStatePath } : {})
    });
    const page = await context.newPage();
    const manifestUrl = buildManifestUrl(config, workDate);
    const hasSavedSession = await exists(sessionStatePath);
    const credentials = { username, password };

    if (hasSavedSession) {
      await preparePortalSession(page, config, credentials, downloadDir);
      await openManifestPage(page, config, manifestUrl, downloadDir);
    } else {
      await gotoWithRetry(page, config.loginUrl || manifestUrl, { waitUntil: 'domcontentloaded' });
      await ensureLoggedIn(page, config, credentials);
      await preparePortalSession(page, config, credentials, downloadDir);
      await openManifestPage(page, config, manifestUrl, downloadDir);
    }

    await ensureCombinedManifestTab(page, config);

    const workAreas = await listCandidateWorkAreas(page, config);
    await writeWorkAreaDebug(page, config, downloadDir, 'fcc-work-area-candidates', workAreas);

    if (workAreas.length === 0) {
      const debugDir = await saveDebugSnapshot(page, downloadDir, 'fcc-no-work-areas');
      throw new Error(`FCC page loaded, but no work areas were found. Debug saved to ${debugDir}`);
    }

    const snapshots = [];

    for (const workArea of workAreas) {
      snapshots.push(
        await collectWorkAreaSnapshot(page, config, workArea, workDate, downloadDir, {
          includeDownloads: config.runMode !== 'progress'
        })
      );
    }

    await context.storageState({ path: sessionStatePath });

    const manifests = snapshots
      .filter((snapshot) => snapshot.xls_path)
      .map((snapshot) => ({
        work_area_name: snapshot.work_area_name,
        date: snapshot.date,
        xls_path: snapshot.xls_path,
        gpx_path: snapshot.gpx_path
      }));

    console.log(JSON.stringify({
      summary:
        config.runMode === 'progress'
          ? `Synced FCC progress for ${snapshots.length} work areas.`
          : `Pulled ${manifests.length} FCC manifests.`,
      manifests,
      progress_snapshots: snapshots.map((snapshot) => ({
        work_area_name: snapshot.work_area_name,
        date: snapshot.date,
        record_count: snapshot.record_count,
        delivered_packages: snapshot.delivered_packages,
        rows: snapshot.rows
      }))
    }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
