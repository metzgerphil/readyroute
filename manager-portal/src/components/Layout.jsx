import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { AppShell, Sidebar } from './PortalDesignSystem';
import { VEDR_CONNECTION_STATUSES } from '../config/constants';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import { clearManagerToken } from '../services/auth';
import api from '../services/api';

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
      { to: '/time-commits', label: 'P&D Time Commit', icon: 'commits' },
      { to: '/drivers', label: 'Drivers', icon: 'drivers' },
      { to: '/vehicles', label: 'Vehicles', icon: 'vehicles' },
      { to: '/records', label: 'Records', icon: 'records' }
    ]
  },
  {
    label: 'Integrations',
    links: [
      { to: '/csa', label: 'CSA Access', icon: 'csa', end: true },
      { to: '/vedr', label: 'VEDR Providers', icon: 'vedr', showsSetupBadge: true }
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
    case 'drivers':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <path d="M16 19a4 4 0 0 0-8 0M12 13a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7 6a3.5 3.5 0 0 0-3-3.46M17 6.5a3 3 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'commits':
      return (
        <svg aria-hidden="true" className="sidebar-link-icon-svg" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 7.5V12l3 2M4.5 4.5l2 2M19.5 4.5l-2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
  const location = useLocation();
  const [isSidebarHidden, setIsSidebarHidden] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  ));
  const [isCsaMenuOpen, setIsCsaMenuOpen] = useState(false);
  const csaSwitcherRef = useRef(null);
  const {
    csaSelectionError,
    isCsaLoading,
    isSwitchingCsa,
    linkedCsas,
    selectedCsaId,
    selectedCsaName,
    switchCsa
  } = useSelectedCsa();
  const vedrSettingsQuery = useQuery({
    queryKey: ['vedr-settings', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/api/vedr/settings');
      return response.data || { provider: null, connection_status: VEDR_CONNECTION_STATUSES.NOT_STARTED, setup_completed_at: null };
    }
  });

  const showVedrSetupBadge = !vedrSettingsQuery.isLoading
    && !vedrSettingsQuery.isError
    && vedrSettingsQuery.data?.connection_status !== VEDR_CONNECTION_STATUSES.CONNECTED;
  const currentCsaName = isCsaLoading
    ? 'Loading...'
    : selectedCsaName || csaSelectionError || 'No CSA selected';
  const otherCsaOptions = linkedCsas.filter((csa) => csa.id && csa.id !== selectedCsaId);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');

    function syncSidebarForViewport(event) {
      setIsSidebarHidden(event.matches);
    }

    mediaQuery.addEventListener('change', syncSidebarForViewport);

    return () => mediaQuery.removeEventListener('change', syncSidebarForViewport);
  }, []);

  useEffect(() => {
    if (!isCsaMenuOpen) {
      return undefined;
    }

    function handleDocumentPointerDown(event) {
      if (csaSwitcherRef.current?.contains(event.target)) {
        return;
      }

      setIsCsaMenuOpen(false);
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsCsaMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isCsaMenuOpen]);

  function isSidebarLinkActive(link, isActive) {
    if (link.to === '/csa') {
      return location.pathname === '/csa';
    }

    if (link.to === '/routes') {
      return location.pathname === '/routes' || location.pathname.startsWith('/routes/');
    }

    return isActive;
  }

  async function handleCsaSwitch(nextAccountId) {
    setIsCsaMenuOpen(false);

    if (!nextAccountId || nextAccountId === selectedCsaId) {
      return;
    }

    try {
      await switchCsa(nextAccountId);
    } catch {
      window.alert('CSA switch could not be completed right now.');
    }
  }

  function handleLogout() {
    clearManagerToken();
    navigate('/login', { replace: true });
  }

  return (
    <AppShell collapsed={isSidebarHidden}>
      <Sidebar collapsed={isSidebarHidden}>
        <div className="sidebar-top">
          <a className="brand sidebar-brand-link" href="https://readyroute.org">
            <span className="brand-ready">ready</span>
            <span className="brand-route">Route</span>
          </a>
          <div className="brand-subtitle">Last-mile routing</div>
          <div className="sidebar-csa-switcher" ref={csaSwitcherRef}>
            <div className="sidebar-csa-label">Current CSA</div>
            <button
              aria-expanded={isCsaMenuOpen}
              aria-haspopup="listbox"
              className="sidebar-csa-trigger"
              onClick={() => setIsCsaMenuOpen((current) => !current)}
              type="button"
            >
              <span className="sidebar-csa-current-name">{currentCsaName}</span>
              <span className="sidebar-csa-chevron" aria-hidden="true">⌄</span>
            </button>

            {isCsaMenuOpen ? (
              <div className="sidebar-csa-menu" role="listbox">
                {otherCsaOptions.length ? (
                  otherCsaOptions.map((csa) => (
                    <button
                      className="sidebar-csa-menu-item"
                      disabled={isSwitchingCsa || !csa.id}
                      key={csa.id}
                      onClick={() => handleCsaSwitch(csa.id)}
                      role="option"
                      type="button"
                    >
                      <span>{csa.company_name}</span>
                      {isSwitchingCsa ? <span>Switching...</span> : null}
                    </button>
                  ))
                ) : (
                  <div className="sidebar-csa-empty">No other linked CSAs</div>
                )}
                <button
                  className="sidebar-csa-menu-item"
                  onClick={() => {
                    setIsCsaMenuOpen(false);
                    navigate('/csa');
                  }}
                  role="option"
                  type="button"
                >
                  <span>Link another CSA</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Manager portal navigation">
          {navGroups.map((group) => (
            <div className="sidebar-nav-group" key={group.label}>
              <div className="sidebar-nav-group-label">{group.label}</div>
              <div className="sidebar-nav-group-links">
                {group.links.map((link) => (
                  <NavLink
                    className={({ isActive }) => `sidebar-link${isSidebarLinkActive(link, isActive) ? ' active' : ''}`}
                    end={link.end}
                    key={link.to}
                    reloadDocument
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

          <button className="logout-button" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>
      </Sidebar>

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
    </AppShell>
  );
}
