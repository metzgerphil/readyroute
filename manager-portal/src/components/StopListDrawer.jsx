import { useEffect, useMemo, useState } from 'react';

import './StopListDrawer.css';

function getStopType(stop) {
  if (stop.stop_type === 'combined' || (stop.has_pickup && stop.has_delivery)) {
    return 'combined';
  }
  if (stop.stop_type === 'pickup' || (stop.has_pickup && !stop.has_delivery) || stop.is_pickup) {
    return 'pickup';
  }
  return 'delivery';
}

function getStatusConfig(stop) {
  const type = getStopType(stop);

  if (type === 'pickup') {
    return { badgeFill: '#2980b9', statusFill: '#dbeafe', statusText: '#1e3a8a', label: 'Pickup' };
  }

  switch (stop.status) {
    case 'delivered':
      return { badgeFill: '#27ae60', statusFill: '#dcfce7', statusText: '#166534', label: 'Delivered' };
    case 'attempted':
      return { badgeFill: '#f39c12', statusFill: '#fef3c7', statusText: '#b45309', label: 'Attempted' };
    case 'incomplete':
      return { badgeFill: '#e74c3c', statusFill: '#fee2e2', statusText: '#b91c1c', label: 'Incomplete' };
    case 'pending':
    default:
      return { badgeFill: '#1a2332', statusFill: '#f3f4f6', statusText: '#4b5563', label: 'Pending' };
  }
}

function formatTimeCommit(stop) {
  if (!stop.has_time_commit || (!stop.ready_time && !stop.close_time)) {
    return null;
  }

  if (stop.ready_time && stop.close_time) {
    return `TC ${stop.ready_time}–${stop.close_time}`;
  }

  if (stop.ready_time) {
    return `Ready ${stop.ready_time}`;
  }

  return `Close ${stop.close_time}`;
}

function formatCompletionTime(stop) {
  const timestamp = stop?.completed_at || stop?.scanned_at;
  if (!timestamp || stop?.status === 'pending') {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function formatExceptionCode(code) {
  const value = String(code || '').trim();

  if (!value) {
    return null;
  }

  if (/^\d+$/.test(value)) {
    return `Code ${value.length > 2 && value.startsWith('0') ? value.slice(-2) : value.padStart(2, '0')}`;
  }

  return `Code ${value.toUpperCase()}`;
}

function getPackageCount(stop) {
  return Array.isArray(stop?.packages) ? stop.packages.length : 0;
}

function getStopStats(stops = []) {
  return stops.reduce(
    (stats, stop) => {
      const type = getStopType(stop);
      const packageCount = getPackageCount(stop);
      const isCompleted = stop.status === 'delivered' || stop.status === 'attempted' || Boolean(stop.completed_at);

      stats.totalStops += 1;
      stats.totalPackages += packageCount;

      if (isCompleted) {
        stats.completedStops += 1;
        stats.completedPackages += packageCount;
      }

      if (type === 'pickup' || type === 'combined') {
        stats.pickups += 1;
        if (isCompleted) {
          stats.completedPickups += 1;
        }
      }

      if (type === 'delivery' || type === 'combined') {
        stats.deliveries += 1;
        if (isCompleted) {
          stats.completedDeliveries += 1;
        }
      }

      return stats;
    },
    {
      totalStops: 0,
      completedStops: 0,
      totalPackages: 0,
      completedPackages: 0,
      deliveries: 0,
      completedDeliveries: 0,
      pickups: 0,
      completedPickups: 0
    }
  );
}

function formatWarningFlag(flag) {
  return String(flag || '')
    .replace(/_/g, ' ')
    .replace(/\b([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function getDisplayLocationType(stop) {
  const locationType = stop?.property_intel?.location_type || stop?.location_type || null;
  if (!locationType || locationType === 'house') {
    return null;
  }
  return String(locationType).toUpperCase();
}

function filterStops(stops, activeFilter, searchTerm) {
  const needle = String(searchTerm || '').trim().toLowerCase();

  return (stops || []).filter((stop) => {
    const type = getStopType(stop);
    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'deliveries' && (type === 'delivery' || type === 'combined')) ||
      (activeFilter === 'pickups' && (type === 'pickup' || type === 'combined')) ||
      (activeFilter === 'pending' && stop.status === 'pending') ||
      (activeFilter === 'completed' && (stop.status === 'delivered' || stop.status === 'attempted')) ||
      (activeFilter === 'time-commits' && stop.has_time_commit) ||
      (activeFilter === 'exceptions' && Boolean(stop.exception_code)) ||
      (activeFilter === 'incomplete' && stop.status === 'incomplete') ||
      (activeFilter === 'has-note' && stop.has_note);

    if (!matchesFilter) {
      return false;
    }

    if (!needle) {
      return true;
    }

    return (
      String(stop.sequence_order || '').includes(needle) ||
      String(stop.contact_name || '').toLowerCase().includes(needle) ||
      String(stop.address || '').toLowerCase().includes(needle) ||
      String(stop.address_line2 || '').toLowerCase().includes(needle)
    );
  });
}

export default function StopListDrawer({
  open,
  route,
  routeDriverName,
  stops,
  selectedStopId,
  onClose,
  onSelectStop,
  onFilterCountChange
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const visibleStops = useMemo(
    () => filterStops(stops, 'all', searchTerm),
    [stops, searchTerm]
  );

  const filteredStats = useMemo(() => {
    const delivered = visibleStops.filter((stop) => stop.status === 'delivered').length;
    const pending = visibleStops.filter((stop) => stop.status === 'pending').length;
    const exceptions = visibleStops.filter((stop) => stop.exception_code || stop.status === 'attempted').length;

    return { delivered, pending, exceptions };
  }, [visibleStops]);
  const routeStats = useMemo(() => getStopStats(stops), [stops]);

  useEffect(() => {
    onFilterCountChange?.(0);
  }, [onFilterCountChange]);

  function handleKeyDown(event) {
    if (!open || !visibleStops.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusedIndex((current) => Math.min((current < 0 ? -1 : current) + 1, visibleStops.length - 1));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedIndex((current) => Math.max((current < 0 ? 1 : current) - 1, 0));
    }

    if (event.key === 'Enter' && focusedIndex >= 0 && visibleStops[focusedIndex]) {
      event.preventDefault();
      onSelectStop(visibleStops[focusedIndex]);
    }
  }

  return (
    <aside
      className={`stop-list-drawer ${open ? 'open' : ''}`}
      aria-hidden={!open}
      onKeyDown={handleKeyDown}
    >
      <div className="stop-list-drawer-header">
        <div className="stop-list-drawer-title">
          <strong>{route?.work_area_name || 'Route'}</strong>
          <span>{routeDriverName || 'Unassigned'}</span>
          {route?.vehicle_number || route?.vehicle_name ? <span>{route.vehicle_number || route.vehicle_name}</span> : null}
        </div>
        <button type="button" className="stop-list-drawer-close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="stop-list-route-summary">
        <div className="stop-list-summary-card">
          <span className="stop-list-summary-icon">⌖</span>
          <strong>{`${routeStats.completedStops}/${routeStats.totalStops}`}</strong>
          <span>Total Stops</span>
        </div>
        <div className="stop-list-summary-card">
          <span className="stop-list-summary-icon">▱</span>
          <strong>{`${routeStats.completedPackages}/${routeStats.totalPackages}`}</strong>
          <span>Total Packages</span>
        </div>
        <div className="stop-list-summary-card">
          <span className="stop-list-summary-icon">↓</span>
          <strong>{`${routeStats.completedDeliveries}/${routeStats.deliveries}`}</strong>
          <span>Deliveries</span>
          <span
            className="stop-list-summary-bar"
            style={{
              '--progress': routeStats.deliveries
                ? `${Math.round((routeStats.completedDeliveries / routeStats.deliveries) * 100)}%`
                : '0%'
            }}
          />
        </div>
        <div className="stop-list-summary-card">
          <span className="stop-list-summary-icon">↑</span>
          <strong>{`${routeStats.completedPickups}/${routeStats.pickups}`}</strong>
          <span>Pickups</span>
          <span
            className="stop-list-summary-bar"
            style={{
              '--progress': routeStats.pickups
                ? `${Math.round((routeStats.completedPickups / routeStats.pickups) * 100)}%`
                : '0%'
            }}
          />
        </div>
      </div>

      <div className="stop-list-drawer-controls">
        <input
          className="stop-list-drawer-search"
          type="text"
          placeholder="Search by address or stop number..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      <div className="stop-list-drawer-body">
        {visibleStops.length ? (
          visibleStops.map((stop, index) => {
            const type = getStopType(stop);
            const status = getStatusConfig(stop);
            const timeCommit = formatTimeCommit(stop);
            const isHighlighted = selectedStopId === stop.id;
            const isFocused = focusedIndex === index;
            const propertyIntel = stop.property_intel;
            const completionTime = formatCompletionTime(stop);
            const packageCount = getPackageCount(stop);

            return (
              <button
                key={stop.id}
                type="button"
                className={`stop-list-row ${isHighlighted ? 'highlighted' : ''} ${isFocused ? 'focused' : ''}`}
                onClick={() => onSelectStop(stop)}
                onMouseEnter={() => setFocusedIndex(index)}
              >
                <div className="stop-list-row-sequence" style={{ backgroundColor: status.badgeFill }}>
                  {type === 'pickup' ? '+' : stop.sequence_order}
                </div>

                <div className="stop-list-row-content">
                  <div className="stop-list-row-main">
                    <div className="stop-list-row-address">{stop.address}</div>
                    {completionTime ? (
                      <span className={`stop-list-row-time ${stop.status === 'delivered' ? 'delivered' : 'exception'}`}>
                        <span>{stop.status === 'delivered' ? '✓' : '×'}</span>
                        {completionTime}
                      </span>
                    ) : null}
                  </div>
                  {stop.contact_name ? <div className="stop-list-row-contact">{stop.contact_name}</div> : null}
                  {stop.address_line2 ? <div className="stop-list-row-address-line2">{stop.address_line2}</div> : null}
                  {stop.secondary_address_type || stop.unit_label || stop.suite_label || stop.building_label ? (
                    <div className="stop-list-row-address-line2">
                      {[
                        stop.secondary_address_type ? `Type: ${String(stop.secondary_address_type).toUpperCase()}` : null,
                        stop.unit_label ? `Unit ${stop.unit_label}` : null,
                        stop.suite_label ? `Suite ${stop.suite_label}` : null,
                        stop.building_label || null,
                        stop.floor_label || null
                      ].filter(Boolean).join(' · ')}
                    </div>
                  ) : null}
                  {stop.apartment_intelligence?.unit_number ? (
                    <div className="stop-list-row-address-line2">
                      {`Floor ${
                        Number.isFinite(Number(stop.apartment_intelligence.floor))
                          ? stop.apartment_intelligence.floor
                          : 'unknown'
                      } · ${stop.apartment_intelligence.verified ? 'verified' : `${stop.apartment_intelligence.confidence} ${stop.apartment_intelligence.source}`}`}
                    </div>
                  ) : null}
                  {propertyIntel?.access_note ? <div className="stop-list-row-address-line2">{`Access: ${propertyIntel.access_note}`}</div> : null}
                  {propertyIntel?.parking_note ? <div className="stop-list-row-address-line2">{`Parking: ${propertyIntel.parking_note}`}</div> : null}
                  <div className="stop-list-row-package-meta">
                    <span className="stop-list-package-icon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24">
                        <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" fill="none" stroke="currentColor" strokeWidth="2" />
                        <path d="M4.5 8.7 12 13l7.5-4.3M12 13v6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>{`${packageCount} PKG${packageCount === 1 ? '' : 'S'}`}</span>
                    {stop.sid && stop.sid !== '0' ? <span className="stop-list-row-sid">{`SID: ${stop.sid}`}</span> : null}
                  </div>

                  <div className="stop-list-row-badges">
                    {stop.is_business ? <span className="stop-mini-badge business">BUSINESS</span> : null}
                    {stop.is_apartment_unit ? <span className="stop-mini-badge apartment">APARTMENT</span> : null}
                    {getDisplayLocationType(stop) ? <span className="stop-mini-badge combined">{getDisplayLocationType(stop)}</span> : null}
                    {stop.suite_label ? <span className="stop-mini-badge combined">{`SUITE ${stop.suite_label}`}</span> : null}
                    {stop.unit_label && !stop.apartment_intelligence?.unit_number ? <span className="stop-mini-badge apartment">{`UNIT ${stop.unit_label}`}</span> : null}
                    {stop.building_label ? <span className="stop-mini-badge combined">{stop.building_label.toUpperCase()}</span> : null}
                    {stop.floor_label ? <span className="stop-mini-badge combined">{stop.floor_label.toUpperCase()}</span> : null}
                    {type === 'pickup' ? <span className="stop-mini-badge pickup">PICKUP</span> : null}
                    {type === 'combined' ? <span className="stop-mini-badge combined">COMBINED</span> : null}
                    {propertyIntel?.grouped_stops?.length ? <span className="stop-mini-badge apartment">GROUPED</span> : null}
                    {timeCommit ? <span className="stop-mini-badge time-commit">{timeCommit}</span> : null}
                    {(propertyIntel?.warning_flags || []).slice(0, 2).map((flag) => (
                      <span key={flag} className="stop-mini-badge time-commit">{formatWarningFlag(flag)}</span>
                    ))}
                    {stop.has_note ? <span className="stop-note-dot" /> : null}
                  </div>
                  {stop.has_note && stop.notes ? (
                    <div className="stop-list-row-note-preview">
                      <span className="stop-list-row-note-label">
                        {stop.note_scope === 'unit' ? 'Unit note' : 'Address note'}
                      </span>
                      <span>{stop.notes}</span>
                    </div>
                  ) : null}
                </div>

                <div className="stop-list-row-status">
                  {stop.exception_code ? (
                    <span className="stop-list-row-exception">{formatExceptionCode(stop.exception_code)}</span>
                  ) : null}
                  {!completionTime ? (
                    <span className="stop-status-chip" style={{ backgroundColor: status.statusFill, color: status.statusText }}>
                      {status.label}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })
        ) : (
          <div className="stop-list-empty">
            <div>No stops match your search.</div>
            <button
              type="button"
              className="stop-list-clear"
              onClick={() => setSearchTerm('')}
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      <div className="stop-list-drawer-footer">
        {`${visibleStops.length} stops — ${filteredStats.delivered} delivered, ${filteredStats.pending} pending, ${filteredStats.exceptions} exceptions`}
      </div>
    </aside>
  );
}
