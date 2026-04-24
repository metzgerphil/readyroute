import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import api from '../services/api';

const emptyVehicleForm = {
  name: '',
  truck_type: '',
  custom_truck_type: '',
  make: '',
  model: '',
  year: '',
  plate: '',
  registration_expiration: '',
  current_mileage: '0'
};

const TRUCK_TYPE_OPTIONS = [
  'P700',
  'P1000',
  'P1100',
  'P1200',
  'Box Truck',
  'Step Van',
  'Transit',
  'Cargo Van',
  'Cutaway',
  'Other'
];

const SERVICE_TYPE_OPTIONS = [
  'Inspection',
  'Oil Change',
  'Air Filter',
  'Brake Pads',
  'General Repair',
  'Other'
];

function findMaintenanceSetting(settings, serviceType) {
  return (settings || []).find((setting) => setting.service_type === serviceType) || null;
}

function getMaintenanceAutofill({ settings, serviceType, serviceDate, mileageAtService }) {
  const setting = findMaintenanceSetting(settings, serviceType);

  if (!setting?.is_enabled) {
    return {
      next_service_mileage: '',
      next_service_date: ''
    };
  }

  const intervalMiles = Number(setting.default_interval_miles);
  const intervalDays = Number(setting.default_interval_days);
  const parsedMileageAtService = Number(mileageAtService);
  let nextServiceMileage = '';
  let nextServiceDate = '';

  if (Number.isFinite(intervalMiles) && intervalMiles > 0 && Number.isFinite(parsedMileageAtService)) {
    nextServiceMileage = String(parsedMileageAtService + intervalMiles);
  }

  if (Number.isFinite(intervalDays) && intervalDays > 0 && serviceDate) {
    nextServiceDate = format(addDays(parseISO(serviceDate), intervalDays), 'yyyy-MM-dd');
  }

  return {
    next_service_mileage: nextServiceMileage,
    next_service_date: nextServiceDate
  };
}

function buildMaintenanceForm({ vehicle, settings, serviceType = 'Oil Change', serviceDate = getTodayString(), mileageAtService }) {
  const resolvedMileageAtService = mileageAtService ?? String(vehicle?.current_mileage || '');
  const autofill = getMaintenanceAutofill({
    settings,
    serviceType,
    serviceDate,
    mileageAtService: resolvedMileageAtService
  });

  return {
    service_date: serviceDate,
    service_type: serviceType,
    description: '',
    condition_notes: '',
    cost: '',
    mileage_at_service: resolvedMileageAtService,
    next_service_mileage: autofill.next_service_mileage,
    next_service_date: autofill.next_service_date
  };
}

function formatProgramSummary(setting) {
  const parts = [];

  if (setting.default_interval_miles) {
    parts.push(`${formatMileage(setting.default_interval_miles)} mi`);
  }

  if (setting.default_interval_days) {
    parts.push(`${setting.default_interval_days} days`);
  }

  return `${setting.service_type}${parts.length ? `: ${parts.join(' / ')}` : ''}`;
}

function MaintenanceSettingsCard({ draft, isExpanded, isLoading, isSaving, onChange, onCollapse, onExpand, onSave }) {
  const enabledSettings = useMemo(
    () => (draft || []).filter((setting) => setting.is_enabled),
    [draft]
  );
  const summaryText = enabledSettings.length
    ? enabledSettings.slice(0, 3).map(formatProgramSummary).join(' • ')
    : 'No maintenance categories enabled yet.';

  if (!isExpanded) {
    return (
      <div className="card maintenance-settings-card maintenance-settings-card-collapsed">
        <div className="section-title-row">
          <div>
            <div className="card-title">Maintenance Program</div>
            <div className="driver-meta">
              {enabledSettings.length} tracked categories
            </div>
          </div>
          <button className="secondary-inline-button" onClick={onExpand} type="button">
            Edit Program
          </button>
        </div>
        <div className="maintenance-settings-summary">{summaryText}</div>
      </div>
    );
  }

  return (
    <div className="card maintenance-settings-card">
      <div className="section-title-row">
        <div>
          <div className="card-title">Maintenance Program</div>
          <div className="driver-meta">Choose which service categories this CSA tracks and set default reminder rules.</div>
        </div>
        <div className="maintenance-settings-actions">
          <button className="secondary-inline-button" onClick={onCollapse} type="button">
            Collapse
          </button>
          <button className="primary-inline-button" disabled={isLoading || isSaving || !draft.length} onClick={onSave} type="button">
            {isSaving ? 'Saving...' : 'Save Program'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="driver-meta">Loading maintenance settings...</div>
      ) : (
        <div className="maintenance-settings-list">
          {draft.map((setting) => (
            <div className="maintenance-settings-row" key={setting.service_type}>
              <label className="maintenance-settings-toggle">
                <input
                  checked={setting.is_enabled}
                  onChange={(event) => onChange(setting.service_type, 'is_enabled', event.target.checked)}
                  type="checkbox"
                />
                <span>{setting.service_type}</span>
              </label>
              <input
                className="text-field maintenance-settings-input"
                min="0"
                onChange={(event) => onChange(setting.service_type, 'default_interval_miles', event.target.value)}
                placeholder="Miles"
                type="number"
                value={setting.default_interval_miles}
              />
              <input
                className="text-field maintenance-settings-input"
                min="0"
                onChange={(event) => onChange(setting.service_type, 'default_interval_days', event.target.value)}
                placeholder="Days"
                type="number"
                value={setting.default_interval_days}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

function getVehicleTypeLabel(vehicle) {
  if (vehicle.truck_type === 'Other') {
    return vehicle.custom_truck_type || 'Custom truck type';
  }

  return vehicle.truck_type || 'Truck type not recorded';
}

function getRegistrationStatus(vehicle) {
  if (!vehicle.registration_expiration) {
    return {
      label: 'Registration not recorded',
      className: 'vehicle-registration-row missing',
      metaLabel: 'Registration'
    };
  }

  const expirationDate = parseISO(vehicle.registration_expiration);
  const daysRemaining = differenceInCalendarDays(expirationDate, new Date());

  if (daysRemaining < 0) {
    return {
      label: `Expired ${formatDate(vehicle.registration_expiration)}`,
      className: 'vehicle-registration-row expired',
      metaLabel: 'Registration'
    };
  }

  if (daysRemaining <= 30) {
    return {
      label: `Expires ${formatDate(vehicle.registration_expiration)}`,
      className: 'vehicle-registration-row warning',
      metaLabel: 'Registration'
    };
  }

  return {
    label: formatDate(vehicle.registration_expiration),
    className: 'vehicle-registration-row',
    metaLabel: 'Registration'
  };
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
          <input className="text-field" onChange={(event) => onChange('name', event.target.value)} placeholder="Vehicle ID / FedEx ID" value={form.name} />
          <select className="text-field" onChange={(event) => onChange('truck_type', event.target.value)} value={form.truck_type}>
            <option value="">Select truck type</option>
            {TRUCK_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {form.truck_type === 'Other' ? (
            <input
              className="text-field"
              onChange={(event) => onChange('custom_truck_type', event.target.value)}
              placeholder="Custom truck type"
              value={form.custom_truck_type}
            />
          ) : null}
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
            onChange={(event) => onChange('registration_expiration', event.target.value)}
            type="date"
            value={form.registration_expiration}
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

function EditVehicleModal({ form, errorMessage, isSubmitting, onChange, onClose, onSubmit }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="card-title">Edit Vehicle</div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <input className="text-field" onChange={(event) => onChange('name', event.target.value)} placeholder="Vehicle ID / FedEx ID" value={form.name} />
          <select className="text-field" onChange={(event) => onChange('truck_type', event.target.value)} value={form.truck_type}>
            <option value="">Select truck type</option>
            {TRUCK_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {form.truck_type === 'Other' ? (
            <input
              className="text-field"
              onChange={(event) => onChange('custom_truck_type', event.target.value)}
              placeholder="Custom truck type"
              value={form.custom_truck_type}
            />
          ) : null}
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
            onChange={(event) => onChange('registration_expiration', event.target.value)}
            type="date"
            value={form.registration_expiration}
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
              {isSubmitting ? 'Saving...' : 'Save Changes'}
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
          <select className="text-field" onChange={(event) => onChange('service_type', event.target.value)} value={form.service_type}>
            {SERVICE_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <input className="text-field" onChange={(event) => onChange('description', event.target.value)} placeholder="Work performed / notes" value={form.description} />
          <input className="text-field" onChange={(event) => onChange('condition_notes', event.target.value)} placeholder="Condition / remaining miles" value={form.condition_notes} />
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
          <input className="text-field" onChange={(event) => onChange('next_service_date', event.target.value)} type="date" value={form.next_service_date} />

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
              <span>Type</span>
              <span>Description</span>
              <span>Condition</span>
              <span>Mileage</span>
              <span>Cost</span>
              <span>Next Due</span>
            </div>
            {historyQuery.data.map((row) => (
              <div className="history-table-row" key={row.id}>
                <span>{formatDate(row.service_date)}</span>
                <span>{row.service_type || '—'}</span>
                <span>{row.description}</span>
                <span>{row.condition_notes || '—'}</span>
                <span>{row.mileage_at_service ? formatMileage(row.mileage_at_service) : '—'}</span>
                <span>{formatCurrency(row.cost)}</span>
                <span>{row.next_service_date ? formatDate(row.next_service_date) : row.next_service_mileage ? `${formatMileage(row.next_service_mileage)} mi` : '—'}</span>
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
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isMaintenanceProgramExpanded, setIsMaintenanceProgramExpanded] = useState(true);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [vehicleError, setVehicleError] = useState('');
  const [editVehicleForm, setEditVehicleForm] = useState(emptyVehicleForm);
  const [editVehicleError, setEditVehicleError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [maintenanceVehicle, setMaintenanceVehicle] = useState(null);
  const [historyVehicle, setHistoryVehicle] = useState(null);
  const [maintenanceSettingsDraft, setMaintenanceSettingsDraft] = useState([]);
  const [maintenanceForm, setMaintenanceForm] = useState({
    service_date: getTodayString(),
    service_type: 'Oil Change',
    description: '',
    condition_notes: '',
    cost: '',
    mileage_at_service: '',
    next_service_mileage: '',
    next_service_date: ''
  });
  const [maintenanceError, setMaintenanceError] = useState('');

  const maintenanceSettingsQuery = useQuery({
    queryKey: ['vehicle-maintenance-settings'],
    queryFn: async () => {
      const response = await api.get('/vehicles/settings/maintenance');
      return response.data?.settings || [];
    }
  });

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

  const updateVehicleMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put(`/vehicles/${editingVehicle.id}`, {
        ...editVehicleForm,
        year: Number(editVehicleForm.year),
        current_mileage: Number(editVehicleForm.current_mileage || 0)
      });
      return response.data;
    },
    onSuccess: async () => {
      setEditingVehicle(null);
      setEditVehicleForm(emptyVehicleForm);
      setEditVehicleError('');
      setToastMessage('Vehicle profile updated');
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles'] });
    },
    onError: (error) => {
      setEditVehicleError(error.response?.data?.error || 'Unable to update vehicle.');
    }
  });

  const createMaintenanceMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/vehicles/${maintenanceVehicle.id}/maintenance`, {
        service_date: maintenanceForm.service_date,
        service_type: maintenanceForm.service_type,
        description: maintenanceForm.description,
        condition_notes: maintenanceForm.condition_notes || undefined,
        cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : undefined,
        mileage_at_service: Number(maintenanceForm.mileage_at_service),
        next_service_mileage: maintenanceForm.next_service_mileage ? Number(maintenanceForm.next_service_mileage) : undefined,
        next_service_date: maintenanceForm.next_service_date || undefined
      });
      return response.data;
    },
    onSuccess: async () => {
      setMaintenanceVehicle(null);
      setMaintenanceForm(buildMaintenanceForm({ vehicle: null, settings: activeMaintenanceSettings, mileageAtService: '' }));
      setMaintenanceError('');
      setToastMessage('Service record added');
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles'] });
      if (historyVehicle) {
        await queryClient.invalidateQueries({ queryKey: ['vehicle-maintenance-history', historyVehicle.id] });
      }
    },
    onError: (error) => {
      setMaintenanceError(error.response?.data?.error || 'Unable to save service record.');
    }
  });

  const saveMaintenanceSettingsMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put('/vehicles/settings/maintenance', {
        settings: maintenanceSettingsDraft.map((setting) => ({
          ...setting,
          default_interval_miles: setting.default_interval_miles === '' ? null : Number(setting.default_interval_miles),
          default_interval_days: setting.default_interval_days === '' ? null : Number(setting.default_interval_days)
        }))
      });
      return response.data;
    },
    onSuccess: async (data) => {
      setMaintenanceSettingsDraft(
        (data.settings || []).map((setting) => ({
          ...setting,
          default_interval_miles: setting.default_interval_miles ?? '',
          default_interval_days: setting.default_interval_days ?? ''
        }))
      );
      setIsMaintenanceProgramExpanded(false);
      setToastMessage('Maintenance program updated');
      await queryClient.invalidateQueries({ queryKey: ['vehicle-maintenance-settings'] });
    }
  });

  const vehicles = useMemo(() => vehiclesQuery.data || [], [vehiclesQuery.data]);
  const activeMaintenanceSettings = useMemo(
    () => (maintenanceSettingsDraft.length ? maintenanceSettingsDraft : maintenanceSettingsQuery.data || []),
    [maintenanceSettingsDraft, maintenanceSettingsQuery.data]
  );
  const dueSoonVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.service_due), [vehicles]);
  const registrationAttentionVehicles = useMemo(
    () => vehicles.filter((vehicle) => {
      const registration = getRegistrationStatus(vehicle);
      return registration.className.includes('warning') || registration.className.includes('expired');
    }),
    [vehicles]
  );
  const onRoadCount = useMemo(
    () => vehicles.filter((vehicle) => vehicle.today_assignment?.route_status === 'in_progress').length,
    [vehicles]
  );
  const isSetupFlow = searchParams.get('source') === 'setup';
  const setupFocus = searchParams.get('focus') || '';
  const setupBanner = useMemo(() => {
    if (!isSetupFlow || setupFocus !== 'vehicles') {
      return null;
    }

    if (vehicles.length > 0) {
      return {
        tone: 'done',
        title: 'Vehicles are ready',
        body: `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} can now be assigned during manifest setup.`,
        actionTo: '/manifest?source=setup&focus=routes',
        actionLabel: 'Continue to Routes'
      };
    }

    return {
      tone: 'active',
      title: 'Add the first vehicles for this CSA',
      body: 'Once at least one vehicle is here, ReadyRoute can move you directly into the first manifest import.'
    };
  }, [isSetupFlow, setupFocus, vehicles.length]);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToastMessage(''), 2500);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (!maintenanceSettingsQuery.data?.length) {
      return;
    }

    setMaintenanceSettingsDraft(
      maintenanceSettingsQuery.data.map((setting) => ({
        ...setting,
        default_interval_miles: setting.default_interval_miles ?? '',
        default_interval_days: setting.default_interval_days ?? ''
      }))
    );
  }, [maintenanceSettingsQuery.data]);

  function updateVehicleField(field, value) {
    setVehicleForm((current) => {
      if (field === 'truck_type' && value !== 'Other') {
        return { ...current, truck_type: value, custom_truck_type: '' };
      }

      return { ...current, [field]: value };
    });
  }

  function updateMaintenanceField(field, value) {
    setMaintenanceForm((current) => {
      const next = { ...current, [field]: value };

      if (field === 'service_type') {
        const autofill = getMaintenanceAutofill({
          settings: activeMaintenanceSettings,
          serviceType: value,
          serviceDate: next.service_date,
          mileageAtService: next.mileage_at_service
        });

        next.next_service_mileage = autofill.next_service_mileage;
        next.next_service_date = autofill.next_service_date;
        return next;
      }

      if ((field === 'service_date' || field === 'mileage_at_service') && (!current.next_service_mileage || !current.next_service_date)) {
        const autofill = getMaintenanceAutofill({
          settings: activeMaintenanceSettings,
          serviceType: next.service_type,
          serviceDate: next.service_date,
          mileageAtService: next.mileage_at_service
        });

        if (!current.next_service_mileage) {
          next.next_service_mileage = autofill.next_service_mileage;
        }

        if (!current.next_service_date) {
          next.next_service_date = autofill.next_service_date;
        }
      }

      return next;
    });
  }

  function updateEditVehicleField(field, value) {
    setEditVehicleForm((current) => {
      if (field === 'truck_type' && value !== 'Other') {
        return { ...current, truck_type: value, custom_truck_type: '' };
      }

      return { ...current, [field]: value };
    });
  }

  function updateMaintenanceSetting(serviceType, field, value) {
    setMaintenanceSettingsDraft((current) =>
      current.map((setting) =>
        setting.service_type === serviceType ? { ...setting, [field]: value } : setting
      )
    );
  }

  function handleCreateVehicle(event) {
    event.preventDefault();
    setVehicleError('');

    if (!vehicleForm.name || !vehicleForm.make || !vehicleForm.model || !vehicleForm.year || !vehicleForm.plate) {
      setVehicleError('Vehicle ID, make, model, year, and plate are required.');
      return;
    }

    if (vehicleForm.truck_type === 'Other' && !vehicleForm.custom_truck_type.trim()) {
      setVehicleError('Add a custom truck type when selecting Other.');
      return;
    }

    createVehicleMutation.mutate();
  }

  function openEditVehicle(vehicle) {
    setEditingVehicle(vehicle);
    setEditVehicleError('');
    setEditVehicleForm({
      name: vehicle.name || '',
      truck_type: vehicle.truck_type || '',
      custom_truck_type: vehicle.custom_truck_type || '',
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year ? String(vehicle.year) : '',
      plate: vehicle.plate || '',
      registration_expiration: vehicle.registration_expiration || '',
      current_mileage: String(vehicle.current_mileage || 0)
    });
  }

  function handleEditVehicle(event) {
    event.preventDefault();
    setEditVehicleError('');

    if (!editVehicleForm.name || !editVehicleForm.make || !editVehicleForm.model || !editVehicleForm.year || !editVehicleForm.plate) {
      setEditVehicleError('Vehicle ID, make, model, year, and plate are required.');
      return;
    }

    if (editVehicleForm.truck_type === 'Other' && !editVehicleForm.custom_truck_type.trim()) {
      setEditVehicleError('Add a custom truck type when selecting Other.');
      return;
    }

    updateVehicleMutation.mutate();
  }

  function handleCreateMaintenance(event) {
    event.preventDefault();
    setMaintenanceError('');

    if (!maintenanceForm.service_date || !maintenanceForm.service_type || !maintenanceForm.description || !maintenanceForm.mileage_at_service) {
      setMaintenanceError('Service date, type, description, and mileage at service are required.');
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

      {setupBanner ? (
        <div className={`card setup-continue-banner ${setupBanner.tone}`}>
          <div>
            <div className="setup-next-eyebrow">Onboarding</div>
            <h2>{setupBanner.title}</h2>
            <p>{setupBanner.body}</p>
          </div>
          {setupBanner.actionTo ? (
            <Link className="primary-cta setup-next-action" to={setupBanner.actionTo}>
              {setupBanner.actionLabel}
            </Link>
          ) : null}
        </div>
      ) : null}

      {dueSoonVehicles.length ? (
        <div className="service-due-banner">
          <div>
            <strong>⚠ {dueSoonVehicles.length} vehicle(s) due for service soon</strong>
            <div>{dueSoonVehicles.map((vehicle) => vehicle.name).join(', ')}</div>
          </div>
          <button className="banner-link-button" onClick={scrollToDueVehicle} type="button">View</button>
        </div>
      ) : null}

      {registrationAttentionVehicles.length ? (
        <div className="service-due-banner registration-due-banner">
          <div>
            <strong>⚠ {registrationAttentionVehicles.length} vehicle(s) need registration attention</strong>
            <div>{registrationAttentionVehicles.map((vehicle) => vehicle.name).join(', ')}</div>
          </div>
        </div>
      ) : null}

      {toastMessage ? <div className="success-banner">{toastMessage}</div> : null}

      <MaintenanceSettingsCard
        draft={maintenanceSettingsDraft}
        isExpanded={isMaintenanceProgramExpanded}
        isLoading={maintenanceSettingsQuery.isLoading}
        isSaving={saveMaintenanceSettingsMutation.isPending}
        onChange={updateMaintenanceSetting}
        onCollapse={() => setIsMaintenanceProgramExpanded(false)}
        onExpand={() => setIsMaintenanceProgramExpanded(true)}
        onSave={() => saveMaintenanceSettingsMutation.mutate()}
      />

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
            const registrationStatus = getRegistrationStatus(vehicle);

            return (
              <div className="card vehicle-card" id={`vehicle-card-${vehicle.id}`} key={vehicle.id}>
                <div className="vehicle-card-header">
                  <div className="vehicle-card-title-wrap">
                    <div className="vehicle-card-title">{vehicle.name}</div>
                    <div className="vehicle-type-pill">{getVehicleTypeLabel(vehicle)}</div>
                  </div>
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

                <div className={registrationStatus.className}>
                  <div className="vehicle-meta-label">{registrationStatus.metaLabel}</div>
                  <div className="vehicle-meta-value">{registrationStatus.label}</div>
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
                    onClick={() => openEditVehicle(vehicle)}
                    type="button"
                  >
                    Edit Vehicle
                  </button>
                  <button
                    className="secondary-inline-button"
                    onClick={() => {
                      setMaintenanceVehicle(vehicle);
                      setMaintenanceForm(buildMaintenanceForm({ vehicle, settings: activeMaintenanceSettings }));
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

      {editingVehicle ? (
        <EditVehicleModal
          errorMessage={editVehicleError}
          form={editVehicleForm}
          isSubmitting={updateVehicleMutation.isPending}
          onChange={updateEditVehicleField}
          onClose={() => setEditingVehicle(null)}
          onSubmit={handleEditVehicle}
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
