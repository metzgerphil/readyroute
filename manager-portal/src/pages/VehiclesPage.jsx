import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';

const emptyVehicleForm = {
  name: '',
  truck_type: '',
  custom_truck_type: '',
  fuel_type: '',
  make: '',
  model: '',
  year: '',
  plate: '',
  registration_expiration: '',
  insurance_expiration: '',
  vehicle_status: 'active',
  current_mileage: '0'
};

const emptyEditVehicleForm = {
  ...emptyVehicleForm,
  notes: ''
};

function buildVehiclePayload(form) {
  const vehicleId = String(form.plate || form.name || '').trim();

  return {
    ...form,
    name: vehicleId,
    plate: vehicleId,
    year: Number(form.year),
    current_mileage: Number(form.current_mileage || 0)
  };
}

const TRUCK_TYPE_OPTIONS = [
  'P700',
  'P900',
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

const FUEL_TYPE_OPTIONS = ['Gas', 'Diesel', 'EV'];

const VEHICLE_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'out_of_service', label: 'Out of Service' },
  { value: 'at_the_shop', label: 'At the shop' },
  { value: 'not_on_schedule_b', label: 'Not on Schedule B' },
  { value: 'needs_repair', label: 'Needs Repair' }
];

const VEHICLE_STATUS_TONES = {
  active: 'ready',
  out_of_service: 'blocked',
  at_the_shop: 'maintenance-soon',
  not_on_schedule_b: 'assigned',
  needs_repair: 'blocked'
};

const SERVICE_TYPE_OPTIONS = [
  'Inspection',
  'Oil Change',
  'Air Filter',
  'Brake Pads',
  'General Repair',
  'Other'
];

const VEHICLE_TABS = ['Fleet', 'Maintenance', 'Inspections', 'Settings'];

const VEHICLE_SETTINGS_CARDS = [
  {
    title: 'Maintenance Requirements',
    description: 'Choose Option 1, Option 2, or Custom driver requirements.',
    actionLabel: 'Open'
  },
  {
    title: 'Checklist Template',
    description: 'Edit tires, fluids, lights, wipers, cleanliness, and driver notes.',
    actionLabel: 'Edit'
  },
  {
    title: 'Reminder Schedule',
    description: 'Set weekly inspection day and maintenance warning windows.',
    actionLabel: 'Set'
  }
];

const WEEKLY_INSPECTION_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DEFAULT_MAINTENANCE_REQUIREMENTS = {
  maintenance_requirement_mode: 'option_1',
  weekly_inspection_day: 'Monday',
  custom_daily_requirements: {
    require_truck_confirmation: true,
    require_odometer_entry: true,
    show_issue_note_box: true,
    require_full_checklist_daily: false
  },
  custom_weekly_requirements: {
    require_full_checklist_weekly: true,
    require_manager_review_for_reported_issues: true
  }
};

const DEFAULT_REMINDER_SCHEDULE = {
  weekly_inspection_day: 'Monday',
  maintenance_warning_miles: 1000,
  maintenance_warning_days: 14,
  document_warning_days: 30
};

const MAINTENANCE_REQUIREMENT_OPTIONS = [
  {
    id: 'option_1',
    optionLabel: 'Option 1',
    title: 'Daily Odometer + Issue Note',
    badge: 'Recommended',
    badgeClassName: 'recommended',
    description: 'Drivers confirm their truck, enter the odometer, and can report any vehicle issues noticed that day. A full vehicle inspection is required once per week.',
    dailyRequirements: ['Confirm truck', 'Enter odometer', 'Report any noticed issue'],
    weeklyRequirements: ['Full vehicle inspection on selected weekday']
  },
  {
    id: 'option_2',
    optionLabel: 'Option 2',
    title: 'Daily Odometer + Full Inspection',
    badge: 'Stricter',
    badgeClassName: 'stricter',
    description: 'Drivers confirm their truck, enter the odometer, and complete the full vehicle inspection every day.',
    dailyRequirements: ['Confirm truck', 'Enter odometer', 'Complete full vehicle inspection'],
    weeklyRequirements: ['No separate weekly inspection required']
  },
  {
    id: 'custom',
    optionLabel: 'Option 3',
    title: 'Custom',
    description: 'Managers choose the exact daily and weekly vehicle check requirements.',
    dailyRequirements: ['Choose daily truck checks below'],
    weeklyRequirements: ['Choose weekly vehicle check requirements below']
  }
];

const DEFAULT_CHECKLIST_TEMPLATE_FIELDS = [
  { id: 'date', label: 'Date', detail: 'Inspection date', enabled: true },
  { id: 'company_name', label: 'Company name', detail: 'CSA or company name', enabled: true },
  { id: 'truck_number', label: 'Vehicle ID', detail: 'Vehicle identifier for the inspection', enabled: true },
  { id: 'driver_name', label: 'Driver first and last name', detail: 'Driver completing the inspection', enabled: true },
  { id: 'tires', label: 'Tires, front, rear inner, rear outer', detail: 'Tire condition across front and rear positions', enabled: true },
  { id: 'check_engine_light', label: 'Check engine light', detail: 'On or Off', enabled: true },
  { id: 'coolant', label: 'Coolant', detail: 'Good or Needs Added', enabled: true },
  { id: 'engine_oil', label: 'Engine oil', detail: 'Good, Needs Added, or Needs Full Change', enabled: true },
  { id: 'brake_fluid', label: 'Brake fluid', detail: 'Good or Needs Added', enabled: true },
  { id: 'windshield_fluid', label: 'Windshield fluid', detail: 'Good or Needs Added', enabled: true },
  { id: 'wipers', label: 'Wipers', detail: 'Good, Left Bad, Right Bad, or Both Bad', enabled: true },
  { id: 'lights', label: 'Lights', detail: 'Headlights, stop lights, and turning signals', enabled: true },
  { id: 'truck_cleanliness', label: 'Truck cleanliness', detail: 'Good or Bad', enabled: true },
  { id: 'driver_notes', label: 'Driver notes', detail: 'Free-text notes from the driver', enabled: true }
];

const emptyMaintenanceItemForm = {
  service_type: '',
  default_interval_miles: '',
  default_interval_days: '',
  notes: ''
};

const emptyOdometerForm = {
  odometer_reading: '',
  notes: '',
  confirmedLower: false
};

const emptyMaintenanceRecordFilters = {
  truck: '',
  serviceType: 'all',
  startDate: '',
  endDate: ''
};

const INSPECTION_REVIEW_FILTERS = [
  ['all', 'All'],
  ['needs_review', 'Needs Review'],
  ['reported_issues', 'Reported Issues'],
  ['failed_items', 'Failed Checklist Items'],
  ['submitted', 'Submitted'],
  ['reviewed', 'Reviewed']
];

function getMaintenanceSettingKey(setting, index) {
  return setting.id || `${setting.service_type || 'maintenance-item'}-${index}`;
}

function normalizeMaintenanceSettingForDraft(setting) {
  return {
    ...setting,
    is_enabled: typeof setting.is_enabled === 'boolean' ? setting.is_enabled : true,
    default_interval_miles: setting.default_interval_miles ?? '',
    default_interval_days: setting.default_interval_days ?? '',
    notes: setting.notes || ''
  };
}

function normalizeMaintenanceRequirementSetting(setting) {
  return {
    ...DEFAULT_MAINTENANCE_REQUIREMENTS,
    ...(setting || {}),
    maintenance_requirement_mode: setting?.maintenance_requirement_mode || DEFAULT_MAINTENANCE_REQUIREMENTS.maintenance_requirement_mode,
    weekly_inspection_day: setting?.weekly_inspection_day || DEFAULT_MAINTENANCE_REQUIREMENTS.weekly_inspection_day,
    custom_daily_requirements: {
      ...DEFAULT_MAINTENANCE_REQUIREMENTS.custom_daily_requirements,
      ...(setting?.custom_daily_requirements || {})
    },
    custom_weekly_requirements: {
      ...DEFAULT_MAINTENANCE_REQUIREMENTS.custom_weekly_requirements,
      ...(setting?.custom_weekly_requirements || {})
    }
  };
}

function normalizeReminderSchedule(schedule) {
  return {
    ...DEFAULT_REMINDER_SCHEDULE,
    ...(schedule || {}),
    weekly_inspection_day: schedule?.weekly_inspection_day || DEFAULT_REMINDER_SCHEDULE.weekly_inspection_day,
    maintenance_warning_miles: schedule?.maintenance_warning_miles ?? DEFAULT_REMINDER_SCHEDULE.maintenance_warning_miles,
    maintenance_warning_days: schedule?.maintenance_warning_days ?? DEFAULT_REMINDER_SCHEDULE.maintenance_warning_days,
    document_warning_days: schedule?.document_warning_days ?? DEFAULT_REMINDER_SCHEDULE.document_warning_days
  };
}

function getMaintenanceRequirementModeLabel(mode) {
  return MAINTENANCE_REQUIREMENT_OPTIONS.find((option) => option.id === mode)?.title
    || MAINTENANCE_REQUIREMENT_OPTIONS[0].title;
}

function normalizeChecklistTemplateFields(fields = []) {
  const submittedById = new Map(
    (Array.isArray(fields) ? fields : [])
      .filter((field) => field && typeof field === 'object')
      .map((field) => [String(field.id || '').trim(), field])
      .filter(([id]) => Boolean(id))
  );

  return DEFAULT_CHECKLIST_TEMPLATE_FIELDS.map((defaultField) => {
    const submitted = submittedById.get(defaultField.id);
    return {
      ...defaultField,
      enabled: typeof submitted?.enabled === 'boolean' ? submitted.enabled : defaultField.enabled
    };
  });
}

function getInspectionChecklistFields(template) {
  return normalizeChecklistTemplateFields(template)
    .filter((field) => field.enabled !== false)
    .filter((field) => !['date', 'company_name', 'truck_number', 'driver_name', 'driver_notes'].includes(field.id));
}

function getInspectionForm(vehicle, template) {
  return {
    inspection_date: getTodayString(),
    odometer: vehicle?.current_mileage === null || vehicle?.current_mileage === undefined
      ? ''
      : String(vehicle.current_mileage),
    issue_note: '',
    items: getInspectionChecklistFields(template).map((field) => ({
      checklist_item_key: field.id,
      label: field.label,
      status: 'pass',
      note: ''
    }))
  };
}

function getServiceTypeOptions(settings = []) {
  const options = new Set(SERVICE_TYPE_OPTIONS);

  for (const setting of settings || []) {
    if (setting?.service_type) {
      options.add(setting.service_type);
    }
  }

  return Array.from(options);
}

function filterMaintenanceRecords(records = [], filters = emptyMaintenanceRecordFilters) {
  const truckNeedle = filters.truck.trim().toLowerCase();
  const serviceType = filters.serviceType || 'all';
  const startDate = filters.startDate || '';
  const endDate = filters.endDate || '';

  return (records || []).filter((record) => {
    const truckLabel = [
      record.vehicle?.name,
      record.vehicle_name,
      record.vehicle?.make,
      record.vehicle?.model,
      record.vehicle?.year
    ].filter(Boolean).join(' ').toLowerCase();
    const recordServiceType = record.service_type || 'Maintenance';

    if (truckNeedle && !truckLabel.includes(truckNeedle)) {
      return false;
    }

    if (serviceType !== 'all' && recordServiceType !== serviceType) {
      return false;
    }

    if (startDate && String(record.service_date || '') < startDate) {
      return false;
    }

    if (endDate && String(record.service_date || '') > endDate) {
      return false;
    }

    return true;
  });
}

function filterInspectionRows(inspections = [], filter = 'all') {
  if (filter === 'reported_issues') {
    return inspections.filter((inspection) => inspection.issue_reported || inspection.issue_note);
  }

  if (filter === 'failed_items') {
    return inspections.filter((inspection) => Number(inspection.failed_items_count || 0) > 0 || (inspection.items || []).some((item) => item.status === 'fail'));
  }

  if (filter === 'all') {
    return inspections;
  }

  return inspections.filter((inspection) => inspection.status === filter);
}

function sanitizeCsvValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const stringValue = String(value).replace(/\r?\n|\r/g, ' ').trim();
  return /^[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue;
}

function toCsv(rows = []) {
  return rows.map((row) => row.map((value) => {
    const safeValue = sanitizeCsvValue(value);
    return /[",\n]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
  }).join(',')).join('\n');
}

function downloadCsv(filename, rows = []) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildMaintenanceRecordsCsvRows(records = []) {
  return [
    ['Date', 'Vehicle ID', 'Vehicle Description', 'Vehicle Type', 'Service Type', 'Notes', 'Vendor', 'Mileage', 'Cost', 'Next Due Mileage', 'Next Due Date'],
    ...records.map((record) => [
      record.service_date || '',
      record.vehicle?.name || record.vehicle_name || '',
      record.vehicle ? getVehicleDescription(record.vehicle) : '',
      record.vehicle ? getVehicleTypeLabel(record.vehicle) : '',
      record.service_type || 'Maintenance',
      record.description || '',
      record.vendor_name || '',
      record.mileage_at_service ?? '',
      record.cost ?? '',
      record.next_service_mileage ?? '',
      record.next_service_date || ''
    ])
  ];
}

function buildInspectionCsvRows(inspections = []) {
  return [
    ['Inspection Date', 'Submitted Time', 'Vehicle ID', 'Driver', 'Inspection Type', 'Odometer', 'Status', 'Issue Note', 'Failed Checklist Count', 'Failed Checklist Items', 'Manager Review Note'],
    ...inspections.map((inspection) => {
      const failedItems = inspection.failed_items?.length
        ? inspection.failed_items
        : (inspection.items || []).filter((item) => item.status === 'fail');

      return [
        inspection.inspection_date || '',
        inspection.submitted_at || '',
        getInspectionVehicleLabel(inspection),
        getInspectionDriverLabel(inspection),
        inspection.inspection_type_label || '',
        inspection.odometer ?? '',
        inspection.status_label || '',
        inspection.issue_note || '',
        inspection.failed_items_count ?? failedItems.length,
        failedItems.map((item) => `${item.label || item.checklist_item_key}${item.value ? `: ${item.value}` : ''}${item.note ? ` (${item.note})` : ''}`).join('; '),
        inspection.manager_review_note || ''
      ];
    })
  ];
}

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
    vendor_name: '',
    cost: '',
    mileage_at_service: resolvedMileageAtService,
    next_service_mileage: autofill.next_service_mileage,
    next_service_date: autofill.next_service_date
  };
}

function buildInspectionMaintenancePrefill(inspection) {
  const failedItems = (inspection?.items || [])
    .filter((item) => item.status === 'fail')
    .map((item) => `${item.label}${item.value ? `: ${item.value}` : ''}${item.note ? ` (${item.note})` : ''}`);
  const notes = [
    inspection?.issue_note ? `Driver issue note: ${inspection.issue_note}` : null,
    failedItems.length ? `Failed checklist items: ${failedItems.join('; ')}` : null,
    inspection?.id ? `Source inspection: ${inspection.id}` : null
  ].filter(Boolean);

  return {
    serviceType: failedItems.length || inspection?.issue_note ? 'General Repair' : 'Inspection',
    description: notes.join('\n'),
    conditionNotes: failedItems.join('\n'),
    mileageAtService: inspection?.odometer ? String(inspection.odometer) : ''
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

function MaintenanceSettingsCard({
  draft,
  editingIndex,
  isExpanded,
  isLoading,
  isSaving,
  onAddItem,
  onChange,
  onCollapse,
  onDeleteItem,
  onEditInline,
  onEditItem,
  onExpand,
  onSave
}) {
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
              Choose which service categories this CSA tracks and set default reminder rules.
            </div>
          </div>
          <button className="primary-inline-button" onClick={onExpand} type="button">
            Manage
          </button>
        </div>
        <div className="maintenance-settings-summary">
          <strong>{enabledSettings.length} tracked categories</strong>
          <span>{summaryText}</span>
        </div>
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
          <button className="secondary-inline-button" onClick={onAddItem} type="button">
            Add Maintenance Item
          </button>
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
          <div className="maintenance-settings-header">
            <span>Category</span>
            <span>Mileage interval</span>
            <span>Days interval</span>
            <span>Actions</span>
          </div>
          {draft.map((setting, index) => (
            <div className="maintenance-settings-row" key={getMaintenanceSettingKey(setting, index)}>
              <label className="maintenance-settings-toggle">
                <input
                  checked={setting.is_enabled}
                  onChange={(event) => onChange(index, 'is_enabled', event.target.checked)}
                  type="checkbox"
                />
                <span>{setting.service_type}</span>
              </label>
              {editingIndex === index ? (
                <input
                  className="text-field maintenance-settings-input"
                  min="0"
                  onChange={(event) => onChange(index, 'default_interval_miles', event.target.value)}
                  placeholder="Miles"
                  type="number"
                  value={setting.default_interval_miles}
                />
              ) : (
                <span className="maintenance-settings-value">
                  {setting.default_interval_miles ? `${formatMileage(setting.default_interval_miles)} mi` : 'No mileage rule'}
                </span>
              )}
              {editingIndex === index ? (
                <input
                  className="text-field maintenance-settings-input"
                  min="0"
                  onChange={(event) => onChange(index, 'default_interval_days', event.target.value)}
                  placeholder="Days"
                  type="number"
                  value={setting.default_interval_days}
                />
              ) : (
                <span className="maintenance-settings-value">
                  {setting.default_interval_days ? `${setting.default_interval_days} days` : 'No day rule'}
                </span>
              )}
              <div className="maintenance-settings-row-actions">
                <button className="secondary-inline-button" onClick={() => onEditInline(editingIndex === index ? null : index)} type="button">
                  {editingIndex === index ? 'Done' : 'Edit Intervals'}
                </button>
                <button className="secondary-inline-button" onClick={() => onEditItem(index)} type="button">
                  Details
                </button>
                <button className="secondary-inline-button" onClick={() => onDeleteItem(index)} type="button">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MaintenanceItemModal({ errorMessage, form, isOpen, mode, onChange, onClose, onSubmit }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="card-title">{mode === 'edit' ? 'Edit Maintenance Item' : 'Add Maintenance Item'}</div>
            <div className="driver-meta">Custom maintenance tracking for this CSA.</div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <label>
            <span className="field-label">Item Name</span>
            <input
              className="text-field"
              onChange={(event) => onChange('service_type', event.target.value)}
              placeholder="Lift Gate Service"
              value={form.service_type}
            />
          </label>
          <label>
            <span className="field-label">Mileage Interval</span>
            <input
              className="text-field"
              min="0"
              onChange={(event) => onChange('default_interval_miles', event.target.value)}
              placeholder="Miles"
              type="number"
              value={form.default_interval_miles}
            />
          </label>
          <label>
            <span className="field-label">Days Interval</span>
            <input
              className="text-field"
              min="0"
              onChange={(event) => onChange('default_interval_days', event.target.value)}
              placeholder="Days"
              type="number"
              value={form.default_interval_days}
            />
          </label>
          <label>
            <span className="field-label">Optional Notes</span>
            <textarea
              className="text-field maintenance-item-notes"
              onChange={(event) => onChange('notes', event.target.value)}
              placeholder="What should the manager check?"
              value={form.notes}
            />
          </label>

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" type="submit">
              {mode === 'edit' ? 'Save Item' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OdometerModal({ errorMessage, form, isSaving, onChange, onClose, onConfirmLower, onSubmit, vehicle }) {
  if (!vehicle) {
    return null;
  }

  const currentMileage = Number(vehicle.current_mileage || 0);
  const nextMileage = Number(form.odometer_reading || 0);
  const showLowerWarning = form.odometer_reading !== '' && nextMileage < currentMileage;
  const canSave = !showLowerWarning || form.confirmedLower;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="card-title">Edit Odometer</div>
            <div className="driver-meta">{vehicle.name || 'Vehicle'}</div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <div className="odometer-summary-card">
            <div>
              <span>Vehicle ID</span>
              <strong>{vehicle.name || 'Not recorded'}</strong>
            </div>
            <div>
              <span>Description</span>
              <strong>{getVehicleDescription(vehicle)}</strong>
            </div>
            <div>
              <span>Current odometer</span>
              <strong>{formatMileage(vehicle.current_mileage)} miles</strong>
            </div>
          </div>
          <label>
            <span className="field-label">New odometer reading</span>
            <input
              className="text-field"
              min="0"
              onChange={(event) => onChange('odometer_reading', event.target.value)}
              placeholder="Current mileage"
              type="number"
              value={form.odometer_reading}
            />
          </label>
          <label>
            <span className="field-label">Optional Notes</span>
            <textarea
              className="text-field maintenance-item-notes"
              onChange={(event) => onChange('notes', event.target.value)}
              placeholder="Reason for manager override"
              value={form.notes}
            />
          </label>

          {showLowerWarning ? (
            <div className="warning-banner odometer-warning">
              This is lower than the current odometer reading. Only continue if you are correcting an error.
              <label className="odometer-confirm-row">
                <input
                  checked={form.confirmedLower}
                  onChange={(event) => onConfirmLower(event.target.checked)}
                  type="checkbox"
                />
                <span>I understand and want to save this correction.</span>
              </label>
            </div>
          ) : null}

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSaving || !canSave} type="submit">
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
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

function getVehicleDescription(vehicle) {
  return [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ') || 'Description not recorded';
}

function getVehicleTypeLabel(vehicle) {
  if (vehicle.truck_type === 'Other') {
    return vehicle.custom_truck_type || 'Custom truck type';
  }

  return vehicle.truck_type || 'Truck type not recorded';
}

function getInspectionVehicleLabel(inspection) {
  return inspection?.vehicle?.name || 'Truck not recorded';
}

function getInspectionDriverLabel(inspection) {
  return inspection?.driver?.name || 'Driver not recorded';
}

function getInspectionStatusClass(status) {
  if (status === 'needs_review') {
    return 'warning';
  }

  if (status === 'reviewed') {
    return 'ready';
  }

  return 'neutral';
}

function getExpirationStatus(value, label, warningDays = DEFAULT_REMINDER_SCHEDULE.document_warning_days) {
  if (!value) {
    return {
      label: `${label} not recorded`,
      className: 'vehicle-registration-row missing',
      metaLabel: label
    };
  }

  const expirationDate = parseISO(value);
  const daysRemaining = differenceInCalendarDays(expirationDate, new Date());

  if (daysRemaining < 0) {
    return {
      label: `Expired ${formatDate(value)}`,
      className: 'vehicle-registration-row expired',
      metaLabel: label
    };
  }

  if (daysRemaining <= warningDays) {
    return {
      label: `Expires ${formatDate(value)}`,
      className: 'vehicle-registration-row warning',
      metaLabel: label
    };
  }

  return {
    label: formatDate(value),
    className: 'vehicle-registration-row',
    metaLabel: label
  };
}

function getRegistrationStatus(vehicle, warningDays = DEFAULT_REMINDER_SCHEDULE.document_warning_days) {
  return getExpirationStatus(vehicle.registration_expiration, 'Registration', warningDays);
}

function needsRegistrationAttention(vehicle, warningDays = DEFAULT_REMINDER_SCHEDULE.document_warning_days) {
  const registration = getRegistrationStatus(vehicle, warningDays);
  return ['missing', 'warning', 'expired'].some((statusClass) => registration.className.includes(statusClass));
}

function getReadinessMeta(vehicle) {
  const status = vehicle.readiness_status || vehicle.readiness?.status;

  if (status === 'blocked') {
    return { label: 'Blocked', className: 'vehicle-status-badge blocked', tone: 'error', filter: 'blocked', rowClassName: 'readiness-blocked' };
  }

  if (status === 'maintenance_soon') {
    return { label: 'Maintenance Soon', className: 'vehicle-status-badge maintenance-soon', tone: 'warning', filter: 'maintenance_soon', rowClassName: 'readiness-maintenance-soon' };
  }

  if (status === 'assigned') {
    return { label: 'Assigned', className: 'vehicle-status-badge assigned', tone: 'purple', filter: 'assigned', rowClassName: 'readiness-assigned' };
  }

  if (status === 'ready') {
    return { label: 'Ready', className: 'vehicle-status-badge ready', tone: 'active', filter: 'ready', rowClassName: 'readiness-ready' };
  }

  if (vehicle.service_due || vehicle.maintenance_alert?.status === 'due_soon') {
    return { label: 'Maintenance Soon', className: 'vehicle-status-badge maintenance-soon', tone: 'warning', filter: 'maintenance_soon', rowClassName: 'readiness-maintenance-soon' };
  }

  if (vehicle.maintenance_alert?.status === 'overdue') {
    return { label: 'Blocked', className: 'vehicle-status-badge blocked', tone: 'danger', filter: 'blocked', rowClassName: 'readiness-blocked' };
  }

  if (vehicle.today_assignment) {
    return { label: 'Assigned', className: 'vehicle-status-badge assigned', tone: 'purple', filter: 'assigned', rowClassName: 'readiness-assigned' };
  }

  return { label: 'Ready', className: 'vehicle-status-badge ready', tone: 'active', filter: 'ready', rowClassName: 'readiness-ready' };
}

function getVehicleStatusValue(vehicle) {
  return vehicle.vehicle_status || (vehicle.is_active === false ? 'out_of_service' : 'active');
}

function getVehicleStatusOption(value) {
  return VEHICLE_STATUS_OPTIONS.find((option) => option.value === value) || VEHICLE_STATUS_OPTIONS[0];
}

function getStatusMeta(vehicle) {
  const readiness = getReadinessMeta(vehicle);
  if (vehicle.readiness_status || vehicle.readiness?.status) {
    return readiness;
  }

  const hasMissingInfo = !vehicle.registration_expiration || !vehicle.make || !vehicle.model || !vehicle.year || !vehicle.plate;

  if (vehicle.service_due) {
    return { label: 'Maintenance', className: 'vehicle-status-badge service-due', tone: 'warning' };
  }

  if (vehicle.today_assignment?.route_status === 'in_progress') {
    return { label: 'On road', className: 'vehicle-status-badge on-road', tone: 'warning' };
  }

  if (vehicle.today_assignment) {
    return { label: 'Assigned', className: 'vehicle-status-badge assigned', tone: 'purple' };
  }

  if (hasMissingInfo) {
    return { label: 'Missing info', className: 'vehicle-status-badge missing-info', tone: 'neutral' };
  }

  return { label: 'Available', className: 'vehicle-status-badge available', tone: 'active' };
}

function getMaintenanceAlertMeta(vehicle) {
  const alert = vehicle.maintenance_alert || {};
  const mostUrgent = alert.most_urgent || null;

  if (alert.status === 'overdue') {
    return {
      label: 'Overdue',
      tone: 'warning',
      rowClassName: 'maintenance-overdue',
      itemLabel: mostUrgent?.service_type || 'Maintenance',
      detailLabel: mostUrgent
        ? mostUrgent.remaining_miles !== null && mostUrgent.remaining_miles !== undefined
          ? `${formatMileage(Math.abs(mostUrgent.remaining_miles))} mi overdue`
          : `${Math.abs(mostUrgent.remaining_days || 0)} days overdue`
        : 'Service interval exceeded'
    };
  }

  if (alert.status === 'due_soon') {
    return {
      label: 'Due Soon',
      tone: 'warning',
      rowClassName: 'maintenance-due-soon',
      itemLabel: mostUrgent?.service_type || 'Maintenance',
      detailLabel: mostUrgent
        ? mostUrgent.remaining_miles !== null && mostUrgent.remaining_miles !== undefined
          ? `${formatMileage(mostUrgent.remaining_miles)} mi left`
          : `${mostUrgent.remaining_days} days left`
        : 'Inside warning window'
    };
  }

  return {
    label: 'OK',
    tone: 'active',
    rowClassName: 'maintenance-ok',
    itemLabel: mostUrgent?.service_type || 'No upcoming service',
    detailLabel: mostUrgent
      ? `${formatMileage(mostUrgent.remaining_miles)} mi left`
      : 'No active warning'
  };
}

function getNextServiceLabel(vehicle) {
  const alert = getMaintenanceAlertMeta(vehicle);
  const dueDate = vehicle.maintenance_alert?.most_urgent?.next_due_date;

  if (dueDate) {
    return {
      itemLabel: alert.itemLabel,
      detailLabel: `${alert.detailLabel} · due ${formatDate(dueDate)}`
    };
  }

  return alert;
}

function getLatestIssueLabel(vehicle, warningDays = DEFAULT_REMINDER_SCHEDULE.document_warning_days) {
  const reason = vehicle.readiness?.primary_reason;
  if (reason?.label) {
    return {
      label: reason.label,
      detail: reason.detail || 'Needs review'
    };
  }

  const registration = getRegistrationStatus(vehicle, warningDays);
  if (registration.className.includes('expired') || registration.className.includes('warning')) {
    return { label: registration.metaLabel, detail: registration.label };
  }

  const insurance = getExpirationStatus(vehicle.insurance_expiration, 'Insurance', warningDays);
  if (insurance.className.includes('expired') || insurance.className.includes('warning')) {
    return { label: insurance.metaLabel, detail: insurance.label };
  }

  return { label: 'No open issue', detail: 'Ready to use' };
}

function getAssignedToLabel(vehicle) {
  if (!vehicle.today_assignment) {
    return 'Not assigned';
  }

  return vehicle.today_assignment.driver_name || 'Assigned';
}

function VehicleFormSections({ form, mode = 'create', onChange, vehicle }) {
  const statusMeta = vehicle ? getStatusMeta(vehicle) : null;
  const assignedTo = vehicle ? getAssignedToLabel(vehicle) : 'Not assigned';
  const showFormHints = mode === 'edit';
  const quietWarnings = [
    !form.truck_type ? 'Missing truck type' : null,
    !form.plate || !form.registration_expiration ? 'Registration not recorded' : null,
    !form.insurance_expiration ? 'Insurance not recorded' : null,
    !Number(form.current_mileage) ? 'Mileage not recorded' : null
  ].filter(Boolean);

  return (
    <>
      <section className="vehicle-form-section">
        <div className="vehicle-form-section-heading">
          <span>Truck Identity</span>
        </div>
        <div className="vehicle-form-grid vehicle-identity-grid">
          <label className="driver-modal-field">
            <span className="field-label">Vehicle ID</span>
            <input
              className="text-field"
              onChange={(event) => onChange('plate', event.target.value.toUpperCase())}
              placeholder="Vehicle ID"
              value={form.plate}
            />
            {showFormHints && !form.plate ? <small className="vehicle-form-helper">Vehicle ID not recorded</small> : null}
          </label>
          <label className="driver-modal-field">
            <span className="field-label">Make</span>
            <input className="text-field" onChange={(event) => onChange('make', event.target.value)} placeholder="Make" value={form.make} />
          </label>
          <label className="driver-modal-field">
            <span className="field-label">Model</span>
            <input className="text-field" onChange={(event) => onChange('model', event.target.value)} placeholder="Model" value={form.model} />
          </label>
          <label className="driver-modal-field">
            <span className="field-label">Year</span>
            <input className="text-field" min="1900" onChange={(event) => onChange('year', event.target.value)} placeholder="Year" type="number" value={form.year} />
          </label>
          <label className="driver-modal-field vehicle-truck-type-field">
            <span className="field-label">Truck type</span>
            <select className="text-field" onChange={(event) => onChange('truck_type', event.target.value)} value={form.truck_type}>
              <option value="">Select truck type</option>
              {TRUCK_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {showFormHints && !form.truck_type ? <small className="vehicle-form-helper">Missing truck type</small> : null}
          </label>
          {form.truck_type === 'Other' ? (
            <label className="driver-modal-field vehicle-form-wide">
              <span className="field-label">Custom truck type</span>
              <input
                className="text-field"
                onChange={(event) => onChange('custom_truck_type', event.target.value)}
                placeholder="Custom truck type"
                value={form.custom_truck_type}
              />
            </label>
          ) : null}
          <label className="driver-modal-field">
            <span className="field-label">Fuel type</span>
            <select className="text-field" onChange={(event) => onChange('fuel_type', event.target.value)} value={form.fuel_type}>
              <option value="">Select fuel type</option>
              {FUEL_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="vehicle-form-section">
        <div className="vehicle-form-section-heading">
          <span>Registration</span>
        </div>
        <div className="vehicle-form-grid vehicle-registration-grid">
          <label className="driver-modal-field">
            <span className="field-label">Registration expiration date</span>
            <input
              className="text-field"
              onChange={(event) => onChange('registration_expiration', event.target.value)}
              type="date"
              value={form.registration_expiration}
            />
            {showFormHints && !form.registration_expiration ? <small className="vehicle-form-helper">Expiration not recorded</small> : null}
          </label>
          <label className="driver-modal-field">
            <span className="field-label">Insurance expiration date</span>
            <input
              className="text-field"
              onChange={(event) => onChange('insurance_expiration', event.target.value)}
              type="date"
              value={form.insurance_expiration}
            />
            {showFormHints && !form.insurance_expiration ? <small className="vehicle-form-helper">Insurance not recorded</small> : null}
          </label>
        </div>
      </section>

      <section className="vehicle-form-section">
        <div className="vehicle-form-section-heading">
          <span>Usage and Assignment</span>
        </div>
        <div className="vehicle-form-grid vehicle-usage-grid">
          <label className="driver-modal-field">
            <span className="field-label">Mileage</span>
            <input
              className="text-field"
              min="0"
              onChange={(event) => onChange('current_mileage', event.target.value)}
              placeholder="Current mileage"
              type="number"
              value={form.current_mileage}
            />
            {showFormHints && !Number(form.current_mileage) ? <small className="vehicle-form-helper">Mileage not recorded</small> : null}
          </label>
          {mode === 'edit' && statusMeta ? (
            <label className="driver-modal-field">
              <span className="field-label">Vehicle status</span>
              <select className="text-field" onChange={(event) => onChange('vehicle_status', event.target.value)} value={form.vehicle_status || 'active'}>
                {VEHICLE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <small className="vehicle-form-helper neutral">
                {form.vehicle_status === 'active' ? 'Available for scheduling when readiness is clear.' : 'Held out of scheduling until set back to Active.'}
              </small>
            </label>
          ) : null}
          {mode === 'edit' ? (
            <div className="vehicle-form-readonly vehicle-form-wide">
              <span>Assigned driver</span>
              <strong>{assignedTo}</strong>
              {vehicle?.today_assignment?.work_area_name ? <small>Route {vehicle.today_assignment.work_area_name}</small> : null}
            </div>
          ) : null}
        </div>
      </section>

      {mode === 'edit' ? (
        <section className="vehicle-form-section">
          <div className="vehicle-form-section-heading">
            <span>Notes</span>
          </div>
          <label className="driver-modal-field">
            <span className="field-label">Vehicle notes</span>
            <textarea
              className="text-field vehicle-form-textarea"
              onChange={(event) => onChange('notes', event.target.value)}
              placeholder="Internal notes"
              value={form.notes}
            />
          </label>
        </section>
      ) : null}

      {showFormHints && quietWarnings.length ? (
        <div className="vehicle-form-warning-list">
          {quietWarnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}
    </>
  );
}

function VehicleModal({ form, errorMessage, isSubmitting, onChange, onClose, onSubmit }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card vehicle-form-modal">
        <div className="modal-header">
          <div className="card-title">Add Vehicle</div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="vehicle-form-body" onSubmit={onSubmit}>
          <VehicleFormSections form={form} onChange={onChange} />

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="vehicle-detail-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : 'Add Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VehicleDetailsDrawer({
  form,
  vehicle,
  errorMessage,
  isSubmitting,
  onAddService,
  onChange,
  onClose,
  onRunInspection,
  onViewAssignmentHistory,
  onSubmit,
  onViewInspectionHistory,
  onViewOdometerHistory,
  onViewHistory
}) {
  const statusMeta = getStatusMeta(vehicle);

  return (
    <div className="drawer-backdrop">
      <aside className="vehicle-detail-drawer" aria-label="Vehicle details">
        <div className="vehicle-detail-header">
          <div>
            <div className="vehicle-detail-eyebrow">Vehicle Details</div>
            <div className="vehicle-detail-title">Edit Vehicle</div>
          </div>
          <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="vehicle-form-body" onSubmit={onSubmit}>
          <VehicleFormSections form={form} mode="edit" onChange={onChange} vehicle={vehicle} />

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="vehicle-detail-actions">
            <button className="secondary-inline-button" onClick={onRunInspection} type="button">Run Inspection</button>
            <button className="secondary-inline-button" onClick={onAddService} type="button">Log Maintenance</button>
            <button className="secondary-inline-button" onClick={onViewHistory} type="button">View Maintenance History</button>
            <button className="secondary-inline-button" onClick={onViewInspectionHistory} type="button">View Inspection History</button>
            <button className="secondary-inline-button" onClick={onViewOdometerHistory} type="button">View Odometer History</button>
            <button className="secondary-inline-button" onClick={onViewAssignmentHistory} type="button">View Assignment History</button>
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function InspectionRunnerModal({
  vehicle,
  form,
  errorMessage,
  isSubmitting,
  onChange,
  onChangeStatus,
  onClose,
  onSubmit
}) {
  if (!vehicle) {
    return null;
  }

  const failedCount = (form.items || []).filter((item) => item.status === 'fail').length;

  return (
    <div className="modal-backdrop">
      <div className="modal-card inspection-runner-modal">
        <div className="modal-header">
          <div>
            <div className="card-title">Run Inspection</div>
            <div className="driver-meta">{vehicle.name || 'Vehicle'}</div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form inspection-runner-form" onSubmit={onSubmit}>
          <div className="odometer-summary-card">
            <div>
              <span>Vehicle ID</span>
              <strong>{vehicle.name || 'Not recorded'}</strong>
            </div>
            <div>
              <span>Current odometer</span>
              <strong>{formatMileage(vehicle.current_mileage)} miles</strong>
            </div>
            <div>
              <span>Issues marked</span>
              <strong>{failedCount}</strong>
            </div>
          </div>

          <div className="inspection-runner-fields">
            <label>
              <span className="field-label">Inspection date</span>
              <input
                className="text-field"
                onChange={(event) => onChange('inspection_date', event.target.value)}
                type="date"
                value={form.inspection_date}
              />
            </label>
            <label>
              <span className="field-label">Odometer</span>
              <input
                className="text-field"
                min="0"
                onChange={(event) => onChange('odometer', event.target.value)}
                placeholder="Current odometer"
                type="number"
                value={form.odometer}
              />
            </label>
          </div>

          {(form.items || []).length ? (
            <div className="inspection-runner-checklist">
              {form.items.map((item) => (
                <div className={`inspection-runner-item ${item.status === 'fail' ? 'fail' : ''}`} key={item.checklist_item_key}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.status === 'fail' ? 'Issue marked' : 'Passed'}</span>
                  </div>
                  <div className="inspection-runner-status-actions">
                    <button
                      className={item.status === 'pass' ? 'selected pass' : ''}
                      onClick={() => onChangeStatus(item.checklist_item_key, 'pass')}
                      type="button"
                    >
                      Pass
                    </button>
                    <button
                      className={item.status === 'fail' ? 'selected fail' : ''}
                      onClick={() => onChangeStatus(item.checklist_item_key, 'fail')}
                      type="button"
                    >
                      Issue
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="driver-meta">No inspection checklist items are enabled.</div>
          )}

          <label>
            <span className="field-label">Inspection notes</span>
            <textarea
              className="text-field maintenance-item-notes"
              onChange={(event) => onChange('issue_note', event.target.value)}
              placeholder="Optional notes or issue details"
              value={form.issue_note}
            />
          </label>

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : 'Save Inspection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MaintenanceModal({ vehicle, form, errorMessage, isSubmitting, onChange, onClose, onSubmit, serviceTypeOptions }) {
  if (!vehicle) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="card-title">Log Completed Maintenance</div>
            <div className="driver-meta">{vehicle.name}</div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <div className="odometer-summary-card">
            <div>
              <span>Vehicle ID</span>
              <strong>{vehicle.name || 'Not recorded'}</strong>
            </div>
            <div>
              <span>Current odometer</span>
              <strong>{formatMileage(vehicle.current_mileage)} miles</strong>
            </div>
          </div>
          <label>
            <span className="field-label">Maintenance item completed</span>
            <select className="text-field" onChange={(event) => onChange('service_type', event.target.value)} value={form.service_type}>
              {serviceTypeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Service odometer reading</span>
            <input
              className="text-field"
              min="0"
              onChange={(event) => onChange('mileage_at_service', event.target.value)}
              placeholder="Mileage at service"
              type="number"
              value={form.mileage_at_service}
            />
          </label>
          <label>
            <span className="field-label">Service date</span>
            <input className="text-field" onChange={(event) => onChange('service_date', event.target.value)} type="date" value={form.service_date} />
          </label>
          <label>
            <span className="field-label">Vendor or shop name</span>
            <input className="text-field" onChange={(event) => onChange('vendor_name', event.target.value)} placeholder="Optional" value={form.vendor_name} />
          </label>
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
          <label>
            <span className="field-label">Notes</span>
            <textarea
              className="text-field maintenance-item-notes"
              onChange={(event) => onChange('description', event.target.value)}
              placeholder="Optional notes"
              value={form.description}
            />
          </label>
          {form.next_service_mileage || form.next_service_date ? (
            <div className="driver-meta">
              Next due: {form.next_service_mileage ? `${formatMileage(form.next_service_mileage)} miles` : ''}
              {form.next_service_mileage && form.next_service_date ? ' / ' : ''}
              {form.next_service_date ? formatDate(form.next_service_date) : ''}
            </div>
          ) : null}

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : 'Log Maintenance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MaintenanceHistoryModal({ vehicle, open, onClose, selectedCsaId }) {
  const historyQuery = useQuery({
    queryKey: ['vehicle-maintenance-history', selectedCsaId, vehicle?.id],
    queryFn: async () => {
      const response = await api.get(`/vehicles/${vehicle.id}/maintenance`);
      return response.data?.maintenance || [];
    },
    enabled: open && Boolean(selectedCsaId) && Boolean(vehicle?.id)
  });

  if (!open || !vehicle) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card history-modal-card service-history-modal-card">
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
              <span>Notes</span>
              <span>Vendor</span>
              <span>Mileage</span>
              <span>Cost</span>
              <span>Next Due</span>
            </div>
            {historyQuery.data.map((row) => (
              <div className="history-table-row" key={row.id}>
                <span data-label="Date">{formatDate(row.service_date)}</span>
                <span data-label="Type">{row.service_type || '—'}</span>
                <span className="history-notes-cell" data-label="Notes">{row.description || '—'}</span>
                <span data-label="Vendor">{row.vendor_name || '—'}</span>
                <span data-label="Mileage">{row.mileage_at_service ? `${formatMileage(row.mileage_at_service)} mi` : '—'}</span>
                <span data-label="Cost">{formatCurrency(row.cost)}</span>
                <span data-label="Next Due">{row.next_service_date ? formatDate(row.next_service_date) : row.next_service_mileage ? `${formatMileage(row.next_service_mileage)} mi` : '—'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="driver-meta">No service records yet.</div>
        )}

        <div className="modal-actions">
          <button className="secondary-inline-button" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}

function InspectionHistoryModal({ vehicle, open, onClose, onOpenInspection, selectedCsaId }) {
  const historyQuery = useQuery({
    queryKey: ['vehicle-inspection-history', selectedCsaId, vehicle?.id],
    queryFn: async () => {
      const response = await api.get(`/vehicles/${vehicle.id}/inspection-history`);
      return response.data?.inspections || [];
    },
    enabled: open && Boolean(selectedCsaId) && Boolean(vehicle?.id)
  });

  if (!open || !vehicle) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card history-modal-card inspection-history-modal-card">
        <div className="modal-header">
          <div>
            <div className="card-title">{vehicle.name} — Inspection History</div>
            <div className="driver-meta">Driver vehicle checks and manager review status for this Truck.</div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        {historyQuery.isLoading ? (
          <div className="driver-meta">Loading inspection history...</div>
        ) : historyQuery.data?.length ? (
          <div className="inspection-history-list">
            {historyQuery.data.map((inspection) => {
              const failedItems = (inspection.items || []).filter((item) => item.status === 'fail');

              return (
                <button
                  className="inspection-history-row"
                  key={inspection.id}
                  onClick={() => onOpenInspection(inspection)}
                  type="button"
                >
                  <span className={`inspection-status-pill ${getInspectionStatusClass(inspection.status)}`}>
                    {inspection.status_label}
                  </span>
                  <span className="inspection-review-main">
                    <strong>{inspection.inspection_type_label} • {formatDate(inspection.inspection_date)}</strong>
                    <span>{getInspectionDriverLabel(inspection)} • {inspection.odometer ? `${formatMileage(inspection.odometer)} mi` : 'No odometer'}</span>
                    {inspection.issue_note ? <span>Issue note: {inspection.issue_note}</span> : null}
                  </span>
                  <span className="inspection-review-meta">
                    <strong>{failedItems.length ? `${failedItems.length} failed` : 'No failed items'}</strong>
                    <span>{inspection.manager_review_note || 'No manager note'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="driver-meta">No inspection submissions for this Truck yet.</div>
        )}

        <div className="modal-actions">
          <button className="secondary-inline-button" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}

function OdometerHistoryModal({ vehicle, open, onClose, selectedCsaId }) {
  const historyQuery = useQuery({
    queryKey: ['vehicle-odometer-history', selectedCsaId, vehicle?.id],
    queryFn: async () => {
      const response = await api.get(`/vehicles/${vehicle.id}/odometer-history`);
      return response.data?.odometer_entries || [];
    },
    enabled: open && Boolean(selectedCsaId) && Boolean(vehicle?.id)
  });

  if (!open || !vehicle) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card history-modal-card">
        <div className="modal-header">
          <div>
            <div className="card-title">{vehicle.name} — Odometer History</div>
            <div className="driver-meta">Driver and manager odometer readings for this Truck.</div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        {historyQuery.isLoading ? (
          <div className="driver-meta">Loading odometer history...</div>
        ) : historyQuery.data?.length ? (
          <div className="history-table compact-history-table">
            <div className="history-table-header odometer-history-header">
              <span>Date</span>
              <span>Reading</span>
              <span>Source</span>
              <span>Driver / Route</span>
              <span>Notes</span>
            </div>
            {historyQuery.data.map((entry) => (
              <div className="history-table-row odometer-history-row" key={entry.id}>
                <span data-label="Date">{entry.recorded_at ? format(new Date(entry.recorded_at), 'MMM d, yyyy h:mm a') : '—'}</span>
                <span data-label="Reading">{entry.odometer_reading ? `${formatMileage(entry.odometer_reading)} mi` : '—'}</span>
                <span data-label="Source">{entry.source === 'manager' ? 'Manager' : 'Driver'}</span>
                <span data-label="Driver / Route">
                  {[entry.driver?.name, entry.route?.work_area_name ? `Route ${entry.route.work_area_name}` : null].filter(Boolean).join(' • ') || '—'}
                </span>
                <span data-label="Notes">{entry.notes || '—'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="driver-meta">No odometer history for this Truck yet.</div>
        )}

        <div className="modal-actions">
          <button className="secondary-inline-button" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}

function AssignmentHistoryModal({ vehicle, open, onClose, selectedCsaId }) {
  const historyQuery = useQuery({
    queryKey: ['vehicle-assignment-history', selectedCsaId, vehicle?.id],
    queryFn: async () => {
      const response = await api.get(`/vehicles/${vehicle.id}/assignment-history`);
      return response.data?.assignments || [];
    },
    enabled: open && Boolean(selectedCsaId) && Boolean(vehicle?.id)
  });

  if (!open || !vehicle) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card history-modal-card">
        <div className="modal-header">
          <div>
            <div className="card-title">{vehicle.name} — Assignment History</div>
            <div className="driver-meta">Route and driver assignments for this Truck.</div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        {historyQuery.isLoading ? (
          <div className="driver-meta">Loading assignment history...</div>
        ) : historyQuery.data?.length ? (
          <div className="history-table compact-history-table">
            <div className="history-table-header assignment-history-header">
              <span>Date</span>
              <span>Route</span>
              <span>Driver</span>
              <span>Status</span>
              <span>Stops</span>
            </div>
            {historyQuery.data.map((assignment) => (
              <div className="history-table-row assignment-history-row" key={assignment.id}>
                <span data-label="Date">{formatDate(assignment.date)}</span>
                <span data-label="Route">{assignment.work_area_name || '—'}</span>
                <span data-label="Driver">{assignment.driver?.name || '—'}</span>
                <span data-label="Status">{assignment.status || '—'}</span>
                <span data-label="Stops">
                  {Number.isFinite(Number(assignment.completed_stops)) && Number.isFinite(Number(assignment.total_stops))
                    ? `${assignment.completed_stops}/${assignment.total_stops}`
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="driver-meta">No assignment history for this Truck yet.</div>
        )}

        <div className="modal-actions">
          <button className="secondary-inline-button" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );
}

function MaintenanceRecordsPanel({
  filters,
  isLoading,
  onChangeFilters,
  onClearFilters,
  onExportCsv,
  onViewHistory,
  records,
  serviceTypeOptions,
  totalRecords
}) {
  return (
    <section className="card vehicles-table-card maintenance-records-card">
      <div className="vehicles-table-toolbar">
        <div>
          <div className="card-title">Maintenance Records</div>
          <div className="driver-meta">Recent service records, oil changes, tires, brakes, filters, and repairs.</div>
        </div>
        <div className="vehicles-table-toolbar-actions">
          <span className="driver-meta">{records.length} of {totalRecords} record{totalRecords === 1 ? '' : 's'}</span>
          <button className="secondary-inline-button" disabled={!records.length} onClick={onExportCsv} type="button">
            Export CSV
          </button>
        </div>
      </div>

      <div className="maintenance-record-filter-grid">
        <label>
          <span className="field-label">Truck</span>
          <input
            className="text-field"
            onChange={(event) => onChangeFilters('truck', event.target.value)}
            placeholder="Vehicle ID"
            value={filters.truck}
          />
        </label>
        <label>
          <span className="field-label">Service</span>
          <select
            className="text-field"
            onChange={(event) => onChangeFilters('serviceType', event.target.value)}
            value={filters.serviceType}
          >
            <option value="all">All service types</option>
            {serviceTypeOptions.map((serviceType) => (
              <option key={serviceType} value={serviceType}>{serviceType}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">From</span>
          <input
            className="text-field"
            onChange={(event) => onChangeFilters('startDate', event.target.value)}
            type="date"
            value={filters.startDate}
          />
        </label>
        <label>
          <span className="field-label">To</span>
          <input
            className="text-field"
            onChange={(event) => onChangeFilters('endDate', event.target.value)}
            type="date"
            value={filters.endDate}
          />
        </label>
        <button className="secondary-inline-button" onClick={onClearFilters} type="button">
          Clear
        </button>
      </div>

      {isLoading ? (
        <div className="labor-empty-state">Loading maintenance records...</div>
      ) : records.length ? (
        <div className="maintenance-records-table">
          <div className="maintenance-records-table-header">
            <span>Date</span>
            <span>Truck</span>
            <span>Service</span>
            <span>Notes</span>
            <span>Vendor</span>
            <span>Mileage</span>
            <span>Next Due</span>
            <span>Actions</span>
          </div>
          {records.map((record) => (
            <div className="maintenance-records-table-row" key={record.id}>
              <span>{formatDate(record.service_date)}</span>
              <span className="vehicles-table-primary">
                <strong>{record.vehicle?.name || 'Truck not found'}</strong>
                <span>{record.vehicle ? getVehicleDescription(record.vehicle) : 'Vehicle record unavailable'}</span>
              </span>
              <span>{record.service_type || 'Maintenance'}</span>
              <span>{record.description || '—'}</span>
              <span>{record.vendor_name || '—'}</span>
              <span>{record.mileage_at_service ? `${formatMileage(record.mileage_at_service)} mi` : '—'}</span>
              <span>{record.next_service_date ? formatDate(record.next_service_date) : record.next_service_mileage ? `${formatMileage(record.next_service_mileage)} mi` : '—'}</span>
              <span>
                {record.vehicle ? (
                  <button className="secondary-inline-button" onClick={() => onViewHistory(record.vehicle)} type="button">
                    History
                  </button>
                ) : '—'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="labor-empty-state">
          {totalRecords ? 'No maintenance records match these filters.' : 'No maintenance records yet. Log maintenance from a truck row or vehicle details to see it here.'}
        </div>
      )}
    </section>
  );
}

function VehicleTabs({ activeTab, onChange }) {
  return (
    <div className="vehicles-tab-bar" role="tablist" aria-label="Vehicles sections">
      {VEHICLE_TABS.map((tab) => (
        <button
          aria-selected={activeTab === tab}
          className={`vehicles-tab-button${activeTab === tab ? ' active' : ''}`}
          key={tab}
          onClick={() => onChange(tab)}
          role="tab"
          type="button"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function VehicleSettingsPanel({
  maintenanceRequirements,
  onOpenChecklistTemplate,
  onOpenMaintenanceRequirements,
  onOpenReminderSchedule,
  reminderSchedule
}) {
  return (
    <section className="card vehicle-settings-panel" aria-labelledby="vehicle-settings-title">
      <div className="vehicle-settings-heading">
        <div>
          <h2 id="vehicle-settings-title">Vehicle Settings</h2>
          <p>Configure how this CSA tracks service and how drivers complete vehicle checks.</p>
        </div>
      </div>

      <div className="vehicle-settings-grid">
        {VEHICLE_SETTINGS_CARDS.map((card) => (
          <article className="vehicle-settings-card" key={card.title}>
            <div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              {card.title === 'Maintenance Requirements' ? (
                <div className="vehicle-settings-card-summary">
                  Current: {getMaintenanceRequirementModeLabel(maintenanceRequirements.maintenance_requirement_mode)}
                </div>
              ) : null}
              {card.title === 'Reminder Schedule' ? (
                <div className="vehicle-settings-card-summary">
                  Weekly: {reminderSchedule.weekly_inspection_day} • {reminderSchedule.maintenance_warning_miles} mi / {reminderSchedule.maintenance_warning_days} days
                </div>
              ) : null}
            </div>
            <button
              className={card.disabled ? 'secondary-inline-button vehicle-settings-disabled-action' : 'primary-inline-button'}
              disabled={card.disabled}
              onClick={
                card.title === 'Maintenance Requirements'
                  ? onOpenMaintenanceRequirements
                  : card.title === 'Checklist Template'
                    ? onOpenChecklistTemplate
                    : card.title === 'Reminder Schedule'
                      ? onOpenReminderSchedule
                      : undefined
              }
              type="button"
            >
              {card.actionLabel}
            </button>
          </article>
        ))}
      </div>

      <p className="vehicle-settings-helper">
        Vehicle blocking is handled automatically through vehicle readiness status, overdue maintenance, expired documents, and unresolved serious issues.
      </p>
    </section>
  );
}

function ReminderScheduleScreen({
  draft,
  errorMessage,
  isLoading,
  isSaving,
  onBack,
  onChange,
  onSave
}) {
  return (
    <section className="card reminder-schedule-panel" aria-labelledby="reminder-schedule-title">
      <div className="maintenance-requirements-header">
        <div>
          <button className="secondary-inline-button" onClick={onBack} type="button">Back to Settings</button>
          <h2 id="reminder-schedule-title">Reminder Schedule</h2>
          <p>Set the weekly inspection day and warning windows for vehicle readiness.</p>
        </div>
        <button className="primary-inline-button" disabled={isSaving} onClick={onSave} type="button">
          {isSaving ? 'Saving...' : 'Save Schedule'}
        </button>
      </div>

      {isLoading ? <div className="driver-meta">Loading reminder schedule...</div> : null}

      <div className="reminder-schedule-grid">
        <label className="driver-modal-field">
          <span className="field-label">Weekly inspection day</span>
          <select
            className="text-field"
            onChange={(event) => onChange('weekly_inspection_day', event.target.value)}
            value={draft.weekly_inspection_day}
          >
            {WEEKLY_INSPECTION_DAYS.map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
          <small className="vehicle-form-helper">Used for weekly full inspections in Option 1 and Custom.</small>
        </label>

        <label className="driver-modal-field">
          <span className="field-label">Maintenance mileage warning</span>
          <input
            className="text-field"
            min="0"
            onChange={(event) => onChange('maintenance_warning_miles', event.target.value)}
            type="number"
            value={draft.maintenance_warning_miles}
          />
          <small className="vehicle-form-helper">Show maintenance soon when a truck is within this many miles.</small>
        </label>

        <label className="driver-modal-field">
          <span className="field-label">Maintenance day warning</span>
          <input
            className="text-field"
            min="0"
            onChange={(event) => onChange('maintenance_warning_days', event.target.value)}
            type="number"
            value={draft.maintenance_warning_days}
          />
          <small className="vehicle-form-helper">Show maintenance soon when scheduled service is within this many days.</small>
        </label>

        <label className="driver-modal-field">
          <span className="field-label">Document expiration warning</span>
          <input
            className="text-field"
            min="0"
            onChange={(event) => onChange('document_warning_days', event.target.value)}
            type="number"
            value={draft.document_warning_days}
          />
          <small className="vehicle-form-helper">Show registration or insurance attention before expiration.</small>
        </label>
      </div>

      <p className="vehicle-settings-helper maintenance-requirements-apply-note">
        Reminder windows update vehicle readiness and manager warnings. Expired documents and overdue maintenance still block vehicles automatically.
      </p>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
    </section>
  );
}

function ChecklistTemplateScreen({
  errorMessage,
  fields,
  isLoading,
  isSaving,
  onBack,
  onSave,
  onToggleField
}) {
  return (
    <section className="card checklist-template-panel" aria-labelledby="checklist-template-title">
      <div className="checklist-template-header">
        <div>
          <button className="secondary-inline-button" onClick={onBack} type="button">Back to Settings</button>
          <h2 id="checklist-template-title">Checklist Template</h2>
          <p>Default CSA vehicle maintenance inspection checklist.</p>
        </div>
        <div className="checklist-template-actions">
          <button className="primary-inline-button" disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>

      <p className="vehicle-settings-helper checklist-template-note">
        Enable or disable checklist fields for weekly full inspections in Option 1 and daily full inspections in Option 2.
      </p>

      {isLoading ? <div className="driver-meta">Loading saved checklist template...</div> : null}

      <div className="checklist-template-list" aria-label="Default checklist fields">
        {fields.map((field, index) => (
          <div className={`checklist-template-row${field.enabled ? '' : ' disabled'}`} key={field.id}>
            <span className="checklist-template-number">{index + 1}</span>
            <div>
              <strong>{field.label}</strong>
              <span>{field.detail}</span>
            </div>
            <label className="checklist-template-toggle">
              <input
                checked={field.enabled}
                onChange={(event) => onToggleField(field.id, event.target.checked)}
                type="checkbox"
              />
              <span>{field.enabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>
        ))}
      </div>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
    </section>
  );
}

function RequirementList({ items }) {
  return (
    <ul className="maintenance-requirement-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function MaintenanceRequirementsScreen({
  draft,
  errorMessage,
  isLoading,
  isSaving,
  onBack,
  onChangeCustomDaily,
  onChangeCustomWeekly,
  onChangeMode,
  onChangeWeeklyDay,
  onSave
}) {
  return (
    <section className="card maintenance-requirements-panel" aria-labelledby="maintenance-requirements-title">
      <div className="maintenance-requirements-header">
        <div>
          <button className="secondary-inline-button" onClick={onBack} type="button">Back to Settings</button>
          <h2 id="maintenance-requirements-title">Maintenance Requirements</h2>
          <p>Choose what drivers must complete for vehicle checks.</p>
        </div>
        <button className="primary-inline-button" disabled={isSaving} onClick={onSave} type="button">
          {isSaving ? 'Saving...' : 'Save Requirements'}
        </button>
      </div>

      {isLoading ? <div className="driver-meta">Loading saved maintenance requirements...</div> : null}

      <div className="maintenance-requirement-options">
        {MAINTENANCE_REQUIREMENT_OPTIONS.map((option) => {
          const isSelected = draft.maintenance_requirement_mode === option.id;

          return (
            <button
              aria-pressed={isSelected}
              className={`maintenance-requirement-option${isSelected ? ' selected' : ''}`}
              key={option.id}
              onClick={() => onChangeMode(option.id)}
              type="button"
            >
              <div className="maintenance-requirement-option-topline">
                <span>{option.optionLabel}</span>
                {option.badge ? <strong className={`maintenance-requirement-badge ${option.badgeClassName}`}>{option.badge}</strong> : null}
              </div>
              <h3>{option.title}</h3>
              <p>{option.description}</p>
              <div className="maintenance-requirement-columns">
                <div>
                  <span>Daily requirements</span>
                  <RequirementList items={option.dailyRequirements} />
                </div>
                <div>
                  <span>Weekly requirements</span>
                  <RequirementList items={option.weeklyRequirements} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="maintenance-requirements-controls">
        <label className="driver-modal-field maintenance-weekday-field">
          <span className="field-label">Weekly inspection day</span>
          <select
            className="text-field"
            onChange={(event) => onChangeWeeklyDay(event.target.value)}
            value={draft.weekly_inspection_day}
          >
            {WEEKLY_INSPECTION_DAYS.map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </label>

        {draft.maintenance_requirement_mode === 'custom' ? (
          <div className="maintenance-custom-controls">
            <div>
              <h3>Custom Daily Requirements</h3>
              <label>
                <input
                  checked={draft.custom_daily_requirements.require_truck_confirmation}
                  onChange={(event) => onChangeCustomDaily('require_truck_confirmation', event.target.checked)}
                  type="checkbox"
                />
                <span>Require daily truck confirmation</span>
              </label>
              <label>
                <input
                  checked={draft.custom_daily_requirements.require_odometer_entry}
                  onChange={(event) => onChangeCustomDaily('require_odometer_entry', event.target.checked)}
                  type="checkbox"
                />
                <span>Require daily odometer entry</span>
              </label>
              <label>
                <input
                  checked={draft.custom_daily_requirements.show_issue_note_box}
                  onChange={(event) => onChangeCustomDaily('show_issue_note_box', event.target.checked)}
                  type="checkbox"
                />
                <span>Show daily issue note box</span>
              </label>
              <label>
                <input
                  checked={draft.custom_daily_requirements.require_full_checklist_daily}
                  onChange={(event) => onChangeCustomDaily('require_full_checklist_daily', event.target.checked)}
                  type="checkbox"
                />
                <span>Require full checklist daily</span>
              </label>
            </div>

            <div>
              <h3>Custom Weekly Requirements</h3>
              <label>
                <input
                  checked={draft.custom_weekly_requirements.require_full_checklist_weekly}
                  onChange={(event) => onChangeCustomWeekly('require_full_checklist_weekly', event.target.checked)}
                  type="checkbox"
                />
                <span>Require full checklist weekly</span>
              </label>
              <label>
                <input
                  checked={draft.custom_weekly_requirements.require_manager_review_for_reported_issues}
                  onChange={(event) => onChangeCustomWeekly('require_manager_review_for_reported_issues', event.target.checked)}
                  type="checkbox"
                />
                <span>Require manager review for reported issues</span>
              </label>
            </div>
          </div>
        ) : null}
      </div>

      <p className="vehicle-settings-helper maintenance-requirements-apply-note">
        Changes apply to the next workday so today's driver checks are not interrupted.
      </p>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
    </section>
  );
}

function VehiclePlaceholderPanel({ title, description }) {
  return (
    <section className="card vehicle-tab-placeholder">
      <div className="card-title">{title}</div>
      <div className="driver-meta">{description}</div>
    </section>
  );
}

function InspectionDetailModal({
  inspection,
  isReviewing,
  onChangeReviewNote,
  onClose,
  onLogMaintenanceFromIssue,
  onReview,
  reviewNote
}) {
  if (!inspection) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card inspection-detail-modal">
        <div className="modal-header">
          <div>
            <div className="card-title">{getInspectionVehicleLabel(inspection)} — Inspection</div>
            <div className="driver-meta">
              {inspection.inspection_type_label} • {formatDate(inspection.inspection_date)} • {getInspectionDriverLabel(inspection)}
            </div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <div className="inspection-detail-summary">
          <div>
            <span>Status</span>
            <strong>{inspection.status_label}</strong>
          </div>
          <div>
            <span>Odometer</span>
            <strong>{inspection.odometer ? `${formatMileage(inspection.odometer)} mi` : 'Not recorded'}</strong>
          </div>
          <div>
            <span>Submitted</span>
            <strong>{inspection.submitted_at ? format(new Date(inspection.submitted_at), 'MMM d, h:mm a') : 'Not recorded'}</strong>
          </div>
        </div>

        {inspection.issue_note ? (
          <div className="inspection-issue-note">
            <strong>Driver issue note</strong>
            <span>{inspection.issue_note}</span>
          </div>
        ) : null}

        <div className="inspection-items-list">
          {(inspection.items || []).length ? inspection.items.map((item) => (
            <div className={`inspection-item-row ${item.status}`} key={item.id || item.checklist_item_key}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.value || item.note || 'No answer recorded'}</span>
              </div>
              <span className="inspection-item-status">{item.status.replace('_', ' ')}</span>
            </div>
          )) : (
            <div className="labor-empty-state">No checklist item answers were submitted.</div>
          )}
        </div>

        {inspection.status !== 'reviewed' ? (
          <label className="inspection-review-note">
            <span className="field-label">Manager review note</span>
            <textarea
              className="text-field maintenance-item-notes"
              onChange={(event) => onChangeReviewNote(event.target.value)}
              placeholder="Optional note for this review"
              value={reviewNote}
            />
          </label>
        ) : inspection.manager_review_note ? (
          <div className="inspection-issue-note">
            <strong>Manager review note</strong>
            <span>{inspection.manager_review_note}</span>
          </div>
        ) : null}

        <div className="modal-actions">
          <button className="secondary-inline-button" onClick={onClose} type="button">Close</button>
          <button className="secondary-inline-button" onClick={onLogMaintenanceFromIssue} type="button">
            Log Maintenance from Issue
          </button>
          {inspection.status !== 'reviewed' ? (
            <button className="primary-inline-button" disabled={isReviewing} onClick={onReview} type="button">
              {isReviewing ? 'Saving...' : 'Mark Reviewed'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InspectionsPanel({
  inspections,
  isLoading,
  onExportCsv,
  onOpenInspection,
  onStatusFilterChange,
  statusFilter
}) {
  const needsReviewCount = inspections.filter((inspection) => inspection.status === 'needs_review').length;
  const reviewedCount = inspections.filter((inspection) => inspection.status === 'reviewed').length;

  return (
    <section className="card inspections-panel vehicle-inspections-review-panel">
      <div className="vehicles-table-toolbar">
        <div>
          <div className="card-title">Inspections</div>
          <div className="driver-meta">
            Driver vehicle checks, weekly inspections, daily issue notes, and manager review items.
          </div>
        </div>
        <div className="vehicles-table-toolbar-actions">
          <span className="driver-meta">{inspections.length} submission{inspections.length === 1 ? '' : 's'}</span>
          <button className="secondary-inline-button" disabled={!inspections.length} onClick={onExportCsv} type="button">
            Export CSV
          </button>
        </div>
      </div>

      <div className="inspection-summary-grid">
        <div className="inspection-summary-tile attention">
          <span>Needs Review</span>
          <strong>{needsReviewCount}</strong>
        </div>
        <div className="inspection-summary-tile">
          <span>Submitted</span>
          <strong>{inspections.filter((inspection) => inspection.status === 'submitted').length}</strong>
        </div>
        <div className="inspection-summary-tile">
          <span>Reviewed</span>
          <strong>{reviewedCount}</strong>
        </div>
      </div>

      <div className="inspection-filter-row">
        {INSPECTION_REVIEW_FILTERS.map(([value, label]) => (
          <button
            className={`vehicle-status-filter ${statusFilter === value ? 'active' : ''}`}
            key={value}
            onClick={() => onStatusFilterChange(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="labor-empty-state">Loading vehicle inspections...</div>
      ) : inspections.length ? (
        <div className="inspection-review-list">
          {inspections.map((inspection) => (
            <button
              className="inspection-review-row"
              key={inspection.id}
              onClick={() => onOpenInspection(inspection)}
              type="button"
            >
              <span className={`inspection-status-pill ${getInspectionStatusClass(inspection.status)}`}>
                {inspection.status_label}
              </span>
              <span className="inspection-review-main">
                <strong>{getInspectionVehicleLabel(inspection)}</strong>
                <span>{inspection.inspection_type_label} • {getInspectionDriverLabel(inspection)}</span>
              </span>
              <span className="inspection-review-meta">
                <strong>{formatDate(inspection.inspection_date)}</strong>
                <span>{inspection.odometer ? `${formatMileage(inspection.odometer)} mi` : 'No odometer'}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="labor-empty-state">No vehicle inspection submissions found for this filter.</div>
      )}
    </section>
  );
}

export default function VehiclesPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { selectedCsaId } = useSelectedCsa();
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isMaintenanceProgramExpanded, setIsMaintenanceProgramExpanded] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [vehicleError, setVehicleError] = useState('');
  const [editVehicleForm, setEditVehicleForm] = useState(emptyEditVehicleForm);
  const [editVehicleError, setEditVehicleError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [maintenanceVehicle, setMaintenanceVehicle] = useState(null);
  const [historyVehicle, setHistoryVehicle] = useState(null);
  const [inspectionHistoryVehicle, setInspectionHistoryVehicle] = useState(null);
  const [inspectionRunnerVehicle, setInspectionRunnerVehicle] = useState(null);
  const [odometerHistoryVehicle, setOdometerHistoryVehicle] = useState(null);
  const [assignmentHistoryVehicle, setAssignmentHistoryVehicle] = useState(null);
  const [maintenanceSettingsDraft, setMaintenanceSettingsDraft] = useState(null);
  const [maintenanceSettingsEditingIndex, setMaintenanceSettingsEditingIndex] = useState(null);
  const [maintenanceItemEditor, setMaintenanceItemEditor] = useState(null);
  const [maintenanceItemError, setMaintenanceItemError] = useState('');
  const [odometerVehicle, setOdometerVehicle] = useState(null);
  const [odometerForm, setOdometerForm] = useState(emptyOdometerForm);
  const [odometerError, setOdometerError] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState('all');
  const [maintenanceRecordFilters, setMaintenanceRecordFilters] = useState(emptyMaintenanceRecordFilters);
  const [activeVehiclesTab, setActiveVehiclesTab] = useState('Fleet');
  const [inspectionStatusFilter, setInspectionStatusFilter] = useState('all');
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [inspectionReviewNote, setInspectionReviewNote] = useState('');
  const [vehicleSettingsView, setVehicleSettingsView] = useState('overview');
  const [maintenanceRequirementsDraft, setMaintenanceRequirementsDraft] = useState(null);
  const [maintenanceRequirementsError, setMaintenanceRequirementsError] = useState('');
  const [checklistTemplateDraft, setChecklistTemplateDraft] = useState(null);
  const [checklistTemplateError, setChecklistTemplateError] = useState('');
  const [reminderScheduleDraft, setReminderScheduleDraft] = useState(null);
  const [reminderScheduleError, setReminderScheduleError] = useState('');
  const vehicleImportInputRef = useRef(null);
  const [maintenanceForm, setMaintenanceForm] = useState({
    service_date: getTodayString(),
    service_type: 'Oil Change',
    description: '',
    condition_notes: '',
    vendor_name: '',
    cost: '',
    mileage_at_service: '',
    next_service_mileage: '',
    next_service_date: ''
  });
  const [maintenanceError, setMaintenanceError] = useState('');
  const [inspectionRunnerForm, setInspectionRunnerForm] = useState(getInspectionForm(null, null));
  const [inspectionRunnerError, setInspectionRunnerError] = useState('');

  const maintenanceSettingsQuery = useQuery({
    queryKey: ['vehicle-maintenance-settings', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/vehicles/settings/maintenance');
      return response.data?.settings || [];
    }
  });

  const maintenanceRequirementsQuery = useQuery({
    queryKey: ['vehicle-maintenance-requirements', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/vehicles/settings/maintenance-requirements');
      return normalizeMaintenanceRequirementSetting(response.data?.setting);
    }
  });

  const checklistTemplateQuery = useQuery({
    queryKey: ['vehicle-checklist-template', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/vehicles/settings/checklist-template');
      return normalizeChecklistTemplateFields(response.data?.template?.fields);
    }
  });

  const reminderScheduleQuery = useQuery({
    queryKey: ['vehicle-reminder-schedule', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/vehicles/settings/reminder-schedule');
      return normalizeReminderSchedule(response.data?.schedule);
    }
  });

  const vehiclesQuery = useQuery({
    queryKey: ['fleet-vehicles', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/vehicles');
      return response.data?.vehicles || [];
    },
    refetchInterval: 60000
  });

  const maintenanceRecordsQuery = useQuery({
    queryKey: ['vehicle-maintenance-records', selectedCsaId],
    enabled: Boolean(selectedCsaId) && activeVehiclesTab === 'Maintenance',
    queryFn: async () => {
      const response = await api.get('/vehicles/maintenance-records');
      return response.data?.maintenance || [];
    }
  });

  const inspectionsQuery = useQuery({
    queryKey: ['vehicle-inspections', selectedCsaId, inspectionStatusFilter],
    enabled: Boolean(selectedCsaId) && activeVehiclesTab === 'Inspections',
    queryFn: async () => {
      const serverStatusFilter = ['reported_issues', 'failed_items'].includes(inspectionStatusFilter)
        ? 'all'
        : inspectionStatusFilter;
      const response = await api.get('/vehicles/inspections', {
        params: {
          status: serverStatusFilter
        }
      });
      return response.data?.inspections || [];
    }
  });

  const inspectionDetailQuery = useQuery({
    queryKey: ['vehicle-inspection-detail', selectedCsaId, selectedInspection?.id],
    enabled: Boolean(selectedCsaId) && Boolean(selectedInspection?.id),
    queryFn: async () => {
      const response = await api.get(`/vehicles/inspections/${selectedInspection.id}`);
      return response.data?.inspection || null;
    }
  });

  const createVehicleMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/vehicles', buildVehiclePayload(vehicleForm));
      return response.data;
    },
    onSuccess: async () => {
      setIsVehicleModalOpen(false);
      setVehicleForm(emptyVehicleForm);
      setVehicleError('');
      setToastMessage('Vehicle added to fleet');
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles', selectedCsaId] });
    },
    onError: (error) => {
      setVehicleError(error.response?.data?.error || 'Unable to create vehicle.');
    }
  });

  const reviewInspectionMutation = useMutation({
    mutationFn: async () => {
      const inspectionId = inspectionDetailQuery.data?.id || selectedInspection?.id;
      const response = await api.put(`/vehicles/inspections/${inspectionId}/review`, {
        manager_review_note: inspectionReviewNote || undefined
      });
      return response.data?.inspection;
    },
    onSuccess: async () => {
      setInspectionReviewNote('');
      setSelectedInspection(null);
      setToastMessage('Vehicle inspection marked reviewed');
      await queryClient.invalidateQueries({ queryKey: ['vehicle-inspections', selectedCsaId] });
      await queryClient.invalidateQueries({ queryKey: ['vehicle-inspection-detail', selectedCsaId] });
      if (inspectionHistoryVehicle) {
        await queryClient.invalidateQueries({ queryKey: ['vehicle-inspection-history', selectedCsaId, inspectionHistoryVehicle.id] });
      }
    }
  });

  const importVehiclesMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/vehicles/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    },
    onSuccess: async (result) => {
      setToastMessage(
        `Vehicle import complete: ${result.created || 0} created, ${result.skipped || 0} skipped, ${(result.errors || []).length} errors.`
      );
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles', selectedCsaId] });
    },
    onError: (error) => {
      setToastMessage(error.response?.data?.error || 'Unable to import vehicles.');
    }
  });

  const updateVehicleMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put(`/vehicles/${editingVehicle.id}`, buildVehiclePayload(editVehicleForm));
      return response.data;
    },
    onSuccess: async () => {
      setEditingVehicle(null);
      setEditVehicleForm(emptyEditVehicleForm);
      setEditVehicleError('');
      setToastMessage('Vehicle profile updated');
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles', selectedCsaId] });
    },
    onError: (error) => {
      setEditVehicleError(error.response?.data?.error || 'Unable to update vehicle.');
    }
  });

  const updateVehicleStatusMutation = useMutation({
    mutationFn: async ({ vehicleId, vehicleStatus }) => {
      const response = await api.put(`/vehicles/${vehicleId}`, {
        vehicle_status: vehicleStatus
      });
      return response.data;
    },
    onSuccess: async (_, variables) => {
      const option = getVehicleStatusOption(variables.vehicleStatus);
      setToastMessage(`Vehicle status updated to ${option.label}`);
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles', selectedCsaId] });
    },
    onError: () => {
      setToastMessage('Unable to update vehicle status.');
    }
  });

  const updateOdometerMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/vehicles/${odometerVehicle.id}/odometer`, {
        odometer_reading: Number(odometerForm.odometer_reading),
        notes: odometerForm.notes.trim() || undefined
      });
      return response.data;
    },
    onSuccess: async () => {
      setOdometerVehicle(null);
      setOdometerForm(emptyOdometerForm);
      setOdometerError('');
      setToastMessage('Odometer updated');
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles', selectedCsaId] });
    },
    onError: (error) => {
      setOdometerError(error.response?.data?.error || 'Unable to update odometer.');
    }
  });

  const createMaintenanceMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/vehicles/${maintenanceVehicle.id}/maintenance`, {
        service_date: maintenanceForm.service_date,
        service_type: maintenanceForm.service_type,
        description: maintenanceForm.description || undefined,
        condition_notes: maintenanceForm.condition_notes || undefined,
        vendor_name: maintenanceForm.vendor_name || undefined,
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
      setToastMessage('Maintenance logged');
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles', selectedCsaId] });
      await queryClient.invalidateQueries({ queryKey: ['vehicle-maintenance-records', selectedCsaId] });
      if (historyVehicle) {
        await queryClient.invalidateQueries({ queryKey: ['vehicle-maintenance-history', selectedCsaId, historyVehicle.id] });
      }
    },
    onError: (error) => {
      setMaintenanceError(error.response?.data?.error || 'Unable to save service record.');
    }
  });

  const createInspectionMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/vehicles/${inspectionRunnerVehicle.id}/inspections`, {
        inspection_date: inspectionRunnerForm.inspection_date,
        odometer: Number(inspectionRunnerForm.odometer),
        issue_note: inspectionRunnerForm.issue_note || undefined,
        items: inspectionRunnerForm.items
      });
      return response.data?.inspection;
    },
    onSuccess: async () => {
      const inspectedVehicleId = inspectionRunnerVehicle?.id;
      setInspectionRunnerVehicle(null);
      setInspectionRunnerForm(getInspectionForm(null, activeChecklistTemplateFields));
      setInspectionRunnerError('');
      setToastMessage('Inspection saved');
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles', selectedCsaId] });
      await queryClient.invalidateQueries({ queryKey: ['vehicle-inspections', selectedCsaId] });
      if (inspectedVehicleId) {
        await queryClient.invalidateQueries({ queryKey: ['vehicle-inspection-history', selectedCsaId, inspectedVehicleId] });
      }
    },
    onError: (error) => {
      setInspectionRunnerError(error.response?.data?.error || 'Unable to save inspection.');
    }
  });

  const saveMaintenanceSettingsMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put('/vehicles/settings/maintenance', {
        settings: activeMaintenanceSettings.map((setting) => ({
          ...setting,
          default_interval_miles: setting.default_interval_miles === '' ? null : Number(setting.default_interval_miles),
          default_interval_days: setting.default_interval_days === '' ? null : Number(setting.default_interval_days),
          notes: setting.notes?.trim() || null
        }))
      });
      return response.data;
    },
    onSuccess: async (data) => {
      setMaintenanceSettingsDraft(
        (data.settings || []).map(normalizeMaintenanceSettingForDraft)
      );
      setMaintenanceSettingsEditingIndex(null);
      setIsMaintenanceProgramExpanded(false);
      setToastMessage('Maintenance program updated');
      await queryClient.invalidateQueries({ queryKey: ['vehicle-maintenance-settings', selectedCsaId] });
    }
  });

  const saveMaintenanceRequirementsMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put('/vehicles/settings/maintenance-requirements', activeMaintenanceRequirementsDraft);
      return normalizeMaintenanceRequirementSetting(response.data?.setting);
    },
    onSuccess: async (setting) => {
      setMaintenanceRequirementsDraft(setting);
      setReminderScheduleDraft(normalizeReminderSchedule(setting));
      setMaintenanceRequirementsError('');
      setToastMessage('Maintenance requirements saved');
      queryClient.setQueryData(['vehicle-maintenance-requirements', selectedCsaId], setting);
      queryClient.setQueryData(['vehicle-reminder-schedule', selectedCsaId], normalizeReminderSchedule(setting));
      await queryClient.invalidateQueries({ queryKey: ['vehicle-maintenance-requirements', selectedCsaId] });
      await queryClient.invalidateQueries({ queryKey: ['vehicle-reminder-schedule', selectedCsaId] });
    },
    onError: (error) => {
      setMaintenanceRequirementsError(error.response?.data?.error || 'Unable to save maintenance requirements.');
    }
  });

  const saveChecklistTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put('/vehicles/settings/checklist-template', {
        fields: activeChecklistTemplateFields
      });
      return normalizeChecklistTemplateFields(response.data?.template?.fields);
    },
    onSuccess: async (fields) => {
      setChecklistTemplateDraft(fields);
      setChecklistTemplateError('');
      setToastMessage('Checklist template saved');
      queryClient.setQueryData(['vehicle-checklist-template', selectedCsaId], fields);
      await queryClient.invalidateQueries({ queryKey: ['vehicle-checklist-template', selectedCsaId] });
    },
    onError: (error) => {
      setChecklistTemplateError(error.response?.data?.error || 'Unable to save checklist template.');
    }
  });

  const saveReminderScheduleMutation = useMutation({
    mutationFn: async () => {
      const response = await api.put('/vehicles/settings/reminder-schedule', {
        weekly_inspection_day: activeReminderScheduleDraft.weekly_inspection_day,
        maintenance_warning_miles: Number(activeReminderScheduleDraft.maintenance_warning_miles),
        maintenance_warning_days: Number(activeReminderScheduleDraft.maintenance_warning_days),
        document_warning_days: Number(activeReminderScheduleDraft.document_warning_days)
      });
      return normalizeReminderSchedule(response.data?.schedule);
    },
    onSuccess: async (schedule) => {
      setReminderScheduleDraft(schedule);
      setReminderScheduleError('');
      setMaintenanceRequirementsDraft((current) => normalizeMaintenanceRequirementSetting({
        ...(current || activeMaintenanceRequirementsDraft),
        weekly_inspection_day: schedule.weekly_inspection_day,
        maintenance_warning_miles: schedule.maintenance_warning_miles,
        maintenance_warning_days: schedule.maintenance_warning_days,
        document_warning_days: schedule.document_warning_days
      }));
      setToastMessage('Reminder schedule saved');
      queryClient.setQueryData(['vehicle-reminder-schedule', selectedCsaId], schedule);
      await queryClient.invalidateQueries({ queryKey: ['vehicle-reminder-schedule', selectedCsaId] });
      await queryClient.invalidateQueries({ queryKey: ['vehicle-maintenance-requirements', selectedCsaId] });
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicles', selectedCsaId] });
    },
    onError: (error) => {
      setReminderScheduleError(error.response?.data?.error || 'Unable to save reminder schedule.');
    }
  });

  const vehicles = useMemo(() => vehiclesQuery.data || [], [vehiclesQuery.data]);
  const normalizedMaintenanceSettings = useMemo(
    () =>
      (maintenanceSettingsQuery.data || []).map((setting) => ({
        ...normalizeMaintenanceSettingForDraft(setting)
      })),
    [maintenanceSettingsQuery.data]
  );
  const activeMaintenanceSettings = maintenanceSettingsDraft || normalizedMaintenanceSettings;
  const activeMaintenanceRequirementsDraft = maintenanceRequirementsDraft
    || normalizeMaintenanceRequirementSetting(maintenanceRequirementsQuery.data);
  const activeChecklistTemplateFields = checklistTemplateDraft
    || normalizeChecklistTemplateFields(checklistTemplateQuery.data);
  const activeReminderScheduleDraft = reminderScheduleDraft
    || normalizeReminderSchedule(reminderScheduleQuery.data || activeMaintenanceRequirementsDraft);
  const serviceTypeOptions = useMemo(
    () => getServiceTypeOptions(activeMaintenanceSettings),
    [activeMaintenanceSettings]
  );
  const latestVehicleMaintenanceRecords = useMemo(
    () => vehicles
      .filter((vehicle) => vehicle.latest_maintenance)
      .map((vehicle) => ({
        ...vehicle.latest_maintenance,
        id: vehicle.latest_maintenance.id || `${vehicle.id}-latest-maintenance`,
        vehicle
      })),
    [vehicles]
  );
  const maintenanceRecords = maintenanceRecordsQuery.data?.length
    ? maintenanceRecordsQuery.data
    : latestVehicleMaintenanceRecords;
  const filteredMaintenanceRecords = useMemo(
    () => filterMaintenanceRecords(maintenanceRecords, maintenanceRecordFilters),
    [maintenanceRecordFilters, maintenanceRecords]
  );
  const filteredInspections = useMemo(
    () => filterInspectionRows(inspectionsQuery.data || [], inspectionStatusFilter),
    [inspectionStatusFilter, inspectionsQuery.data]
  );
  const readinessCounts = useMemo(
    () => vehicles.reduce((counts, vehicle) => {
      const status = getReadinessMeta(vehicle).filter;
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, { ready: 0, assigned: 0, maintenance_soon: 0, blocked: 0 }),
    [vehicles]
  );
  const dueSoonVehicles = useMemo(
    () => vehicles.filter((vehicle) => getReadinessMeta(vehicle).filter === 'maintenance_soon'),
    [vehicles]
  );
  const blockedVehicles = useMemo(
    () => vehicles.filter((vehicle) => getReadinessMeta(vehicle).filter === 'blocked'),
    [vehicles]
  );
  const registrationAttentionVehicles = useMemo(
    () => vehicles.filter((vehicle) => needsRegistrationAttention(
      vehicle,
      Number(activeReminderScheduleDraft.document_warning_days)
    )),
    [activeReminderScheduleDraft.document_warning_days, vehicles]
  );
  const onRoadCount = useMemo(
    () => vehicles.filter((vehicle) => vehicle.today_assignment?.route_status === 'in_progress').length,
    [vehicles]
  );
  const filteredVehicles = useMemo(() => {
    const query = vehicleSearch.trim().toLowerCase();

    return vehicles.filter((vehicle) => {
      const status = getReadinessMeta(vehicle).filter;
      const statusMatches = vehicleStatusFilter === 'all' || status === vehicleStatusFilter;
      const searchableText = [
        vehicle.name,
        getVehicleDescription(vehicle),
        getVehicleTypeLabel(vehicle),
        vehicle.plate,
        getAssignedToLabel(vehicle),
        getLatestIssueLabel(vehicle, Number(activeReminderScheduleDraft.document_warning_days)).label,
        getLatestIssueLabel(vehicle, Number(activeReminderScheduleDraft.document_warning_days)).detail
      ].filter(Boolean).join(' ').toLowerCase();

      return statusMatches && (!query || searchableText.includes(query));
    });
  }, [activeReminderScheduleDraft.document_warning_days, vehicleSearch, vehicleStatusFilter, vehicles]);
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

  function updateVehicleField(field, value) {
    setVehicleForm((current) => {
      if (field === 'truck_type' && value !== 'Other') {
        return { ...current, truck_type: value, custom_truck_type: '' };
      }

      return { ...current, [field]: value };
    });
  }

  function handleVehicleImportChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    importVehiclesMutation.mutate(file);
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

  function openOdometerEditor(vehicle) {
    setOdometerVehicle(vehicle);
    setOdometerForm({
      odometer_reading: vehicle.current_mileage === null || vehicle.current_mileage === undefined
        ? ''
        : String(vehicle.current_mileage),
      notes: '',
      confirmedLower: false
    });
    setOdometerError('');
  }

  function updateOdometerField(field, value) {
    setOdometerForm((current) => ({
      ...current,
      [field]: field === 'odometer_reading' ? value.replace(/\D/g, '') : value,
      confirmedLower: field === 'odometer_reading' ? false : current.confirmedLower
    }));
  }

  function handleSaveOdometer(event) {
    event.preventDefault();
    setOdometerError('');

    if (!odometerVehicle) {
      return;
    }

    if (odometerForm.odometer_reading === '') {
      setOdometerError('New odometer reading is required.');
      return;
    }

    const nextMileage = Number(odometerForm.odometer_reading);

    if (!Number.isInteger(nextMileage) || nextMileage < 0) {
      setOdometerError('Enter a valid odometer reading.');
      return;
    }

    const currentMileage = Number(odometerVehicle.current_mileage || 0);
    if (nextMileage < currentMileage && !odometerForm.confirmedLower) {
      setOdometerError('Confirm the lower odometer correction before saving.');
      return;
    }

    updateOdometerMutation.mutate();
  }

  function updateMaintenanceSetting(index, field, value) {
    setMaintenanceSettingsDraft((current) =>
      (current || activeMaintenanceSettings).map((setting, settingIndex) =>
        settingIndex === index ? { ...setting, [field]: value } : setting
      )
    );
  }

  function updateMaintenanceRecordFilter(field, value) {
    setMaintenanceRecordFilters((current) => ({
      ...current,
      [field]: value
    }));
  }

  function openMaintenanceItemEditor(index = null) {
    const setting = index === null ? null : activeMaintenanceSettings[index];

    setMaintenanceItemError('');
    setMaintenanceItemEditor({
      mode: index === null ? 'add' : 'edit',
      index,
      form: setting
        ? {
            service_type: setting.service_type || '',
            default_interval_miles: setting.default_interval_miles ?? '',
            default_interval_days: setting.default_interval_days ?? '',
            notes: setting.notes || ''
          }
        : { ...emptyMaintenanceItemForm }
    });
  }

  function updateMaintenanceItemEditorField(field, value) {
    setMaintenanceItemEditor((current) => (
      current
        ? {
            ...current,
            form: {
              ...current.form,
              [field]: value
            }
          }
        : current
    ));
  }

  function validateMaintenanceItemForm(form, editingIndex) {
    const name = form.service_type.trim();
    const intervalMiles = form.default_interval_miles;
    const intervalDays = form.default_interval_days;
    const notes = form.notes.trim();

    if (!name) {
      return 'Item name is required.';
    }

    const duplicateIndex = activeMaintenanceSettings.findIndex((setting, index) => (
      index !== editingIndex && setting.service_type.trim().toLowerCase() === name.toLowerCase()
    ));

    if (duplicateIndex >= 0) {
      return 'A maintenance item with this name already exists.';
    }

    if (!intervalMiles && !intervalDays && !notes && !['General Repair', 'Other'].includes(name)) {
      return 'Add a mileage interval, days interval, or notes for a general note item.';
    }

    return '';
  }

  function handleSaveMaintenanceItem(event) {
    event.preventDefault();

    if (!maintenanceItemEditor) {
      return;
    }

    const form = maintenanceItemEditor.form;
    const validationError = validateMaintenanceItemForm(form, maintenanceItemEditor.index);

    if (validationError) {
      setMaintenanceItemError(validationError);
      return;
    }

    const nextItem = {
      service_type: form.service_type.trim(),
      is_enabled: true,
      default_interval_miles: form.default_interval_miles,
      default_interval_days: form.default_interval_days,
      notes: form.notes.trim()
    };

    setMaintenanceSettingsDraft((current) => {
      const base = current || activeMaintenanceSettings;

      if (maintenanceItemEditor.mode === 'edit' && maintenanceItemEditor.index !== null) {
        return base.map((setting, index) => (
          index === maintenanceItemEditor.index
            ? {
                ...setting,
                ...nextItem,
                is_enabled: setting.is_enabled
              }
            : setting
        ));
      }

      return [...base, nextItem];
    });

    setMaintenanceItemEditor(null);
    setMaintenanceItemError('');
    setMaintenanceSettingsEditingIndex(null);
  }

  function updateMaintenanceRequirementsMode(mode) {
    setMaintenanceRequirementsDraft((current) => ({
      ...normalizeMaintenanceRequirementSetting(current || activeMaintenanceRequirementsDraft),
      maintenance_requirement_mode: mode
    }));
    setMaintenanceRequirementsError('');
  }

  function updateMaintenanceRequirementsWeeklyDay(day) {
    setMaintenanceRequirementsDraft((current) => ({
      ...normalizeMaintenanceRequirementSetting(current || activeMaintenanceRequirementsDraft),
      weekly_inspection_day: day
    }));
    setMaintenanceRequirementsError('');
  }

  function updateCustomDailyRequirement(field, value) {
    setMaintenanceRequirementsDraft((current) => {
      const normalized = normalizeMaintenanceRequirementSetting(current || activeMaintenanceRequirementsDraft);
      return {
        ...normalized,
        custom_daily_requirements: {
          ...normalized.custom_daily_requirements,
          [field]: value
        }
      };
    });
    setMaintenanceRequirementsError('');
  }

  function updateCustomWeeklyRequirement(field, value) {
    setMaintenanceRequirementsDraft((current) => {
      const normalized = normalizeMaintenanceRequirementSetting(current || activeMaintenanceRequirementsDraft);
      return {
        ...normalized,
        custom_weekly_requirements: {
          ...normalized.custom_weekly_requirements,
          [field]: value
        }
      };
    });
    setMaintenanceRequirementsError('');
  }

  function updateChecklistTemplateField(fieldId, enabled) {
    setChecklistTemplateDraft((current) =>
      normalizeChecklistTemplateFields(current || activeChecklistTemplateFields).map((field) => (
        field.id === fieldId ? { ...field, enabled } : field
      ))
    );
    setChecklistTemplateError('');
  }

  function updateReminderScheduleField(field, value) {
    setReminderScheduleDraft((current) => ({
      ...normalizeReminderSchedule(current || activeReminderScheduleDraft),
      [field]: value
    }));

    if (field === 'weekly_inspection_day') {
      setMaintenanceRequirementsDraft((current) => ({
        ...normalizeMaintenanceRequirementSetting(current || activeMaintenanceRequirementsDraft),
        weekly_inspection_day: value
      }));
    }

    setReminderScheduleError('');
  }

  function deleteMaintenanceItem(index) {
    setMaintenanceSettingsDraft((current) => (
      (current || activeMaintenanceSettings).filter((_, settingIndex) => settingIndex !== index)
    ));
    setMaintenanceSettingsEditingIndex(null);
  }

  function openInspectionRunner(vehicle) {
    setInspectionRunnerVehicle(vehicle);
    setInspectionRunnerForm(getInspectionForm(vehicle, activeChecklistTemplateFields));
    setInspectionRunnerError('');
  }

  function updateInspectionRunnerField(field, value) {
    setInspectionRunnerForm((current) => ({
      ...current,
      [field]: value
    }));
    setInspectionRunnerError('');
  }

  function updateInspectionRunnerStatus(checklistItemKey, status) {
    setInspectionRunnerForm((current) => ({
      ...current,
      items: (current.items || []).map((item) => (
        item.checklist_item_key === checklistItemKey
          ? { ...item, status }
          : item
      ))
    }));
    setInspectionRunnerError('');
  }

  function handleCreateInspection(event) {
    event.preventDefault();
    setInspectionRunnerError('');

    if (!inspectionRunnerVehicle) {
      setInspectionRunnerError('Choose a vehicle before saving an inspection.');
      return;
    }

    if (!inspectionRunnerForm.inspection_date || !inspectionRunnerForm.odometer) {
      setInspectionRunnerError('Inspection date and odometer are required.');
      return;
    }

    if (!inspectionRunnerForm.items?.length) {
      setInspectionRunnerError('No inspection checklist items are enabled.');
      return;
    }

    createInspectionMutation.mutate();
  }

  function handleCreateVehicle(event) {
    event.preventDefault();
    setVehicleError('');

    if (!vehicleForm.plate || !vehicleForm.make || !vehicleForm.model || !vehicleForm.year) {
      setVehicleError('Vehicle ID, make, model, and year are required.');
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
      fuel_type: vehicle.fuel_type || '',
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year ? String(vehicle.year) : '',
      plate: vehicle.plate || vehicle.name || '',
      registration_expiration: vehicle.registration_expiration || '',
      insurance_expiration: vehicle.insurance_expiration || '',
      vehicle_status: vehicle.vehicle_status || (vehicle.is_active === false ? 'out_of_service' : 'active'),
      current_mileage: String(vehicle.current_mileage || 0),
      notes: vehicle.notes || ''
    });
  }

  function handleEditVehicle(event) {
    event.preventDefault();
    setEditVehicleError('');

    if (!editVehicleForm.plate || !editVehicleForm.make || !editVehicleForm.model || !editVehicleForm.year) {
      setEditVehicleError('Vehicle ID, make, model, and year are required.');
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

    if (!maintenanceForm.service_date || !maintenanceForm.service_type || !maintenanceForm.mileage_at_service) {
      setMaintenanceError('Service date, maintenance item, and service odometer reading are required.');
      return;
    }

    createMaintenanceMutation.mutate();
  }

  function openMaintenanceFromInspection(inspection) {
    const vehicle = inspection?.vehicle;
    if (!vehicle?.id) {
      setToastMessage('Inspection is missing a Truck record.');
      return;
    }

    const prefill = buildInspectionMaintenancePrefill(inspection);
    const maintenanceVehicleFromInspection = {
      ...vehicle,
      current_mileage: inspection.odometer || vehicle.current_mileage || ''
    };
    const nextForm = buildMaintenanceForm({
      vehicle: maintenanceVehicleFromInspection,
      settings: activeMaintenanceSettings,
      serviceType: prefill.serviceType,
      mileageAtService: prefill.mileageAtService || undefined
    });

    setMaintenanceVehicle(maintenanceVehicleFromInspection);
    setMaintenanceForm({
      ...nextForm,
      description: prefill.description,
      condition_notes: prefill.conditionNotes
    });
    setMaintenanceError('');
    setSelectedInspection(null);
    setInspectionReviewNote('');
  }

  function scrollToDueVehicle() {
    if (!dueSoonVehicles.length) {
      return;
    }

    const element = document.getElementById(`vehicle-card-${dueSoonVehicles[0].id}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="page-section vehicles-page">
      <PageHeader
        title="Vehicles"
        description={`${vehicles.length} vehicles, ${onRoadCount} on road today`}
        actions={(
          <>
            {activeVehiclesTab === 'Fleet' ? (
              <>
                <button
                  className="secondary-button"
                  disabled={importVehiclesMutation.isPending}
                  onClick={() => vehicleImportInputRef.current?.click()}
                  type="button"
                >
                  {importVehiclesMutation.isPending ? 'Importing...' : 'Import Vehicles'}
                </button>
                <button className="primary-cta manifest-button" onClick={() => setIsVehicleModalOpen(true)} type="button">
                  Add Vehicle
                </button>
              </>
            ) : null}
            <input
              accept=".csv,.xls,.xlsx"
              hidden
              onChange={handleVehicleImportChange}
              ref={vehicleImportInputRef}
              type="file"
            />
          </>
        )}
      />

      <VehicleTabs
        activeTab={activeVehiclesTab}
        onChange={(tab) => {
          setActiveVehiclesTab(tab);
          if (tab !== 'Settings') {
            setVehicleSettingsView('overview');
            setMaintenanceSettingsEditingIndex(null);
            setIsMaintenanceProgramExpanded(false);
          }
          if (tab !== 'Inspections') {
            setSelectedInspection(null);
            setInspectionReviewNote('');
          }
        }}
      />

      {activeVehiclesTab === 'Fleet' && setupBanner ? (
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

      {activeVehiclesTab === 'Fleet' && dueSoonVehicles.length ? (
        <div className="service-due-banner">
          <div>
            <strong>{dueSoonVehicles.length} vehicle(s) need maintenance soon</strong>
            <div>{dueSoonVehicles.map((vehicle) => vehicle.name).join(', ')}</div>
          </div>
          <button className="banner-link-button" onClick={scrollToDueVehicle} type="button">View</button>
        </div>
      ) : null}

      {activeVehiclesTab === 'Fleet' && blockedVehicles.length ? (
        <div className="service-due-banner vehicle-blocked-banner">
          <div>
            <strong>{blockedVehicles.length} vehicle(s) blocked from readiness</strong>
            <div>{blockedVehicles.map((vehicle) => vehicle.name).join(', ')}</div>
          </div>
        </div>
      ) : null}

      {activeVehiclesTab === 'Fleet' && registrationAttentionVehicles.length ? (
        <div className="service-due-banner registration-due-banner">
          <div>
            <strong>{registrationAttentionVehicles.length} vehicle(s) need registration attention</strong>
            <div>{registrationAttentionVehicles.map((vehicle) => vehicle.name).join(', ')}</div>
          </div>
        </div>
      ) : null}

      {toastMessage ? <div className="success-banner">{toastMessage}</div> : null}

      {activeVehiclesTab === 'Fleet' ? (
        <>
          <div className="vehicles-stat-grid">
            <StatCard label="Ready" value={readinessCounts.ready || 0} detail="No active warnings" tone="active" />
            <StatCard label="Assigned" value={readinessCounts.assigned || 0} detail="Driver or route today" tone="purple" />
            <StatCard
              label="Maintenance Soon"
              value={readinessCounts.maintenance_soon || 0}
              detail={`Within ${formatMileage(activeReminderScheduleDraft.maintenance_warning_miles)} mi or ${activeReminderScheduleDraft.maintenance_warning_days} days`}
              tone="warning"
            />
            <StatCard label="Blocked" value={readinessCounts.blocked || 0} detail="Overdue or expired" tone="urgent" />
          </div>

          {vehiclesQuery.isLoading ? (
        <div className="card vehicles-table-card">
          <div className="vehicles-table-toolbar">
            <div>
              <div className="card-title">Fleet Inventory</div>
              <div className="driver-meta">Vehicle records, availability, mileage, and registration status.</div>
            </div>
          </div>
          <div className="vehicles-table">
            <div className="vehicles-table-header">
              <span>Vehicle ID</span>
              <span>Status</span>
              <span>Driver / Route</span>
              <span>Odometer</span>
              <span>Next Service</span>
              <span>Registration</span>
              <span>Latest Issue</span>
              <span>Actions</span>
            </div>
            {[0, 1, 2].map((value) => (
              <div className="vehicles-table-row" key={value}>
                {Array.from({ length: 8 }).map((_, index) => (
                  <div className="skeleton-line skeleton-label" key={index} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card vehicles-table-card">
          <div className="vehicles-table-toolbar">
            <div>
              <div className="card-title">Fleet Inventory</div>
              <div className="driver-meta">Vehicle records, availability, mileage, and registration status.</div>
            </div>
            <div className="vehicles-table-toolbar-actions">
              <input
                className="text-field"
                onChange={(event) => setVehicleSearch(event.target.value)}
                placeholder="Search vehicles by ID or description"
                type="search"
                value={vehicleSearch}
              />
              <select
                className="text-field vehicles-status-filter"
                onChange={(event) => setVehicleStatusFilter(event.target.value)}
                value={vehicleStatusFilter}
              >
                <option value="all">All Statuses</option>
                <option value="ready">Ready</option>
                <option value="assigned">Assigned</option>
                <option value="maintenance_soon">Maintenance Soon</option>
                <option value="blocked">Blocked</option>
              </select>
              <span className="driver-meta">{filteredVehicles.length} vehicle{filteredVehicles.length === 1 ? '' : 's'}</span>
            </div>
          </div>

          {vehicles.length ? (
            <>
              <div className="vehicles-table">
                <div className="vehicles-table-header">
                  <span>Vehicle ID</span>
                  <span>Status</span>
                  <span>Driver / Route</span>
                  <span>Odometer</span>
                  <span>Next Service</span>
                  <span>Registration</span>
                  <span>Latest Issue</span>
                  <span>Actions</span>
                </div>
                {filteredVehicles.map((vehicle) => {
                  const statusMeta = getReadinessMeta(vehicle);
                  const maintenanceAlert = getNextServiceLabel(vehicle);
                  const registration = getRegistrationStatus(vehicle, Number(activeReminderScheduleDraft.document_warning_days));
                  const insurance = getExpirationStatus(
                    vehicle.insurance_expiration,
                    'Insurance',
                    Number(activeReminderScheduleDraft.document_warning_days)
                  );
                  const latestIssue = getLatestIssueLabel(vehicle, Number(activeReminderScheduleDraft.document_warning_days));
                  const hasTruckType = Boolean(vehicle.truck_type || vehicle.custom_truck_type);
                  const vehicleStatusValue = getVehicleStatusValue(vehicle);
                  const vehicleStatusTone = VEHICLE_STATUS_TONES[vehicleStatusValue] || 'ready';

                  return (
                    <div
                      className={`vehicles-table-row ${statusMeta.rowClassName}`}
                      id={`vehicle-card-${vehicle.id}`}
                      key={vehicle.id}
                      onClick={() => openEditVehicle(vehicle)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openEditVehicle(vehicle);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="vehicles-table-primary">
                        <strong>{vehicle.name}</strong>
                        <span>{getVehicleDescription(vehicle)}</span>
                        <span>{hasTruckType ? getVehicleTypeLabel(vehicle) : 'Truck type missing'}</span>
                      </div>
                      <div className="vehicle-status-select-wrap" onClick={(event) => event.stopPropagation()}>
                        <select
                          aria-label={`Vehicle status for Truck ${vehicle.name}`}
                          className={`vehicle-status-select vehicle-status-badge ${vehicleStatusTone}`}
                          disabled={updateVehicleStatusMutation.isPending}
                          onChange={(event) => {
                            event.stopPropagation();
                            updateVehicleStatusMutation.mutate({
                              vehicleId: vehicle.id,
                              vehicleStatus: event.target.value
                            });
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                          value={vehicleStatusValue}
                        >
                          {VEHICLE_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {statusMeta.filter !== 'ready' ? (
                          <span className="vehicle-readiness-note">{statusMeta.label}</span>
                        ) : null}
                      </div>
                      <div className="vehicles-table-primary">
                        <strong>{getAssignedToLabel(vehicle)}</strong>
                        <span>{vehicle.today_assignment?.work_area_name ? `Route ${vehicle.today_assignment.work_area_name}` : 'No route today'}</span>
                      </div>
                      <div className="vehicles-mileage-cell">
                        <strong>{formatMileage(vehicle.current_mileage)} miles</strong>
                      </div>
                      <div className="vehicles-table-primary">
                        <strong>{maintenanceAlert.itemLabel}</strong>
                        <span>{maintenanceAlert.detailLabel}</span>
                      </div>
                      <div className="vehicles-table-primary">
                        <strong>{registration.label}</strong>
                        <span>{insurance.label}</span>
                      </div>
                      <div className="vehicles-table-primary">
                        <strong>{latestIssue.label}</strong>
                        <span>{latestIssue.detail}</span>
                      </div>
                      <div className="vehicles-table-actions">
                        <button
                          aria-label={`Edit odometer for vehicle ${vehicle.name}`}
                          className="secondary-inline-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openOdometerEditor(vehicle);
                          }}
                          type="button"
                        >
                          Odometer
                        </button>
                        <button
                          className="secondary-inline-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditVehicle(vehicle);
                          }}
                          type="button"
                        >
                          Edit
                        </button>
                        {statusMeta.filter === 'maintenance_soon' ? (
                          <button
                            className="primary-inline-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setHistoryVehicle(vehicle);
                            }}
                            type="button"
                          >
                            Review
                          </button>
                        ) : null}
                        {statusMeta.filter === 'blocked' ? (
                          <button
                            className="primary-inline-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMaintenanceVehicle(vehicle);
                              setMaintenanceForm(buildMaintenanceForm({ vehicle, settings: activeMaintenanceSettings }));
                              setMaintenanceError('');
                            }}
                            type="button"
                          >
                            Fix
                          </button>
                        ) : null}
                        <details className="vehicles-row-menu" onClick={(event) => event.stopPropagation()}>
                          <summary aria-label={`More actions for Truck ${vehicle.name}`} title={`More actions for Truck ${vehicle.name}`}>
                            <span aria-hidden="true">•••</span>
                            <span className="sr-only">More actions for Truck {vehicle.name}</span>
                          </summary>
                          <div className="vehicles-row-menu-panel">
                            <button onClick={() => openEditVehicle(vehicle)} type="button">
                              View Details
                            </button>
                            <button onClick={() => openOdometerEditor(vehicle)} type="button">
                              Edit Odometer
                            </button>
                            <button
                              onClick={() => {
                                setMaintenanceVehicle(vehicle);
                                setMaintenanceForm(buildMaintenanceForm({ vehicle, settings: activeMaintenanceSettings }));
                                setMaintenanceError('');
                              }}
                              type="button"
                            >
                              Log Maintenance
                            </button>
                            <button onClick={() => setHistoryVehicle(vehicle)} type="button">
                              View Maintenance History
                            </button>
                          </div>
                        </details>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!filteredVehicles.length ? (
                <div className="labor-empty-state">No vehicles match the current search or status filter.</div>
              ) : null}
              <div className="maintenance-alert-legend">
                <span><strong>OK:</strong> Outside reminder windows</span>
                <span><strong>Due Soon:</strong> Within {formatMileage(activeReminderScheduleDraft.maintenance_warning_miles)} miles or {activeReminderScheduleDraft.maintenance_warning_days} days</span>
                <span><strong>Overdue:</strong> Service interval exceeded</span>
              </div>
            </>
          ) : (
            <div className="labor-empty-state">No vehicles are in this fleet yet.</div>
          )}
        </div>
          )}
        </>
      ) : null}

      {activeVehiclesTab === 'Maintenance' ? (
        <MaintenanceRecordsPanel
          filters={maintenanceRecordFilters}
          isLoading={maintenanceRecordsQuery.isLoading && !latestVehicleMaintenanceRecords.length}
          onChangeFilters={updateMaintenanceRecordFilter}
          onClearFilters={() => setMaintenanceRecordFilters(emptyMaintenanceRecordFilters)}
          onExportCsv={() => downloadCsv(
            `readyroute-maintenance-records-${getTodayString()}.csv`,
            buildMaintenanceRecordsCsvRows(filteredMaintenanceRecords)
          )}
          onViewHistory={setHistoryVehicle}
          records={filteredMaintenanceRecords}
          serviceTypeOptions={serviceTypeOptions}
          totalRecords={maintenanceRecords.length}
        />
      ) : null}

      {activeVehiclesTab === 'Inspections' ? (
        <InspectionsPanel
          inspections={filteredInspections}
          isLoading={inspectionsQuery.isLoading}
          onExportCsv={() => downloadCsv(
            `readyroute-vehicle-inspections-${getTodayString()}.csv`,
            buildInspectionCsvRows(filteredInspections)
          )}
          onOpenInspection={(inspection) => {
            setSelectedInspection(inspection);
            setInspectionReviewNote(inspection.manager_review_note || '');
          }}
          onStatusFilterChange={setInspectionStatusFilter}
          statusFilter={inspectionStatusFilter}
        />
      ) : null}

      {activeVehiclesTab === 'Settings' && vehicleSettingsView === 'overview' ? (
        <>
          <MaintenanceSettingsCard
            draft={activeMaintenanceSettings}
            editingIndex={maintenanceSettingsEditingIndex}
            isExpanded={isMaintenanceProgramExpanded}
            isLoading={maintenanceSettingsQuery.isLoading}
            isSaving={saveMaintenanceSettingsMutation.isPending}
            onAddItem={() => openMaintenanceItemEditor()}
            onChange={updateMaintenanceSetting}
            onCollapse={() => {
              setMaintenanceSettingsEditingIndex(null);
              setIsMaintenanceProgramExpanded(false);
            }}
            onDeleteItem={deleteMaintenanceItem}
            onEditInline={setMaintenanceSettingsEditingIndex}
            onEditItem={openMaintenanceItemEditor}
            onExpand={() => setIsMaintenanceProgramExpanded(true)}
            onSave={() => saveMaintenanceSettingsMutation.mutate()}
          />
          <VehicleSettingsPanel
            maintenanceRequirements={activeMaintenanceRequirementsDraft}
            onOpenChecklistTemplate={() => setVehicleSettingsView('checklist-template')}
            onOpenMaintenanceRequirements={() => setVehicleSettingsView('maintenance-requirements')}
            onOpenReminderSchedule={() => setVehicleSettingsView('reminder-schedule')}
            reminderSchedule={activeReminderScheduleDraft}
          />
        </>
      ) : null}

      {activeVehiclesTab === 'Settings' && vehicleSettingsView === 'maintenance-requirements' ? (
        <MaintenanceRequirementsScreen
          draft={activeMaintenanceRequirementsDraft}
          errorMessage={maintenanceRequirementsError}
          isLoading={maintenanceRequirementsQuery.isLoading}
          isSaving={saveMaintenanceRequirementsMutation.isPending}
          onBack={() => setVehicleSettingsView('overview')}
          onChangeCustomDaily={updateCustomDailyRequirement}
          onChangeCustomWeekly={updateCustomWeeklyRequirement}
          onChangeMode={updateMaintenanceRequirementsMode}
          onChangeWeeklyDay={updateMaintenanceRequirementsWeeklyDay}
          onSave={() => saveMaintenanceRequirementsMutation.mutate()}
        />
      ) : null}

      {activeVehiclesTab === 'Settings' && vehicleSettingsView === 'checklist-template' ? (
        <ChecklistTemplateScreen
          errorMessage={checklistTemplateError}
          fields={activeChecklistTemplateFields}
          isLoading={checklistTemplateQuery.isLoading}
          isSaving={saveChecklistTemplateMutation.isPending}
          onBack={() => setVehicleSettingsView('overview')}
          onSave={() => saveChecklistTemplateMutation.mutate()}
          onToggleField={updateChecklistTemplateField}
        />
      ) : null}

      {activeVehiclesTab === 'Settings' && vehicleSettingsView === 'reminder-schedule' ? (
        <ReminderScheduleScreen
          draft={activeReminderScheduleDraft}
          errorMessage={reminderScheduleError}
          isLoading={reminderScheduleQuery.isLoading}
          isSaving={saveReminderScheduleMutation.isPending}
          onBack={() => setVehicleSettingsView('overview')}
          onChange={updateReminderScheduleField}
          onSave={() => saveReminderScheduleMutation.mutate()}
        />
      ) : null}

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
        <VehicleDetailsDrawer
          errorMessage={editVehicleError}
          form={editVehicleForm}
          isSubmitting={updateVehicleMutation.isPending}
          onAddService={() => {
            setMaintenanceVehicle(editingVehicle);
            setMaintenanceForm(buildMaintenanceForm({ vehicle: editingVehicle, settings: activeMaintenanceSettings }));
            setMaintenanceError('');
            setEditingVehicle(null);
          }}
          onChange={updateEditVehicleField}
          onClose={() => setEditingVehicle(null)}
          onRunInspection={() => {
            openInspectionRunner(editingVehicle);
            setEditingVehicle(null);
          }}
          onViewAssignmentHistory={() => {
            setAssignmentHistoryVehicle(editingVehicle);
            setEditingVehicle(null);
          }}
          onSubmit={handleEditVehicle}
          onViewHistory={() => {
            setHistoryVehicle(editingVehicle);
            setEditingVehicle(null);
          }}
          onViewInspectionHistory={() => {
            setInspectionHistoryVehicle(editingVehicle);
            setEditingVehicle(null);
          }}
          onViewOdometerHistory={() => {
            setOdometerHistoryVehicle(editingVehicle);
            setEditingVehicle(null);
          }}
          vehicle={editingVehicle}
        />
      ) : null}

      <InspectionRunnerModal
        errorMessage={inspectionRunnerError}
        form={inspectionRunnerForm}
        isSubmitting={createInspectionMutation.isPending}
        onChange={updateInspectionRunnerField}
        onChangeStatus={updateInspectionRunnerStatus}
        onClose={() => {
          setInspectionRunnerVehicle(null);
          setInspectionRunnerForm(getInspectionForm(null, activeChecklistTemplateFields));
          setInspectionRunnerError('');
        }}
        onSubmit={handleCreateInspection}
        vehicle={inspectionRunnerVehicle}
      />

      {maintenanceVehicle ? (
        <MaintenanceModal
          errorMessage={maintenanceError}
          form={maintenanceForm}
          isSubmitting={createMaintenanceMutation.isPending}
          onChange={updateMaintenanceField}
          onClose={() => setMaintenanceVehicle(null)}
          onSubmit={handleCreateMaintenance}
          serviceTypeOptions={serviceTypeOptions}
          vehicle={maintenanceVehicle}
        />
      ) : null}

      <MaintenanceItemModal
        errorMessage={maintenanceItemError}
        form={maintenanceItemEditor?.form || emptyMaintenanceItemForm}
        isOpen={Boolean(maintenanceItemEditor)}
        mode={maintenanceItemEditor?.mode || 'add'}
        onChange={updateMaintenanceItemEditorField}
        onClose={() => {
          setMaintenanceItemEditor(null);
          setMaintenanceItemError('');
        }}
        onSubmit={handleSaveMaintenanceItem}
      />

      <OdometerModal
        errorMessage={odometerError}
        form={odometerForm}
        isSaving={updateOdometerMutation.isPending}
        onChange={updateOdometerField}
        onClose={() => {
          setOdometerVehicle(null);
          setOdometerForm(emptyOdometerForm);
          setOdometerError('');
        }}
        onConfirmLower={(confirmedLower) => setOdometerForm((current) => ({ ...current, confirmedLower }))}
        onSubmit={handleSaveOdometer}
        vehicle={odometerVehicle}
      />

      <MaintenanceHistoryModal
        onClose={() => setHistoryVehicle(null)}
        open={Boolean(historyVehicle)}
        selectedCsaId={selectedCsaId}
        vehicle={historyVehicle}
      />

      <InspectionHistoryModal
        onClose={() => setInspectionHistoryVehicle(null)}
        onOpenInspection={(inspection) => {
          setSelectedInspection(inspection);
          setInspectionReviewNote(inspection.manager_review_note || '');
        }}
        open={Boolean(inspectionHistoryVehicle)}
        selectedCsaId={selectedCsaId}
        vehicle={inspectionHistoryVehicle}
      />

      <OdometerHistoryModal
        onClose={() => setOdometerHistoryVehicle(null)}
        open={Boolean(odometerHistoryVehicle)}
        selectedCsaId={selectedCsaId}
        vehicle={odometerHistoryVehicle}
      />

      <AssignmentHistoryModal
        onClose={() => setAssignmentHistoryVehicle(null)}
        open={Boolean(assignmentHistoryVehicle)}
        selectedCsaId={selectedCsaId}
        vehicle={assignmentHistoryVehicle}
      />

      <InspectionDetailModal
        inspection={inspectionDetailQuery.data || selectedInspection}
        isReviewing={reviewInspectionMutation.isPending}
        onChangeReviewNote={setInspectionReviewNote}
        onClose={() => {
          setSelectedInspection(null);
          setInspectionReviewNote('');
        }}
        onLogMaintenanceFromIssue={() => openMaintenanceFromInspection(inspectionDetailQuery.data || selectedInspection)}
        onReview={() => reviewInspectionMutation.mutate()}
        reviewNote={inspectionReviewNote}
      />
    </section>
  );
}
