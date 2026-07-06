import { NavLink, useNavigate } from 'react-router-dom';

import { clearReadyRouteStaffToken, getReadyRouteStaffTokenPayload } from '../services/auth';

const staffNavLinks = [
  { to: '/readyroute/support', label: 'Support Desk' },
  { to: '/readyroute/companies', label: 'Companies' },
  { to: '/readyroute/staff', label: 'Staff Users' },
  { to: '/readyroute/settings', label: 'Settings' }
];

export default function StaffLayout({ children }) {
  const navigate = useNavigate();
  const staffPayload = getReadyRouteStaffTokenPayload() || {};

  function handleLogout() {
    clearReadyRouteStaffToken();
    navigate('/readyroute/login', { replace: true });
  }

  return (
    <div className="staff-shell">
      <aside className="staff-sidebar">
        <div className="staff-sidebar-top">
          <a className="brand staff-brand-link" href="https://readyroute.org">
            <span className="brand-ready">ready</span>
            <span className="brand-route">Route</span>
          </a>
          <div className="staff-sidebar-title">Internal Console</div>
          <div className="staff-sidebar-user">
            <strong>{staffPayload.staff_name || 'ReadyRoute Staff'}</strong>
            <span>{staffPayload.staff_email || ''}</span>
            <span>{staffPayload.staff_role || 'staff'}</span>
          </div>
        </div>

        <nav className="staff-nav" aria-label="ReadyRoute internal navigation">
          {staffNavLinks.map((link) => (
            <NavLink
              className={({ isActive }) => `staff-nav-link${isActive ? ' active' : ''}`}
              key={link.to}
              to={link.to}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <button className="staff-logout-button" onClick={handleLogout} type="button">
          Logout
        </button>
      </aside>

      <main className="staff-main">
        {children}
      </main>
    </div>
  );
}
