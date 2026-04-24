import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import api from '../services/api';

function SetupStep({ order, title, body, actionLabel, actionTo, status, detail }) {
  const statusLabel = status === 'done'
    ? 'Done'
    : status === 'ready'
      ? 'Ready now'
      : status === 'blocked'
        ? 'Blocked'
        : 'Needs setup';

  return (
    <article className={`setup-step-card ${status}`}>
      <div className="setup-step-head">
        <div>
          <div className="setup-step-order">Step {order}</div>
          <div className="setup-step-title">{title}</div>
          <div className="setup-step-body">{body}</div>
        </div>
        <span className={`setup-step-pill ${status}`}>
          {statusLabel}
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
  const [searchParams] = useSearchParams();

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

  const driverAccessQuery = useQuery({
    queryKey: ['manager-driver-access'],
    queryFn: async () => {
      const response = await api.get('/manager/driver-access');
      return response.data || { starter_pin: null };
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

  const fedexAccountsQuery = useQuery({
    queryKey: ['manager-fedex-accounts'],
    queryFn: async () => {
      const response = await api.get('/manager/fedex-accounts');
      return response.data || { migration_required: false, accounts: [], default_account_id: null, connected_accounts_count: 0 };
    }
  });

  const dashboardQuery = useQuery({
    queryKey: ['manager-dashboard'],
    queryFn: async () => {
      const response = await api.get('/manager/dashboard');
      return response.data?.dashboard || null;
    }
  });

  const isLoading = vedrQuery.isLoading || managerUsersQuery.isLoading || driverAccessQuery.isLoading || driversQuery.isLoading || vehiclesQuery.isLoading || fedexAccountsQuery.isLoading || dashboardQuery.isLoading;
  const hasError = vedrQuery.isError || managerUsersQuery.isError || driverAccessQuery.isError || driversQuery.isError || vehiclesQuery.isError || fedexAccountsQuery.isError || dashboardQuery.isError;

  const setupSummary = useMemo(() => {
    const managerUsers = managerUsersQuery.data || [];
    const activeManagers = managerUsers.filter((entry) => entry.status === 'active').length;
    const starterPinSet = Boolean(driverAccessQuery.data?.starter_pin);
    const drivers = driversQuery.data || [];
    const vehicles = vehiclesQuery.data || [];
    const fedexAccounts = fedexAccountsQuery.data?.accounts || [];
    const fedexConnectedCount = fedexAccountsQuery.data?.connected_accounts_count || 0;
    const fedexDefaultLabel = fedexAccountsQuery.data?.default_account_label || null;
    const fedexMigrationRequired = fedexAccountsQuery.data?.migration_required === true;
    const dashboard = dashboardQuery.data || null;
    const vedr = vedrQuery.data || null;

    const steps = [
      {
        order: 1,
        key: 'managers',
        title: 'Manager access',
        body: 'Keep one lead manager in place and invite any supporting operations managers.',
        actionLabel: 'Open Drivers & Manager Access',
        actionTo: '/drivers?source=setup&focus=managers',
        status: activeManagers > 0 ? 'done' : 'needs-attention',
        detail: activeManagers > 0 ? `${activeManagers} manager login${activeManagers === 1 ? '' : 's'} active` : 'No active manager logins found'
      },
      {
        order: 2,
        key: 'starter-pin',
        title: 'Starter driver PIN',
        body: 'Set one shared 4-digit CSA PIN before you begin creating driver accounts.',
        actionLabel: 'Set starter PIN',
        actionTo: '/drivers?source=setup&focus=starter-pin',
        status: starterPinSet ? 'done' : 'needs-attention',
        detail: starterPinSet
          ? 'Starter PIN is in place. New driver accounts can be created without assigning a personal PIN first.'
          : 'This is required before your first batch of drivers can be added cleanly.'
      },
      {
        order: 3,
        key: 'vedr',
        title: 'VEDR connection',
        body: 'Choose GroundCloud or Velocitor and complete the camera-system connection.',
        actionLabel: 'Open VEDR setup',
        actionTo: '/vedr?source=setup&focus=vedr',
        status: vedr?.connection_status === 'connected' ? 'done' : 'needs-attention',
        detail: vedr?.provider
          ? `${String(vedr.provider).replace(/^./, (letter) => letter.toUpperCase())} selected, status: ${String(vedr.connection_status || 'not_started').replaceAll('_', ' ')}`
          : 'No VEDR provider selected yet'
      },
      {
        order: 4,
        key: 'fedex',
        title: 'FedEx accounts',
        body: 'Link one or more FedEx shipping accounts now so ReadyRoute is ready for future auto-sync and label operations.',
        actionLabel: 'Open CSA FedEx setup',
        actionTo: '/csa?source=setup&focus=fedex',
        status: fedexMigrationRequired
          ? 'needs-attention'
          : fedexConnectedCount > 0
            ? 'done'
            : fedexAccounts.length > 0
              ? 'ready'
              : 'needs-attention',
        detail: fedexMigrationRequired
          ? 'Run the latest FedEx accounts migration before CSA-level FedEx setup can be saved.'
          : fedexConnectedCount > 0
            ? `${fedexConnectedCount} connected account${fedexConnectedCount === 1 ? '' : 's'}${fedexDefaultLabel ? `. Default: ${fedexDefaultLabel}` : ''}`
            : fedexAccounts.length > 0
              ? `${fedexAccounts.length} account${fedexAccounts.length === 1 ? '' : 's'} saved. Mark one connected and set a default to finish this step.`
              : 'No CSA FedEx accounts saved yet'
      },
      {
        order: 5,
        key: 'drivers',
        title: 'Drivers',
        body: 'Add active drivers before go-live so routes can be assigned cleanly.',
        actionLabel: 'Add or review drivers',
        actionTo: '/drivers?source=setup&focus=drivers',
        status: drivers.length > 0 ? 'done' : starterPinSet ? 'ready' : 'blocked',
        detail: drivers.length > 0
          ? `${drivers.length} driver${drivers.length === 1 ? '' : 's'} loaded`
          : starterPinSet
            ? 'Starter PIN is set, so you can add your first drivers now.'
            : 'Set the starter PIN first so new drivers have a default login path.'
      },
      {
        order: 6,
        key: 'vehicles',
        title: 'Vehicles',
        body: 'Load vans and plates so dispatch and maintenance have a clean starting point.',
        actionLabel: 'Add or review vehicles',
        actionTo: '/vehicles?source=setup&focus=vehicles',
        status: vehicles.length > 0 ? 'done' : 'ready',
        detail: vehicles.length > 0 ? `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} loaded` : 'No vehicles added yet'
      },
      {
        order: 7,
        key: 'routes',
        title: 'First route import',
        body: 'Bring in your first manifest or route source so the fleet map and dashboard have real work to show.',
        actionLabel: 'Go to Manifest',
        actionTo: '/manifest?source=setup&focus=routes',
        status: Number(dashboard?.routes_today || 0) > 0 ? 'done' : (drivers.length > 0 && vehicles.length > 0) ? 'ready' : 'blocked',
        detail: Number(dashboard?.routes_today || 0) > 0
          ? `${dashboard.routes_today} route${dashboard.routes_today === 1 ? '' : 's'} loaded today`
          : (drivers.length > 0 && vehicles.length > 0)
            ? 'Drivers and vehicles are in place, so the first manifest import can happen now.'
            : 'Add at least one driver and one vehicle first so the first route can be assigned immediately.'
      }
    ];

    const nextStep = steps.find((step) => step.status !== 'done') || null;

    return {
      steps,
      completedCount: steps.filter((step) => step.status === 'done').length,
      nextStep
    };
  }, [dashboardQuery.data, driverAccessQuery.data?.starter_pin, driversQuery.data, fedexAccountsQuery.data, managerUsersQuery.data, vedrQuery.data, vehiclesQuery.data]);

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
            This is the shortest path from trial signup to a live operation: lock in driver access, connect VEDR,
            load the team, add vehicles, and bring in the first routes.
          </p>

          {searchParams.get('source') === 'trial' ? (
            <div className="info-banner">
              Your free trial is active. Work straight down this list and you’ll reach a fully running CSA much faster.
            </div>
          ) : null}

          <div className="setup-progress-bar" aria-hidden="true">
            <span style={{ width: `${(setupSummary.completedCount / setupSummary.steps.length) * 100}%` }} />
          </div>
          <div className="setup-progress-copy">
            {setupSummary.completedCount} of {setupSummary.steps.length} core setup steps completed
          </div>
        </div>

        {setupSummary.nextStep ? (
          <div className={`card setup-next-card ${setupSummary.nextStep.status}`}>
            <div>
              <div className="setup-next-eyebrow">Start Here</div>
              <h2>{setupSummary.nextStep.title}</h2>
              <p>{setupSummary.nextStep.detail || setupSummary.nextStep.body}</p>
            </div>
            <Link className="primary-cta setup-next-action" to={setupSummary.nextStep.actionTo}>
              {setupSummary.nextStep.actionLabel}
            </Link>
          </div>
        ) : null}

        <div className="setup-grid">
          {setupSummary.steps.map((step) => (
            <SetupStep key={step.key} {...step} />
          ))}
        </div>
      </div>
    </div>
  );
}
