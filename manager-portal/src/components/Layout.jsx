import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { VEDR_CONNECTION_STATUSES } from '../config/constants';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import { clearManagerToken, getManagerTokenPayload } from '../services/auth';
import api from '../services/api';
import {
  buildOperationsDatePath,
  getResolvedOperationsDate,
  isOperationsDatePath,
} from '../utils/operationsDate';
import SupportRequestModal from './SupportRequestModal';

const navGroups = [
  {
    label: 'Today',
    links: [
      { to: '/', label: 'Dashboard', end: true, icon: 'dashboard' },
      { to: '/manifest', label: 'Morning Setup', icon: 'manifest' },
      { to: '/fleet-map', label: 'Fleet Map', icon: 'fleet' }
    ]
  },
  {
    label: 'Operations',
    links: [
      { to: '/routes', label: 'Routes', icon: 'routes', end: true },
      { to: '/time-commits', label: 'P&D Time Commits', icon: 'commits' },
      { to: '/drivers', label: 'Drivers', icon: 'drivers' },
      { to: '/knowledge-activity', label: 'Knowledge Activity', icon: 'knowledge' },
      { to: '/rra-test', label: 'RRA Test Console', icon: 'knowledge' },
      { to: '/vehicles', label: 'Vehicles', icon: 'vehicles' },
      { to: '/notifications', label: 'Notifications', icon: 'notifications' },
      { to: '/access-codes', label: 'Access Codes', icon: 'access' },
      { to: '/records', label: 'Records', icon: 'records' },
      { to: '/billing', label: 'Billing', icon: 'billing' }
    ]
  },
  {
    label: 'Integrations',
    links: [
      { to: '/csa', label: 'CSA Access', icon: 'csa', end: true },
      { to: '/vedr', label: 'VEDR Providers', icon: 'vedr', showsSetupBadge: true }
    ]
  },
  {
    label: 'Account',
    links: [
      { to: '/settings', label: 'Settings', icon: 'settings' }
    ]
  }
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
    case 'routes':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M5 17.5c2.5 0 2.5-11 5-11s2.5 11 5 11 2.5-11 4-11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="5" cy="17.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="10" cy="6.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="15" cy="17.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="19" cy="6.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case 'commits':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 7.5V12l3 2M4.5 4.5l2 2M19.5 4.5l-2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
    case 'knowledge':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H19v17H8.5A3.5 3.5 0 0 0 5 22zm0 0V22M9 7h6M9 11h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'billing':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M7 4h10a2 2 0 0 1 2 2v14l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L7 20V4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 8h4M10 12h5M10 16h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'vehicles':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M5 16l1.3-5.2A2 2 0 0 1 8.24 9h7.52a2 2 0 0 1 1.94 1.8L19 16M4 16h16v3H4zm3 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm10 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'notifications':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M18 9a6 6 0 1 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.8 21a2.4 2.4 0 0 0 4.4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'access':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 15v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
    case 'settings':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <circle cx="12" cy="12" fill="none" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.7-1.7l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.7-.7L10.5 2h-3l-.7 2.3a7 7 0 0 0-1.7.7l-1.9-.9-2.1 2.1L2 8.1a7 7 0 0 0-.7 1.7l-2 .7v3l2 .7a7 7 0 0 0 .7 1.7l-.9 1.9 2.1 2.1 1.9-.9a7 7 0 0 0 1.7.7l.7 2.3h3l.7-2.3a7 7 0 0 0 1.7-.7l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .7-1.7z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" transform="translate(1.5 0)" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const {
    csaQuery,
    isSwitchingCsa,
    linkedCsas,
    selectedCsaId,
    selectedCsaName,
    switchCsa,
    tokenCsaId
  } = useSelectedCsa();
  const vedrSettingsQuery = useQuery({
    queryKey: ['vedr-settings'],
    queryFn: async () => {
      const response = await api.get('/api/vedr/settings');
      return response.data || { provider: null, connection_status: VEDR_CONNECTION_STATUSES.NOT_STARTED, setup_completed_at: null };
    }
  });
  const notificationsQuery = useQuery({
    queryKey: ['manager-notifications'],
    enabled: Boolean(selectedCsaId || tokenCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/notifications');
      return response.data?.notifications || [];
    },
    refetchInterval: 60000
  });

  const showVedrSetupBadge = !vedrSettingsQuery.isLoading
    && !vedrSettingsQuery.isError
    && vedrSettingsQuery.data?.connection_status !== VEDR_CONNECTION_STATUSES.CONNECTED;
  const sidebarNotifications = Array.isArray(notificationsQuery.data) ? notificationsQuery.data : [];
  const hasNotificationAttention = sidebarNotifications.some((notification) => (
    notification.status !== 'read'
  ));
  const currentOperationsDate = getResolvedOperationsDate(location.search);
  const managerTokenPayload = getManagerTokenPayload() || {};
  const managerIdentity = {
    email: managerTokenPayload.manager_email || managerTokenPayload.email || '',
    name: managerTokenPayload.manager_name || managerTokenPayload.full_name || managerTokenPayload.name || '',
    role: managerTokenPayload.primary_role || managerTokenPayload.manager_role || 'manager'
  };

  async function handleCsaSwitch(event) {
    const nextAccountId = event.target.value;

    if (!nextAccountId || nextAccountId === selectedCsaId) {
      return;
    }

    try {
      await switchCsa(nextAccountId, {
        redirectTo: `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`
      });
    } catch {
      window.alert('CSA switch could not be completed right now.');
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
          <div className="sidebar-csa-card">
            <div className="sidebar-csa-name" aria-busy={csaQuery.isLoading && !selectedCsaName ? 'true' : undefined}>
              {selectedCsaName || (csaQuery.isLoading ? 'Loading workspace...' : 'No CSA selected')}
            </div>
            {linkedCsas.length > 1 ? (
              <select
                className="sidebar-csa-select"
                disabled={isSwitchingCsa || csaQuery.isLoading}
                onChange={handleCsaSwitch}
                value={selectedCsaId || tokenCsaId || ''}
              >
                {linkedCsas.map((csa) => (
                  <option key={csa.id} value={csa.id}>
                    {csa.company_name}
                  </option>
                ))}
              </select>
            ) : csaQuery.isLoading && selectedCsaName ? null : (
              <div className="sidebar-csa-hint">
                Link another CSA here, or open ReadyRoute to start a separate workspace.
              </div>
            )}
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Manager portal navigation">
          {navGroups.map((group) => (
            <div className="sidebar-nav-group" key={group.label}>
              <div className="sidebar-nav-group-label">{group.label}</div>
              <div className="sidebar-nav-group-links">
                {group.links.map((link) => {
                  const linkTo = isOperationsDatePath(link.to)
                    ? buildOperationsDatePath(link.to, currentOperationsDate)
                    : link.to;
                  const linkHasNotificationAttention = link.icon === 'notifications' && hasNotificationAttention;

                  return (
                    <NavLink
                      className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}${linkHasNotificationAttention ? ' notification-attention' : ''}`}
                      end={link.end}
                      key={link.to}
                      to={linkTo}
                    >
                      <span className="sidebar-link-content">
                        <span className="sidebar-link-icon" aria-hidden="true">
                          <SidebarIcon type={link.icon} />
                          {(link.showsSetupBadge && showVedrSetupBadge) || linkHasNotificationAttention ? <span className="sidebar-link-badge-dot" /> : null}
                        </span>
                        <span>{link.label}</span>
                      </span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
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

          <button className="sidebar-support-button" onClick={() => setIsSupportOpen(true)} type="button">
            Support
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

      <SupportRequestModal
        context={{
          companyName: selectedCsaName || managerTokenPayload.company_name || '',
          hash: location.hash,
          pathname: location.pathname,
          search: location.search,
          selectedCsaId,
          selectedCsaName,
          tokenCsaId
        }}
        isOpen={isSupportOpen}
        managerIdentity={managerIdentity}
        onClose={() => setIsSupportOpen(false)}
      />
    </div>
  );
}
