const API_URL = 'https://api.readyroute.org';
const TOKEN_KEY = 'readyroute_rra_manager_token';

const loginView = document.querySelector('#login-view');
const portalView = document.querySelector('#portal-view');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('#login-button');
const loginError = document.querySelector('#login-error');
const resetForm = document.querySelector('#reset-form');
const resetMessage = document.querySelector('#reset-message');
const driverList = document.querySelector('#driver-list');
const driversError = document.querySelector('#drivers-error');
const driverForm = document.querySelector('#driver-form');
const addDriverCard = document.querySelector('#add-driver-card');

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

async function openPortal() {
  const payload = decodeToken(getToken());
  if (!payload || payload.role !== 'manager') {
    clearSession();
    return;
  }
  document.querySelector('#company-name').textContent = payload.company_name || 'Your company';
  loginView.hidden = true;
  portalView.hidden = false;
  await loadDrivers();
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

document.querySelector('#show-reset-button').addEventListener('click', () => {
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
  setMessage(errorElement);
  try {
    await request('/manager/drivers', {
      method: 'POST',
      body: JSON.stringify({
        name: driverForm['driver-name'].value.trim(),
        email: driverForm['driver-email'].value.trim(),
        username: driverForm['driver-username'].value.trim() || null,
        send_invite: true
      })
    });
    driverForm.reset();
    addDriverCard.hidden = true;
    await loadDrivers();
  } catch (error) {
    setMessage(errorElement, error.message);
  } finally {
    button.disabled = false;
  }
});

if (getToken()) openPortal();
