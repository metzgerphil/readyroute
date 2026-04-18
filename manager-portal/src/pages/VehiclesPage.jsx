import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import api from '../services/api';

const emptyVehicleForm = {
  name: '',
  make: '',
  model: '',
  year: '',
  plate: '',
  current_mileage: '0'
};

function getTodayString() {
  return format(new Date(), 'yyyy-MM-dd');
}

function formatDate(value) {
  if (!value) {
    return 'Not recorded';
  }

  return format(new Date(`${value}T12:00:00`), 'MMM d, yyyy');
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(value));
}

function formatMileage(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function getStatusMeta(vehicle) {
  if (vehicle.service_due) {
    return { label: 'Service Due', className: 'vehicle-status-badge service-due' };
  }

  if (vehicle.today_assignment?.route_status === 'in_progress') {
    return { label: 'On Road', className: 'vehicle-status-badge on-road' };
  }

  if (vehicle.today_assignment) {
    return { label: 'Assigned', className: 'vehicle-status-badge assigned' };
  }

  return { label: 'Available', className: 'vehicle-status-badge available' };
}

function getServiceProgress(vehicle) {
  const current = Number(vehicle.current_mileage || 0);
  const next = Number(vehicle.next_service_mileage || 0);

  if (!Number.isFinite(next) || next <= 0) {
    return null;
  }

  const fill = Math.max(0, Math.min(100, (current / next) * 100));
  const milesRemaining = next - current;

  return {
    fill,
    milesRemaining
  };
}

function VehicleModal({ form, errorMessage, isSubmitting, onChange, onClose, onSubmit }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="card-title">Add Vehicle</div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <input className="text-field" onChange={(event) => onChange('name', event.target.value)} placeholder="Vehicle Name" value={form.name} />
          <input className="text-field" onChange={(event) => onChange('make', event.target.value)} placeholder="Make" value={form.make} />
          <input className="text-field" onChange={(event) => onChange('model', event.target.value)} placeholder="Model" value={form.model} />
          <input className="text-field" min="1900" onChange={(event) => onChange('year', event.target.value)} placeholder="Year" type="number" value={form.year} />
          <input
            className="text-field"
            onChange={(event) => onChange('plate', event.target.value.toUpperCase())}
            placeholder="License Plate"
            value={form.plate}
          />
          <input
            className="text-field"
            min="0"
            onChange={(event) => onChange('current_mileage', event.target.value)}
            placeholder="Current Mileage"
            type="number"
            value={form.current_mileage}
          />

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : 'Create Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MaintenanceModal({ vehicle, form, errorMessage, isSubmitting, onChange, onClose, onSubmit }) {
  if (!vehicle) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="card-title">Add Service Record</div>
            <div className="driver-meta">{vehicle.name}</div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <input className="text-field" onChange={(event) => onChange('service_date', event.target.value)} type="date" value={form.service_date} />
          <input className="text-field" onChange={(event) => onChange('description', event.target.value)} placeholder="Description" value={form.description} />
          <label className="money-field">
            <span>$</span>
            <input
              className="text-field money-input"
              min="0"
              onChange={(event) => onChange('cost', event.target.value)}
              placeholder="Cost"
              step="0.01"
              type="number"
              value={form.cost}
            />
          </label>
          <input
            className="text-field"
            min="0"
            onChange={(event) => onChange('mileage_at_service', event.target.value)}
            placeholder="Mileage at Service"
            type="number"
            value={form.mileage_at_service}
          />
          <input
            className="text-field"
            min="0"
            onChange={(event) => onChange('next_service_mileage', event.target.value)}
            placeholder="Next Service at Mileage"
            type="number"
            value={form.next_service_mileage}
          />

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : 'Save Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MaintenanceHistoryModal({ vehicle, open, onClose }) {
  const historyQuery = useQuery({
    queryKey: ['vehicle-maintenance-history', vehicle?.id],
    queryFn: async () => {
      const response = await api.get(`/vehicles/${vehicle.id}/maintenance`);
      return response.data?.maintenance || [];
    },
    enabled: open && Boolean(vehicle?.id)
  });

  if (!open || !vehicle) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card history-modal-card">
        <div className="modal-header">
          <div>
            <div className="card-title">{vehicle.name} — Service History</div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        {historyQuery.isLoading ? (
          <div className="driver-meta">Loading service history...</div>
        ) : historyQuery.data?.length ? (
          <div className="history-table">
            <div className="history-table-header">
              <span>Date</span>
              <span>Description</span>
              <span>Mileage</span>
              <span>Cost</span>
              <span>Next Service At</span>
            </div>
            {historyQuery.data.map((row) => (
              <div className="history-table-row" key={row.id}>
                <span>{formatDate(row.service_date)}</span>
                <span>{row.description}</span>
                <span>{row.mileage_at_service ? formatMileage(row.mileage_at_service) : '—'}</span>
                <span>{formatCurrency(row.cost)}</span>
                <span>{row.next_service_mileage ? formatMileage(row.next_service_mileage) : '—'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="driver-meta">No service records yet</div>
        )}

        <div className="modal-actions">
          <button className="secondary-inline-button" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}

export default function VehiclesPage() {
  const queryClient = useQueryClient();
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [vehicleError, setVehicleError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [maintenanceVehicle, setMaintenanceVehicle] = useState(null);
  const [historyVehicle, setHistoryVehicle] = useState(null);
  const [maintenanceForm, setMaintenanceForm] = useState({
    service_date: getTodayString(),
    description: '',
    cost: '',
    mileage_at_service: '',
    next_service_mileage: ''
  });
  const [maintenanceError, setMaintenanceError] = useState('');

  const vehiclesQuery = useQuery({
    queryKey: ['fleet-vehicles'],
    queryFn: async () => {
      const response = await api.get('/vehicles');
      return response.data?.vehicles || [];
    },
    refetchInterval: 60000
  });

  const createVehicleMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/vehicles', {
        ...vehicleForm,
        year: Number(vehicleForm.year),
        current_mileage: Number(vehicleForm.current_mileage || 0)
      });
      return response.data;
    },
    onSuccess: async () => {
      setIsVehicleModalOpen(false);
      setVehicleForm(emptyVehicleForm);
      setVehicleError('');
      setToastMessage('Vehicle added to fleet');
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles'] });
    },
    onError: (error) => {
      setVehicleError(error.response?.data?.error || 'Unable to create vehicle.');
    }
  });

  const createMaintenanceMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/vehicles/${maintenanceVehicle.id}/maintenance`, {
        service_date: maintenanceForm.service_date,
        description: maintenanceForm.description,
        cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : undefined,
        mileage_at_service: Number(maintenanceForm.mileage_at_service),
        next_service_mileage: maintenanceForm.next_service_mileage ? Number(maintenanceForm.next_service_mileage) : undefined
      });
      return response.data;
    },
    onSuccess: async () => {
      setMaintenanceVehicle(null);
      setMaintenanceForm({
        service_date: getTodayString(),
        description: '',
        cost: '',
        mileage_at_service: '',
        next_service_mileage: ''
      });
      setMaintenanceError('');
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles'] });
      if (historyVehicle) {
        await queryClient.invalidateQueries({ queryKey: ['vehicle-maintenance-history', historyVehicle.id] });
      }
    },
    onError: (error) => {
      setMaintenanceError(error.response?.data?.error || 'Unable to save service record.');
    }
  });

  const vehicles = useMemo(() => vehiclesQuery.data || [], [vehiclesQuery.data]);
  const dueSoonVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.service_due), [vehicles]);
  const onRoadCount = useMemo(
    () => vehicles.filter((vehicle) => vehicle.today_assignment?.route_status === 'in_progress').length,
    [vehicles]
  );

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToastMessage(''), 2500);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  function updateVehicleField(field, value) {
    setVehicleForm((current) => ({ ...current, [field]: value }));
  }

  function updateMaintenanceField(field, value) {
    setMaintenanceForm((current) => ({ ...current, [field]: value }));
  }

  function handleCreateVehicle(event) {
    event.preventDefault();
    setVehicleError('');

    if (!vehicleForm.name || !vehicleForm.make || !vehicleForm.model || !vehicleForm.year || !vehicleForm.plate) {
      setVehicleError('Vehicle name, make, model, year, and plate are required.');
      return;
    }

    createVehicleMutation.mutate();
  }

  function handleCreateMaintenance(event) {
    event.preventDefault();
    setMaintenanceError('');

    if (!maintenanceForm.service_date || !maintenanceForm.description || !maintenanceForm.mileage_at_service) {
      setMaintenanceError('Service date, description, and mileage at service are required.');
      return;
    }

    createMaintenanceMutation.mutate();
  }

  function scrollToDueVehicle() {
    if (!dueSoonVehicles.length) {
      return;
    }

    const element = document.getElementById(`vehicle-card-${dueSoonVehicles[0].id}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="page-section">
      <div className="page-header">
        <div>
          <h1>Fleet</h1>
          <p>{vehicles.length} vehicles — {onRoadCount} on road today</p>
        </div>
        <button className="primary-cta manifest-button" onClick={() => setIsVehicleModalOpen(true)} type="button">
          Add Vehicle
        </button>
      </div>

      {dueSoonVehicles.length ? (
        <div className="service-due-banner">
          <div>
            <strong>⚠ {dueSoonVehicles.length} vehicle(s) due for service soon</strong>
            <div>{dueSoonVehicles.map((vehicle) => vehicle.name).join(', ')}</div>
          </div>
          <button className="banner-link-button" onClick={scrollToDueVehicle} type="button">View</button>
        </div>
      ) : null}

      {toastMessage ? <div className="success-banner">{toastMessage}</div> : null}

      {vehiclesQuery.isLoading ? (
        <div className="vehicle-grid">
          {[0, 1].map((value) => (
            <div className="card skeleton-card vehicle-card" key={value}>
              <div className="skeleton-line skeleton-label" />
              <div className="skeleton-line skeleton-value" />
              <div className="skeleton-line skeleton-label" />
            </div>
          ))}
        </div>
      ) : (
        <div className="vehicle-grid">
          {vehicles.map((vehicle) => {
            const statusMeta = getStatusMeta(vehicle);
            const serviceProgress = getServiceProgress(vehicle);

            return (
              <div className="card vehicle-card" id={`vehicle-card-${vehicle.id}`} key={vehicle.id}>
                <div className="vehicle-card-header">
                  <div className="vehicle-card-title">{vehicle.name}</div>
                  <span className={statusMeta.className}>{statusMeta.label}</span>
                </div>

                {vehicle.today_assignment ? (
                  <div className="vehicle-assignment-row">
                    <span>👤 {vehicle.today_assignment.driver_name}</span>
                    <span>📍 Route {vehicle.today_assignment.work_area_name}</span>
                  </div>
                ) : null}

                <div className="vehicle-details-row">
                  <span>{vehicle.make} {vehicle.model} {vehicle.year}</span>
                  <span className="vehicle-plate">{vehicle.plate}</span>
                </div>

                <div className="vehicle-mileage-row">
                  <div className="vehicle-mileage-value">🛞 {formatMileage(vehicle.current_mileage)} miles</div>
                  {serviceProgress ? (
                    <div className="service-progress-wrap">
                      <div className="service-progress-bar">
                        <div className="service-progress-fill" style={{ width: `${serviceProgress.fill}%` }} />
                      </div>
                      {vehicle.service_due ? (
                        <div className="service-overdue">⚠ Service overdue</div>
                      ) : (
                        <div className="service-remaining">{formatMileage(serviceProgress.milesRemaining)} miles until next service</div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="vehicle-service-row">
                  <div>
                    <div className="vehicle-meta-label">Last Service</div>
                    <div className="vehicle-meta-value">{formatDate(vehicle.last_service_date)}</div>
                  </div>
                  <div className="vehicle-last-service-description">
                    {vehicle.latest_maintenance?.description || vehicle.notes || 'No service notes yet'}
                  </div>
                </div>

                <div className="vehicle-card-actions">
                  <button
                    className="secondary-inline-button"
                    onClick={() => {
                      setMaintenanceVehicle(vehicle);
                      setMaintenanceForm({
                        service_date: getTodayString(),
                        description: '',
                        cost: '',
                        mileage_at_service: String(vehicle.current_mileage || ''),
                        next_service_mileage: vehicle.next_service_mileage ? String(vehicle.next_service_mileage) : ''
                      });
                      setMaintenanceError('');
                    }}
                    type="button"
                  >
                    Add Service Record
                  </button>
                  <button
                    className="primary-inline-button"
                    onClick={() => setHistoryVehicle(vehicle)}
                    type="button"
                  >
                    View History
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isVehicleModalOpen ? (
        <VehicleModal
          errorMessage={vehicleError}
          form={vehicleForm}
          isSubmitting={createVehicleMutation.isPending}
          onChange={updateVehicleField}
          onClose={() => setIsVehicleModalOpen(false)}
          onSubmit={handleCreateVehicle}
        />
      ) : null}

      {maintenanceVehicle ? (
        <MaintenanceModal
          errorMessage={maintenanceError}
          form={maintenanceForm}
          isSubmitting={createMaintenanceMutation.isPending}
          onChange={updateMaintenanceField}
          onClose={() => setMaintenanceVehicle(null)}
          onSubmit={handleCreateMaintenance}
          vehicle={maintenanceVehicle}
        />
      ) : null}

      <MaintenanceHistoryModal
        onClose={() => setHistoryVehicle(null)}
        open={Boolean(historyVehicle)}
        vehicle={historyVehicle}
      />
    </section>
  );
}
