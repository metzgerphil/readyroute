import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { clearReadyRouteStaffToken, getReadyRouteStaffTokenPayload } from '../services/auth';

const staffNavLinks = [
  { path: 'support', label: 'Support' },
  { path: 'companies', label: 'Companies' },
  { path: 'knowledge', label: 'Knowledge Activity' },
  { path: 'memory', label: 'Answer Memory' },
  { path: 'rra-test', label: 'RRA Test Console' },
  { path: 'costs', label: 'Costs' },
  { path: 'staff', label: 'Staff' },
  { path: 'settings', label: 'Settings' }
];

function formatStaffRole(role) {
  return String(role || 'staff')
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export default function StaffLayout({ children, basePath = '/staff' }) {
  const navigate = useNavigate();
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const staffPayload = getReadyRouteStaffTokenPayload() || {};
  const staffRoleLabel = formatStaffRole(staffPayload.staff_role);

  function handleLogout() {
    clearReadyRouteStaffToken();
    navigate(`${basePath}/login`, { replace: true });
  }

  return (
    <div className={`staff-shell${isSidebarHidden ? ' sidebar-hidden' : ''}`}>
      <aside className={`staff-sidebar${isSidebarHidden ? ' hidden' : ''}`}>
        <div className="staff-sidebar-primary">
          <div className="staff-sidebar-top">
            <a className="brand staff-brand-link" href="https://readyroute.org">
              <span className="brand-ready">ready</span>
              <span className="brand-route">Route</span>
            </a>
            <div className="staff-sidebar-title">Internal Console</div>
            <div className="staff-sidebar-user">
              <strong>{staffPayload.staff_name || 'ReadyRoute Staff'}</strong>
              <span>{staffPayload.staff_email || ''}</span>
              <span>{staffRoleLabel}</span>
            </div>
          </div>

          <nav className="staff-nav" aria-label="ReadyRoute internal navigation">
            {staffNavLinks.map((link) => (
              <NavLink
                className={({ isActive }) => `staff-nav-link${isActive ? ' active' : ''}`}
                key={link.path}
                to={`${basePath}/${link.path}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="staff-sidebar-footer">
          <button
            aria-label="Hide sidebar"
            className="staff-sidebar-collapse-button"
            onClick={() => setIsSidebarHidden(true)}
            title="Hide sidebar"
            type="button"
          >
            <span aria-hidden="true">◂</span>
          </button>

          <button className="staff-logout-button" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>
      </aside>

      <main className={`staff-main${isSidebarHidden ? ' sidebar-hidden' : ''}`}>
        {isSidebarHidden ? (
          <button
            aria-label="Show sidebar"
            className="staff-sidebar-reopen-button"
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
