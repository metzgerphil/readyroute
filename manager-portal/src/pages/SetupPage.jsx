import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import api from '../services/api';

function SetupStep({ title, body, actionLabel, actionTo, status, detail }) {
  return (
    <article className={`setup-step-card ${status}`}>
      <div className="setup-step-head">
        <div>
          <div className="setup-step-title">{title}</div>
          <div className="setup-step-body">{body}</div>
        </div>
        <span className={`setup-step-pill ${status}`}>
          {status === 'done' ? 'Done' : status === 'ready' ? 'Ready now' : 'Needs setup'}
        </span>
      </div>
      {detail ? <div className="setup-step-detail">{detail}</div> : null}
      <Link className="secondary-button setup-step-action" to={actionTo}>
        {actionLabel}
      </Link>
    </article>
  );
}

export default function SetupPage() {
  useEffect(() => {
    document.title = 'Company Setup | ReadyRoute';
  }, []);

  const vedrQuery = useQuery({
    queryKey: ['vedr-settings'],
    queryFn: async () => {
      const response = await api.get('/api/vedr/settings');
      return response.data;
    }
  });

  const managerUsersQuery = useQuery({
    queryKey: ['manager-access'],
    queryFn: async () => {
      const response = await api.get('/manager/manager-users');
      return response.data?.manager_users || [];
    }
  });

  const driversQuery = useQuery({
    queryKey: ['setup-drivers'],
    queryFn: async () => {
      const response = await api.get('/manager/drivers');
      return response.data?.drivers || [];
    }
  });

  const vehiclesQuery = useQuery({
    queryKey: ['setup-vehicles'],
    queryFn: async () => {
      const response = await api.get('/vehicles');
      return response.data?.vehicles || [];
    }
  });

  const dashboardQuery = useQuery({
    queryKey: ['manager-dashboard'],
    queryFn: async () => {
      const response = await api.get('/manager/dashboard');
      return response.data?.dashboard || null;
    }
  });

  const isLoading = vedrQuery.isLoading || managerUsersQuery.isLoading || driversQuery.isLoading || vehiclesQuery.isLoading || dashboardQuery.isLoading;
  const hasError = vedrQuery.isError || managerUsersQuery.isError || driversQuery.isError || vehiclesQuery.isError || dashboardQuery.isError;

  const setupSummary = useMemo(() => {
    const managerUsers = managerUsersQuery.data || [];
    const activeManagers = managerUsers.filter((entry) => entry.status === 'active').length;
    const drivers = driversQuery.data || [];
    const vehicles = vehiclesQuery.data || [];
    const dashboard = dashboardQuery.data || null;
    const vedr = vedrQuery.data || null;

    const steps = [
      {
        key: 'managers',
        title: 'Manager access',
        body: 'Keep one lead manager in place and invite any supporting operations managers.',
        actionLabel: 'Open Drivers & Manager Access',
        actionTo: '/drivers',
        status: activeManagers > 0 ? 'done' : 'needs-attention',
        detail: activeManagers > 0 ? `${activeManagers} manager login${activeManagers === 1 ? '' : 's'} active` : 'No active manager logins found'
      },
      {
        key: 'vedr',
        title: 'VEDR connection',
        body: 'Choose GroundCloud or Velocitor and complete the camera-system connection.',
        actionLabel: 'Open VEDR setup',
        actionTo: '/vedr',
        status: vedr?.connection_status === 'connected' ? 'done' : 'needs-attention',
        detail: vedr?.provider
          ? `${String(vedr.provider).replace(/^./, (letter) => letter.toUpperCase())} selected, status: ${String(vedr.connection_status || 'not_started').replaceAll('_', ' ')}`
          : 'No VEDR provider selected yet'
      },
      {
        key: 'drivers',
        title: 'Drivers',
        body: 'Add active drivers before go-live so routes can be assigned cleanly.',
        actionLabel: 'Add or review drivers',
        actionTo: '/drivers',
        status: drivers.length > 0 ? 'done' : 'needs-attention',
        detail: drivers.length > 0 ? `${drivers.length} driver${drivers.length === 1 ? '' : 's'} loaded` : 'No drivers added yet'
      },
      {
        key: 'vehicles',
        title: 'Vehicles',
        body: 'Load vans and plates so dispatch and maintenance have a clean starting point.',
        actionLabel: 'Add or review vehicles',
        actionTo: '/vehicles',
        status: vehicles.length > 0 ? 'done' : 'needs-attention',
        detail: vehicles.length > 0 ? `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} loaded` : 'No vehicles added yet'
      },
      {
        key: 'routes',
        title: 'First route import',
        body: 'Bring in your first manifest or route source so the fleet map and dashboard have real work to show.',
        actionLabel: 'Go to Manifest',
        actionTo: '/manifest',
        status: Number(dashboard?.routes_today || 0) > 0 ? 'done' : 'ready',
        detail: Number(dashboard?.routes_today || 0) > 0 ? `${dashboard.routes_today} route${dashboard.routes_today === 1 ? '' : 's'} loaded today` : 'No routes loaded yet'
      }
    ];

    return {
      steps,
      completedCount: steps.filter((step) => step.status === 'done').length
    };
  }, [dashboardQuery.data, driversQuery.data, managerUsersQuery.data, vedrQuery.data, vehiclesQuery.data]);

  if (isLoading) {
    return <div className="card page-loading-card">Loading company setup...</div>;
  }

  if (hasError) {
    return <div className="card">Company setup could not load right now.</div>;
  }

  return (
    <div className="page">
      <div className="setup-shell">
        <div className="setup-header-card card">
          <div className="setup-eyebrow">New Company Setup</div>
          <h1>Bring your CSA into ReadyRoute</h1>
          <p>
            This is the shortest path from trial signup to a live operation: connect VEDR, load the team, add
            vehicles, and bring in the first routes.
          </p>

          <div className="setup-progress-bar" aria-hidden="true">
            <span style={{ width: `${(setupSummary.completedCount / setupSummary.steps.length) * 100}%` }} />
          </div>
          <div className="setup-progress-copy">
            {setupSummary.completedCount} of {setupSummary.steps.length} core setup steps completed
          </div>
        </div>

        <div className="setup-grid">
          {setupSummary.steps.map((step) => (
            <SetupStep key={step.key} {...step} />
          ))}
        </div>
      </div>
    </div>
  );
}
