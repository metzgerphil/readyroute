import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { VEDR_CONNECTION_STATUSES } from '../config/constants';
import { clearManagerToken, saveManagerToken } from '../services/auth';
import api from '../services/api';

const links = [
  { to: '/', label: 'Dashboard', end: true, icon: 'dashboard' },
  { to: '/manifest', label: 'Manifest', icon: 'manifest' },
  { to: '/csa', label: 'CSA', icon: 'csa' },
  { to: '/records', label: 'Records', icon: 'records' },
  { to: '/drivers', label: 'Drivers', icon: 'drivers' },
  { to: '/vehicles', label: 'Vehicles', icon: 'vehicles' },
  { to: '/vedr', label: 'VEDR', icon: 'vedr', showsSetupBadge: true },
  { to: '/fleet-map', label: 'Fleet Map', icon: 'fleet' }
];

function SidebarIcon({ type }) {
  switch (type) {
    case 'dashboard':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" fill="currentColor" />
        </svg>
      );
    case 'manifest':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M7 3h8l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 1.5V9h4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 13h8M9 17h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'drivers':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M16 19a4 4 0 0 0-8 0M12 13a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7 6a3.5 3.5 0 0 0-3-3.46M17 6.5a3 3 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'csa':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M4 19V8.5L12 4l8 4.5V19M8 19v-4h8v4M9 10h.01M15 10h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'records':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M6 4h9l3 3v13H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm8 1.5V8h2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 11h8M8 15h8M8 19h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'vehicles':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M5 16l1.3-5.2A2 2 0 0 1 8.24 9h7.52a2 2 0 0 1 1.94 1.8L19 16M4 16h16v3H4zm3 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm10 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'vedr':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h7A2.5 2.5 0 0 1 16 8.5v7A2.5 2.5 0 0 1 13.5 18h-7A2.5 2.5 0 0 1 4 15.5zm12 2.2 4-2.2v7l-4-2.2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'fleet':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M12 21s6-5.33 6-11a6 6 0 1 0-12 0c0 5.67 6 11 6 11z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="2.4" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [isSwitchingCsa, setIsSwitchingCsa] = useState(false);
  const vedrSettingsQuery = useQuery({
    queryKey: ['vedr-settings'],
    queryFn: async () => {
      const response = await api.get('/api/vedr/settings');
      return response.data || { provider: null, connection_status: VEDR_CONNECTION_STATUSES.NOT_STARTED, setup_completed_at: null };
    }
  });
  const csaQuery = useQuery({
    queryKey: ['sidebar-csas'],
    queryFn: async () => {
      const response = await api.get('/manager/csas');
      return response.data || { current_csa: null, csas: [] };
    }
  });

  const showVedrSetupBadge = !vedrSettingsQuery.isLoading
    && !vedrSettingsQuery.isError
    && vedrSettingsQuery.data?.connection_status !== VEDR_CONNECTION_STATUSES.CONNECTED;

  async function handleCsaSwitch(event) {
    const nextAccountId = event.target.value;

    if (!nextAccountId || nextAccountId === csaQuery.data?.current_csa?.id) {
      return;
    }

    setIsSwitchingCsa(true);

    try {
      const response = await api.post('/manager/csas/switch', {
        account_id: nextAccountId
      });
      saveManagerToken(response.data?.token || '');
      window.location.assign('/setup');
    } catch (_error) {
      window.alert('CSA switch could not be completed right now.');
    } finally {
      setIsSwitchingCsa(false);
    }
  }

  function handleLogout() {
    clearManagerToken();
    navigate('/login', { replace: true });
  }

  return (
    <div className={`portal-shell ${isSidebarHidden ? 'sidebar-hidden' : ''}`}>
      <aside className={`sidebar ${isSidebarHidden ? 'hidden' : ''}`}>
        <div className="sidebar-top">
          <a className="brand sidebar-brand-link" href="https://readyroute.org">
            <span className="brand-ready">ready</span>
            <span className="brand-route">Route</span>
          </a>
          <div className="brand-subtitle">Last-mile routing</div>
          <div className="sidebar-csa-card">
            <div className="sidebar-csa-label">Current CSA</div>
            <div className="sidebar-csa-name">
              {csaQuery.isLoading
                ? 'Loading...'
                : csaQuery.data?.current_csa?.company_name || 'No CSA selected'}
            </div>
            {(csaQuery.data?.csas || []).length > 1 ? (
              <select
                className="sidebar-csa-select"
                disabled={isSwitchingCsa}
                onChange={handleCsaSwitch}
                value={csaQuery.data?.current_csa?.id || ''}
              >
                {(csaQuery.data?.csas || []).map((csa) => (
                  <option key={csa.id} value={csa.id}>
                    {csa.company_name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="sidebar-csa-hint">
                Link another CSA here, or open ReadyRoute to start a separate workspace.
              </div>
            )}
          </div>
        </div>

        <nav className="sidebar-nav">
          {links.map((link) => (
            <NavLink
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              end={link.end}
              key={link.to}
              to={link.to}
            >
              <span className="sidebar-link-content">
                <span className="sidebar-link-icon" aria-hidden="true">
                  <SidebarIcon type={link.icon} />
                  {link.showsSetupBadge && showVedrSetupBadge ? <span className="sidebar-link-badge-dot" /> : null}
                </span>
                <span>{link.label}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-collapse-button"
            onClick={() => setIsSidebarHidden(true)}
            type="button"
            title="Hide sidebar"
          >
            <span aria-hidden="true">◂</span>
          </button>

          <button className="logout-button" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>
      </aside>

      <main className={`main-content ${isSidebarHidden ? 'sidebar-hidden' : ''}`}>
        {isSidebarHidden ? (
          <button
            className="sidebar-reopen-button"
            onClick={() => setIsSidebarHidden(false)}
            title="Show sidebar"
            type="button"
          >
            <span aria-hidden="true">▸</span>
          </button>
        ) : null}
        {children}
      </main>
    </div>
  );
}
