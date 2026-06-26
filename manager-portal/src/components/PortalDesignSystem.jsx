import { Link } from 'react-router-dom';

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function AppShell({ children, collapsed = false }) {
  return (
    <div className={cx('portal-shell rr-app-shell', collapsed && 'sidebar-hidden')}>
      {children}
    </div>
  );
}

export function Sidebar({ children, collapsed = false }) {
  return (
    <aside className={cx('sidebar rr-sidebar', collapsed && 'hidden')}>
      {children}
    </aside>
  );
}

export function PageHeader({ title, eyebrow, description, actions, children }) {
  return (
    <header className="page-header rr-page-header">
      <div className="rr-page-header-copy">
        {eyebrow ? <div className="rr-eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="page-header-actions rr-page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function StatCard({ label, value, detail, tone = 'default', className = '' }) {
  return (
    <article className={cx('stat-card rr-stat-card', tone !== 'default' && `tone-${tone}`, className)}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail ? <div className="rr-stat-detail">{detail}</div> : null}
    </article>
  );
}

export function StatusBadge({ children, tone = 'neutral', className = '' }) {
  return (
    <span className={cx('rr-status-badge', `tone-${tone}`, className)}>
      {children}
    </span>
  );
}

export function ActionBanner({
  title,
  description,
  action,
  tone = 'info',
  compact = false,
  children,
  className = ''
}) {
  return (
    <section className={cx('rr-action-banner', `tone-${tone}`, compact && 'compact', className)}>
      <div>
        {title ? <h2>{title}</h2> : null}
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {action ? <div className="rr-action-banner-action">{action}</div> : null}
    </section>
  );
}

export function EmptyState({ title, description, actions, children, className = '', variant = 'card' }) {
  return (
    <section className={cx(variant === 'card' && 'card', 'rr-empty-state', variant === 'inline' && 'rr-empty-state-inline', className)}>
      <div>
        <div className="card-title">{title}</div>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
      {actions ? <div className="rr-empty-state-actions">{actions}</div> : null}
    </section>
  );
}

export function LoadingState({
  title = 'Loading...',
  description,
  className = '',
  skeletonRows = 3,
  variant = 'inline',
  children
}) {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className={cx(variant === 'card' && 'card', 'rr-loading-state', `variant-${variant}`, className)}
      role="status"
    >
      <div className="rr-loading-state-status">
        <span aria-hidden="true" className="rr-loading-spinner" />
        <div>
          <div className="rr-loading-state-title">{title}</div>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children || skeletonRows > 0 ? (
        <div className="rr-loading-state-skeleton" aria-hidden="true">
          {children || Array.from({ length: skeletonRows }, (_, index) => (
            <span className="skeleton-line" key={index} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ErrorState({
  title = 'Unable to load this section',
  description = 'Try again, or refresh the page if the problem continues.',
  actionLabel = 'Retry',
  className = '',
  onRetry
}) {
  return (
    <section className={cx('error-banner rr-error-state', className)} role="alert">
      <div>
        <div className="rr-error-state-title">{title}</div>
        {description ? <p>{description}</p> : null}
      </div>
      {onRetry ? (
        <button className="secondary-inline-button" onClick={onRetry} type="button">
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

export function DataTable({ columns = [], children, className = '' }) {
  return (
    <div className={cx('rr-data-table', className)}>
      {columns.length > 0 ? (
        <div className="rr-data-table-header" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
      ) : null}
      <div className="rr-data-table-body">{children}</div>
    </div>
  );
}

export function TableToolbar({ title, meta, actions, children }) {
  return (
    <div className="rr-table-toolbar">
      <div>
        {title ? <div className="card-title">{title}</div> : null}
        {meta ? <div className="driver-meta">{meta}</div> : null}
      </div>
      <div className="rr-table-toolbar-actions">
        {children}
        {actions}
      </div>
    </div>
  );
}

export function CardGrid({ children, min = '280px', className = '' }) {
  return (
    <div className={cx('rr-card-grid', className)} style={{ '--rr-card-grid-min': min }}>
      {children}
    </div>
  );
}

export function IntegrationCard({ title, eyebrow, description, action, status, children, className = '' }) {
  return (
    <article className={cx('card rr-integration-card', className)}>
      <div>
        {eyebrow ? <div className="rr-eyebrow tone-purple">{eyebrow}</div> : null}
        <div className="rr-integration-card-title-row">
          <h2>{title}</h2>
          {status}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
      {action ? <div className="rr-integration-card-action">{action}</div> : null}
    </article>
  );
}

export function RouteCard({ children, tone = 'default', className = '' }) {
  return (
    <article className={cx('card rr-route-card', tone !== 'default' && `tone-${tone}`, className)}>
      {children}
    </article>
  );
}

export function ReadinessCard({ label, value, tone = 'default' }) {
  return (
    <div className={cx('rr-readiness-card', tone !== 'default' && `tone-${tone}`)}>
      <div className="dispatch-health-value">{value}</div>
      <div className="dispatch-health-label">{label}</div>
    </div>
  );
}

export function ConnectionStatusCard({ title, description, status, actionTo, actionLabel, tone = 'neutral' }) {
  const action = actionTo && actionLabel ? (
    <Link className="secondary-button" to={actionTo}>
      {actionLabel}
    </Link>
  ) : null;

  return (
    <article className={cx('card rr-connection-status-card', `tone-${tone}`)}>
      <div>
        <div className="rr-connection-status-topline">
          <h3>{title}</h3>
          <StatusBadge tone={tone}>{status}</StatusBadge>
        </div>
        <p>{description}</p>
      </div>
      {action}
    </article>
  );
}
