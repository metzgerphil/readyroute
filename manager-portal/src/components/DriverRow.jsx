function getStatusTone(routeRow) {
  if (!routeRow.name || !routeRow.is_online) {
    return { label: 'offline', className: 'status-badge offline' };
  }

  if (routeRow.route_status === 'in_progress') {
    return { label: 'on_route', className: 'status-badge on-route' };
  }

  return { label: 'idle', className: 'status-badge idle' };
}

function getStopsPerHourClass(value) {
  if (value === null || value === undefined) {
    return 'sph-value';
  }

  if (value > 20) {
    return 'sph-value high';
  }

  if (value < 15) {
    return 'sph-value low';
  }

  return 'sph-value';
}

function formatLastPing(timestamp) {
  if (!timestamp) {
    return '--';
  }

  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) {
    return 'Just now';
  }

  if (diffMinutes === 1) {
    return '1 min ago';
  }

  return `${diffMinutes} min ago`;
}

export default function DriverRow({ driver, onAssign, onAssignVehicle, onClick, showVehiclePicker, vehicles = [] }) {
  const statusTone = getStatusTone(driver);
  const remainingStops = Math.max(0, Number(driver.total_stops || 0) - Number(driver.completed_stops || 0));

  function handleKeyDown(event) {
    if (!driver.name || !onClick) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className={`driver-table-row${driver.name ? ' clickable' : ' unassigned-row'}`}
      onClick={driver.name ? onClick : undefined}
      onKeyDown={handleKeyDown}
      role={driver.name ? 'button' : undefined}
      tabIndex={driver.name ? 0 : undefined}
    >
      <span className="driver-cell route-cell">
        <span className="route-chip">{driver.work_area_name || '--'}</span>
      </span>
      <span className="driver-cell">
        {driver.vehicle_name ? (
          <span className="vehicle-cell">
            <span className="vehicle-name">{driver.vehicle_name}</span>
            <span className="vehicle-plate-subtle">{driver.vehicle_plate || '--'}</span>
          </span>
        ) : showVehiclePicker ? (
          <span className="vehicle-picker-wrap">
            <select
              className="text-field compact vehicle-select"
              defaultValue=""
              onChange={(event) => {
                const selectedVehicleId = event.target.value;
                if (selectedVehicleId) {
                  onAssignVehicle?.(selectedVehicleId);
                }
              }}
            >
              <option value="">Select vehicle...</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name}{vehicle.plate ? ` — ${vehicle.plate}` : ''}
                </option>
              ))}
            </select>
          </span>
        ) : (
          <button
            className="vehicle-link-button"
            onClick={(event) => {
              event.stopPropagation();
              onAssignVehicle?.(null, true);
            }}
            type="button"
          >
            No vehicle
          </button>
        )}
      </span>
      <span className="driver-cell driver-cell-name">
        {driver.name ? (
          <span className="driver-name">{driver.name}</span>
        ) : (
          <span className="unassigned-wrap">
            <span className="unassigned-label">Unassigned</span>
            <button
              className="assign-button"
              onClick={(event) => {
                event.stopPropagation();
                onAssign?.();
              }}
              type="button"
            >
              Assign
            </button>
          </span>
        )}
      </span>
      <span className="driver-cell">
        <span className={statusTone.className}>{statusTone.label}</span>
      </span>
      <span className="driver-cell">{driver.completed_stops ?? 0}</span>
      <span className="driver-cell">{remainingStops}</span>
      <span className="driver-cell">
        <span className={getStopsPerHourClass(driver.stops_per_hour)}>
          {driver.stops_per_hour ?? '--'}
        </span>
      </span>
      <span className="driver-cell">{formatLastPing(driver.last_position?.timestamp)}</span>
      <span className="driver-cell">
        <span className={driver.is_online ? 'online-pill online' : 'online-pill offline'}>
          {driver.is_online ? 'Online' : 'Offline'}
        </span>
      </span>
    </div>
  );
}
