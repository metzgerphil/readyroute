const API_URL = 'https://api.readyroute.org';
const TOKEN_KEY = 'readyroute_rra_manager_token';

const loginView = document.querySelector('#login-view');
const portalView = document.querySelector('#portal-view');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('#login-button');
const loginError = document.querySelector('#login-error');
const resetForm = document.querySelector('#reset-form');
const resetMessage = document.querySelector('#reset-message');
const inviteForm = document.querySelector('#invite-form');
const inviteButton = document.querySelector('#invite-button');
const inviteError = document.querySelector('#invite-error');
const showResetButton = document.querySelector('#show-reset-button');
const driverList = document.querySelector('#driver-list');
const driversMessage = document.querySelector('#drivers-message');
const driversError = document.querySelector('#drivers-error');
const driverForm = document.querySelector('#driver-form');
const addDriverCard = document.querySelector('#add-driver-card');
const managerList = document.querySelector('#manager-list');
const managersMessage = document.querySelector('#managers-message');
const managersError = document.querySelector('#managers-error');
const managerForm = document.querySelector('#manager-form');
const addManagerCard = document.querySelector('#add-manager-card');
const billingError = document.querySelector('#billing-error');
const manageBillingButton = document.querySelector('#manage-billing-button');
const passwordForm = document.querySelector('#password-form');
const aiAuthorizationCheckbox = document.querySelector('#ai-authorization-checkbox');
const aiAuthorizationStatus = document.querySelector('#ai-authorization-status');
const aiAuthorizationMessage = document.querySelector('#ai-authorization-message');
const saveAiAuthorizationButton = document.querySelector('#save-ai-authorization-button');
const localContactsForm = document.querySelector('#local-contacts-form');
const localContactsMessage = document.querySelector('#local-contacts-message');
const saveLocalContactsButton = document.querySelector('#save-local-contacts-button');
const monthlyReportHistory = document.querySelector('#monthly-report-history');
const AI_AUTHORIZATION_POLICY_VERSION = '2026-08-20';

function setMessage(element, message = '') {
  element.textContent = message;
  element.hidden = !message;
}

function decodeToken(token) {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(encoded.padEnd(encoded.length + ((4 - encoded.length % 4) % 4), '=')));
  } catch {
    return null;
  }
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  portalView.hidden = true;
  loginView.hidden = false;
  driverList.replaceChildren();
  managerList.replaceChildren();
}

function showPortalView(view = 'overview') {
  const resolvedView = ['overview', 'drivers', 'managers', 'billing', 'settings'].includes(view) ? view : 'overview';
  document.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== resolvedView; });
  document.querySelectorAll('[data-view]').forEach((button) => { button.classList.toggle('active', button.dataset.view === resolvedView); });
  const url = new URL(window.location.href);
  if (resolvedView === 'overview') url.searchParams.delete('view');
  else url.searchParams.set('view', resolvedView);
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) clearSession();
  if (!response.ok) throw new Error(payload.error || 'ReadyRoute is temporarily unavailable.');
  return payload;
}

function accessLabel(driver) {
  if (driver.is_active === false || driver.access_status === 'deactivated') return 'inactive';
  if (driver.access_status === 'invite_expired') return 'expired';
  if (driver.access_status === 'invited' || driver.access_status === 'not_invited') return 'pending';
  return 'active';
}

function renderDrivers(drivers) {
  driverList.replaceChildren();
  const active = drivers.filter((driver) => accessLabel(driver) === 'active').length;
  const pending = drivers.filter((driver) => ['pending', 'expired'].includes(accessLabel(driver))).length;
  document.querySelector('#active-count').textContent = String(active);
  document.querySelector('#pending-count').textContent = String(pending);

  if (!drivers.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No drivers yet. Add the first authorized driver to send an invitation.';
    driverList.append(empty);
    return;
  }

  drivers.forEach((driver) => {
    const status = accessLabel(driver);
    const row = document.createElement('article');
    row.className = 'driver-row';

    const identity = document.createElement('div');
    identity.className = 'driver-name';
    const name = document.createElement('strong');
    name.textContent = driver.name || 'Driver';
    const username = document.createElement('span');
    username.textContent = driver.username ? `@${driver.username}` : 'Username chosen during setup';
    identity.append(name, username);

    const email = document.createElement('div');
    email.className = 'driver-email';
    email.textContent = driver.email || '';

    const badge = document.createElement('span');
    badge.className = `status ${status}`;
    badge.textContent = status;

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    if (['pending', 'expired'].includes(status)) {
      const inviteButton = document.createElement('button');
      inviteButton.type = 'button';
      inviteButton.textContent = status === 'expired' ? 'Send new invite' : 'Resend invite';
      inviteButton.addEventListener('click', () => sendInvite(driver.id, inviteButton));
      actions.append(inviteButton);
    }
    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.textContent = status === 'inactive' ? 'Reactivate' : 'Deactivate';
    statusButton.addEventListener('click', () => updateDriverStatus(driver.id, status === 'inactive', statusButton));
    actions.append(statusButton);

    row.append(identity, email, badge, actions);
    driverList.append(row);
  });
}

async function loadDrivers() {
  setMessage(driversError);
  driverList.innerHTML = '<div class="empty-state">Loading authorized drivers…</div>';
  try {
    const payload = await request('/manager/drivers');
    renderDrivers(payload.drivers || []);
  } catch (error) {
    setMessage(driversError, error.message);
    driverList.replaceChildren();
  }
}

function renderManagers(managers) {
  managerList.replaceChildren();
  if (!managers.length) {
    managerList.innerHTML = '<div class="empty-state">No managers are listed for this company.</div>';
    return;
  }
  managers.forEach((manager) => {
    const status = manager.is_active === false ? 'inactive' : manager.accepted_at || manager.status === 'active' ? 'active' : 'pending';
    const row = document.createElement('article');
    row.className = 'driver-row manager-row';
    const identity = document.createElement('div');
    identity.className = 'driver-name';
    const name = document.createElement('strong');
    name.textContent = manager.full_name || manager.email;
    const role = document.createElement('span');
    role.textContent = manager.is_primary ? 'Company owner' : 'Manager';
    identity.append(name, role);
    const email = document.createElement('div');
    email.className = 'driver-email';
    email.textContent = manager.email;
    const badge = document.createElement('span');
    badge.className = `status ${status}`;
    badge.textContent = status;
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    if (!manager.is_primary && status === 'pending') {
      const resend = document.createElement('button');
      resend.type = 'button';
      resend.textContent = 'Resend invite';
      resend.addEventListener('click', () => managerAccessAction(manager.id, 'invite', resend));
      actions.append(resend);
    }
    if (status === 'active') {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = 'Send password reset';
      reset.addEventListener('click', () => managerAccessAction(manager.id, 'password-reset', reset));
      actions.append(reset);
    }
    row.append(identity, email, badge, actions);
    managerList.append(row);
  });
}

async function loadManagers() {
  setMessage(managersError);
  managerList.innerHTML = '<div class="empty-state">Loading managers…</div>';
  try {
    const payload = await request('/manager/manager-users');
    renderManagers(payload.manager_users || []);
  } catch (error) {
    setMessage(managersError, error.message);
    managerList.replaceChildren();
  }
}

async function managerAccessAction(managerId, action, button) {
  if (!managerId) return;
  button.disabled = true;
  setMessage(managersMessage);
  setMessage(managersError);
  try {
    const payload = await request(`/manager/manager-users/${encodeURIComponent(managerId)}/${action}`, { method: 'POST' });
    await loadManagers();
    setMessage(managersMessage, payload.message || 'Manager access updated.');
  } catch (error) {
    setMessage(managersError, error.message);
  } finally {
    button.disabled = false;
  }
}

async function loadBilling() {
  setMessage(billingError);
  manageBillingButton.hidden = true;
  try {
    const payload = await request('/manager/account/lifecycle');
    const account = payload.account || {};
    const complimentary = account.rra_billing_treatment === 'complimentary';
    document.querySelector('#billing-title').textContent = complimentary ? 'Complimentary RRA access' : 'Ready Route Answers billing';
    document.querySelector('#billing-description').textContent = complimentary
      ? 'Your company has full RRA access at no charge. Driver activity and monthly value are still tracked normally.'
      : account.has_stripe_customer
        ? 'Payment details and invoices are handled securely by Stripe.'
        : 'Payment setup is not complete. No charge can occur until payment setup and billing activation are complete.';
    manageBillingButton.hidden = complimentary || !account.has_stripe_customer;
  } catch (error) {
    setMessage(billingError, error.message);
  }
}

async function loadAiAuthorization() {
  setMessage(aiAuthorizationMessage);
  try {
    const payload = await request('/manager/account/ai-authorization');
    aiAuthorizationCheckbox.checked = payload.company_ai_processing_authorized === true;
    aiAuthorizationCheckbox.disabled = payload.can_manage === false;
    saveAiAuthorizationButton.hidden = payload.can_manage === false;
    aiAuthorizationStatus.textContent = payload.company_ai_processing_authorized
      ? `Authorized for this company${payload.company_authorized_at ? ` since ${new Date(payload.company_authorized_at).toLocaleDateString()}` : ''}.`
      : 'AI language interpretation is currently off for this company.';
  } catch (error) {
    aiAuthorizationStatus.textContent = 'Company authorization could not be loaded.';
    aiAuthorizationCheckbox.disabled = true;
    saveAiAuthorizationButton.hidden = true;
    setMessage(aiAuthorizationMessage, error.message);
  }
}

async function loadLocalContacts() {
  setMessage(localContactsMessage);
  try {
    const payload = await request('/manager/account/local-contacts');
    document.querySelector('#cxpc-phone-number').value = payload.cxpc_phone_number || '';
    document.querySelector('#csa-phone-number').value = payload.csa_phone_number || '';
    document.querySelector('#primary-manager-name').value = payload.manager_name || '';
    document.querySelector('#primary-manager-phone-number').value = payload.manager_phone_number || '';
    localContactsForm.querySelectorAll('input').forEach((input) => { input.disabled = payload.can_manage === false; });
    saveLocalContactsButton.hidden = payload.can_manage === false;
  } catch (error) {
    localContactsForm.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    saveLocalContactsButton.hidden = true;
    setMessage(localContactsMessage, error.message);
  }
}

function formatReportMonth(value) {
  const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'Monthly report';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function renderMonthlyValueReports(reports = []) {
  if (!reports.length) return;
  monthlyReportHistory.className = 'report-history';
  monthlyReportHistory.replaceChildren();

  reports.slice(0, 3).forEach((report) => {
    const metrics = report.metrics || {};
    const item = document.createElement('article');
    item.className = 'report-row';

    const heading = document.createElement('div');
    const month = document.createElement('strong');
    month.textContent = formatReportMonth(report.report_month);
    const status = document.createElement('span');
    status.textContent = report.delivery_status === 'sent' ? 'Ready' : 'Recorded';
    heading.append(month, status);

    const summary = document.createElement('p');
    const questions = Number(metrics.total_questions || 0);
    const answers = Number(metrics.verified_answers || 0);
    const hours = Number(metrics.estimated_manager_minutes_avoided || 0) / 60;
    summary.textContent = `${questions} questions · ${answers} verified answers · ${hours.toFixed(1)} estimated hours saved`;
    item.append(heading, summary);
    monthlyReportHistory.append(item);
  });
}

async function loadMonthlyValueReports() {
  try {
    const payload = await request('/manager/account/monthly-value-reports');
    renderMonthlyValueReports(Array.isArray(payload.reports) ? payload.reports : []);
  } catch (_error) {
    monthlyReportHistory.className = 'report-empty';
    monthlyReportHistory.replaceChildren();
    const label = document.createElement('span');
    label.textContent = 'Report history';
    const message = document.createElement('strong');
    message.textContent = 'Temporarily unavailable';
    monthlyReportHistory.append(label, message);
  }
}

async function openPortal() {
  const payload = decodeToken(getToken());
  if (!payload || payload.role !== 'manager') {
    clearSession();
    return;
  }
  document.querySelector('#company-name').textContent = payload.company_name || 'Your company';
  loginView.hidden = true;
  portalView.hidden = false;
  await Promise.all([loadDrivers(), loadManagers(), loadBilling(), loadAiAuthorization(), loadLocalContacts(), loadMonthlyValueReports()]);
  showPortalView(new URLSearchParams(window.location.search).get('view') || 'overview');
}

async function sendInvite(driverId, button) {
  button.disabled = true;
  setMessage(driversError);
  try {
    await request(`/manager/drivers/${encodeURIComponent(driverId)}/invite`, { method: 'POST' });
    await loadDrivers();
  } catch (error) {
    setMessage(driversError, error.message);
  } finally {
    button.disabled = false;
  }
}

async function updateDriverStatus(driverId, isActive, button) {
  button.disabled = true;
  setMessage(driversError);
  try {
    await request(`/manager/drivers/${encodeURIComponent(driverId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive })
    });
    await loadDrivers();
  } catch (error) {
    setMessage(driversError, error.message);
  } finally {
    button.disabled = false;
  }
}

const credentialParams = new URLSearchParams(window.location.search);
const inviteToken = credentialParams.get('invite') || credentialParams.get('reset') || '';
const isPasswordReset = Boolean(credentialParams.get('reset'));
if (inviteToken) {
  document.querySelector('.login-card > h2').textContent = isPasswordReset ? 'Reset your company-portal password' : 'Create your company-portal password';
  document.querySelector('.login-card > .muted').hidden = true;
  loginForm.hidden = true;
  showResetButton.hidden = true;
  resetForm.hidden = true;
  inviteForm.hidden = false;
}

inviteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(inviteError);
  const password = document.querySelector('#invite-password').value;
  const confirmation = document.querySelector('#invite-password-confirm').value;
  if (password.length < 10) {
    setMessage(inviteError, 'Password must be at least 10 characters.');
    return;
  }
  if (password !== confirmation) {
    setMessage(inviteError, 'Passwords do not match.');
    return;
  }
  inviteButton.disabled = true;
  try {
    await request('/auth/manager/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: inviteToken, password })
    });
    window.history.replaceState({}, '', '/portal');
    inviteForm.hidden = true;
    loginForm.hidden = false;
    showResetButton.hidden = false;
    document.querySelector('.login-card > h2').textContent = 'Your password is ready';
    document.querySelector('.login-card > .muted').textContent = 'Sign in with your company-contact email and the password you just created.';
    document.querySelector('.login-card > .muted').hidden = false;
    loginForm.email.focus();
  } catch (error) {
    setMessage(inviteError, error.message);
  } finally {
    inviteButton.disabled = false;
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  setMessage(loginError);
  try {
    const payload = await request('/auth/manager/login', {
      method: 'POST',
      body: JSON.stringify({
        email: loginForm.email.value.trim(),
        password: loginForm.password.value
      })
    });
    if (!payload.token) throw new Error('Sign-in did not return an active session.');
    localStorage.setItem(TOKEN_KEY, payload.token);
    loginForm.password.value = '';
    await openPortal();
  } catch (error) {
    setMessage(loginError, error.message === 'Invalid credentials' ? 'Incorrect email or password.' : error.message);
  } finally {
    loginButton.disabled = false;
  }
});

showResetButton.addEventListener('click', () => {
  resetForm.hidden = !resetForm.hidden;
  resetForm['reset-email'].value = loginForm.email.value;
});

resetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#reset-button');
  button.disabled = true;
  setMessage(resetMessage);
  try {
    await request('/auth/manager/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: resetForm['reset-email'].value.trim() })
    });
    setMessage(resetMessage, 'If that email has company access, a reset link has been sent.');
  } catch (error) {
    setMessage(resetMessage, error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#logout-button').addEventListener('click', clearSession);
document.querySelector('#open-driver-form').addEventListener('click', () => {
  addDriverCard.hidden = false;
  document.querySelector('#driver-name').focus();
});
document.querySelector('#close-driver-form').addEventListener('click', () => {
  addDriverCard.hidden = true;
  driverForm.reset();
  setMessage(document.querySelector('#driver-form-error'));
});

driverForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#add-driver-button');
  const errorElement = document.querySelector('#driver-form-error');
  button.disabled = true;
  setMessage(driversMessage);
  setMessage(errorElement);
  try {
    const payload = await request('/manager/drivers', {
      method: 'POST',
      body: JSON.stringify({
        name: driverForm['driver-name'].value.trim(),
        email: driverForm['driver-email'].value.trim(),
        send_invite: true
      })
    });
    driverForm.reset();
    addDriverCard.hidden = true;
    await loadDrivers();
    if (payload.invitation?.email_delivery === 'sent') {
      setMessage(driversMessage, 'Driver added. One setup email was sent with the app and password instructions.');
    } else {
      setMessage(driversError, 'Driver added, but the setup email could not be delivered. Select Resend invite beside the driver to try again.');
    }
  } catch (error) {
    setMessage(errorElement, error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => showPortalView(button.dataset.view));
});

document.querySelector('#open-manager-form').addEventListener('click', () => {
  addManagerCard.hidden = false;
  document.querySelector('#manager-name').focus();
});
document.querySelector('#close-manager-form').addEventListener('click', () => {
  addManagerCard.hidden = true;
  managerForm.reset();
  setMessage(document.querySelector('#manager-form-error'));
});

managerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#add-manager-button');
  const errorElement = document.querySelector('#manager-form-error');
  button.disabled = true;
  setMessage(errorElement);
  try {
    const payload = await request('/manager/manager-users/invite', {
      method: 'POST',
      body: JSON.stringify({
        full_name: document.querySelector('#manager-name').value.trim(),
        email: document.querySelector('#manager-email').value.trim()
      })
    });
    managerForm.reset();
    addManagerCard.hidden = true;
    await loadManagers();
    setMessage(managersMessage, payload.message || 'Manager invitation sent.');
  } catch (error) {
    setMessage(errorElement, error.message);
  } finally {
    button.disabled = false;
  }
});

manageBillingButton.addEventListener('click', async () => {
  manageBillingButton.disabled = true;
  setMessage(billingError);
  try {
    const payload = await request('/billing/portal', { method: 'POST' });
    if (!payload.url) throw new Error('Stripe did not return a billing-management link.');
    window.location.assign(payload.url);
  } catch (error) {
    setMessage(billingError, error.message);
    manageBillingButton.disabled = false;
  }
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#change-password-button');
  const messageElement = document.querySelector('#password-message');
  const currentPassword = document.querySelector('#current-password').value;
  const newPassword = document.querySelector('#new-password').value;
  const confirmation = document.querySelector('#confirm-new-password').value;
  setMessage(messageElement);
  messageElement.classList.remove('error');
  if (newPassword.length < 10) {
    messageElement.classList.add('error');
    setMessage(messageElement, 'Password must be at least 10 characters.');
    return;
  }
  if (newPassword !== confirmation) {
    messageElement.classList.add('error');
    setMessage(messageElement, 'Passwords do not match.');
    return;
  }
  button.disabled = true;
  try {
    await request('/auth/manager/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
    passwordForm.reset();
    clearSession();
    setMessage(loginError, 'Password updated. Sign in with your new password.');
  } catch (error) {
    messageElement.classList.add('error');
    setMessage(messageElement, error.message);
  } finally {
    button.disabled = false;
  }
});

saveAiAuthorizationButton.addEventListener('click', async () => {
  saveAiAuthorizationButton.disabled = true;
  setMessage(aiAuthorizationMessage);
  aiAuthorizationMessage.classList.remove('error');
  try {
    await request('/manager/account/ai-authorization', {
      method: 'PUT',
      body: JSON.stringify({
        authorized: aiAuthorizationCheckbox.checked,
        policy_version: AI_AUTHORIZATION_POLICY_VERSION
      })
    });
    await loadAiAuthorization();
    setMessage(aiAuthorizationMessage, aiAuthorizationCheckbox.checked
      ? 'Company authorization saved. Authorized drivers may now use AI language interpretation.'
      : 'AI language interpretation is now off for this company. Approved non-AI answers remain available.');
  } catch (error) {
    aiAuthorizationMessage.classList.add('error');
    setMessage(aiAuthorizationMessage, error.message);
  } finally {
    saveAiAuthorizationButton.disabled = false;
  }
});

localContactsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveLocalContactsButton.disabled = true;
  setMessage(localContactsMessage);
  localContactsMessage.classList.remove('error');
  try {
    await request('/manager/account/local-contacts', {
      method: 'PUT',
      body: JSON.stringify({
        cxpc_phone_number: document.querySelector('#cxpc-phone-number').value.trim(),
        csa_phone_number: document.querySelector('#csa-phone-number').value.trim(),
        manager_name: document.querySelector('#primary-manager-name').value.trim(),
        manager_phone_number: document.querySelector('#primary-manager-phone-number').value.trim()
      })
    });
    setMessage(localContactsMessage, 'Local driver contact numbers saved.');
  } catch (error) {
    localContactsMessage.classList.add('error');
    setMessage(localContactsMessage, error.message);
  } finally {
    saveLocalContactsButton.disabled = false;
  }
});

if (getToken()) openPortal();
