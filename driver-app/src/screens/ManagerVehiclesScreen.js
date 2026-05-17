import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import ManagerSectionLayout from '../components/ManagerSectionLayout';
import AppButton from '../components/ui/AppButton';
import AppCard from '../components/ui/AppCard';
import ErrorState from '../components/ui/ErrorState';
import RouteMetricIcon from '../components/RouteMetricIcon';
import api from '../services/api';
import appTheme from '../theme/appTheme';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'missing info', label: 'Missing Info' }
];

const VEHICLE_MANAGER_TABS = ['Fleet', 'Maintenance', 'Inspections', 'Settings'];

const WEEKLY_INSPECTION_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DEFAULT_MAINTENANCE_REQUIREMENTS = {
  maintenance_requirement_mode: 'option_1',
  weekly_inspection_day: 'Monday',
  maintenance_warning_miles: 1000,
  maintenance_warning_days: 14,
  document_warning_days: 30,
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

const MAINTENANCE_REQUIREMENT_OPTIONS = [
  {
    id: 'option_1',
    optionLabel: 'Option 1',
    title: 'Daily Odometer + Issue Note',
    badge: 'Recommended',
    badgeTone: 'recommended',
    description: 'Drivers confirm their truck, enter the odometer, and can report vehicle issues noticed that day.',
    dailyRequirements: ['Confirm truck', 'Enter odometer', 'Report any noticed issue'],
    weeklyRequirements: ['Full vehicle inspection on selected weekday']
  },
  {
    id: 'option_2',
    optionLabel: 'Option 2',
    title: 'Daily Odometer + Full Inspection',
    badge: 'Stricter',
    badgeTone: 'stricter',
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

const SERVICE_TYPE_OPTIONS = [
  'Inspection',
  'Oil Change',
  'Air Filter',
  'Brake Pads',
  'General Repair',
  'Other'
];

const DEFAULT_CHECKLIST_TEMPLATE_FIELDS = [
  { id: 'date', label: 'Date', detail: 'Inspection date', enabled: true },
  { id: 'company_name', label: 'Company name', detail: 'CSA or company name', enabled: true },
  { id: 'truck_number', label: 'Truck Number', detail: 'Truck identifier for the inspection', enabled: true },
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

function getTodayDateParam() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function formatDate(value) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return 'Not recorded';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

function formatMileage(value) {
  return `${new Intl.NumberFormat('en-US').format(Number(value || 0))} miles`;
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

function getVehicleDescription(vehicle) {
  const description = [vehicle?.make, vehicle?.model, vehicle?.year].filter(Boolean).join(' ') || 'Description not recorded';
  const vehicleType = [
    vehicle?.custom_truck_type,
    vehicle?.truck_type,
    vehicle?.vehicle_type,
    vehicle?.body_type,
    vehicle?.type
  ].find((value) => typeof value === 'string' && value.trim());

  return vehicleType ? `${description} • ${vehicleType.trim()}` : description;
}

function getRegistrationSummary(vehicle) {
  if (!vehicle?.registration_expiration && !vehicle?.plate) {
    return 'Not recorded';
  }

  const plate = vehicle?.plate || 'Not recorded';
  const expiration = vehicle?.registration_expiration ? formatDate(vehicle.registration_expiration) : '';
  return expiration ? `${plate} • ${expiration}` : plate;
}

function formatInterval(setting) {
  const parts = [];

  if (setting?.default_interval_miles) {
    parts.push(`${new Intl.NumberFormat('en-US').format(Number(setting.default_interval_miles))} mi`);
  }

  if (setting?.default_interval_days) {
    parts.push(`${Number(setting.default_interval_days)} days`);
  }

  return parts.join(' / ') || setting?.notes || 'As needed';
}

function getMaintenanceModeLabel(setting) {
  const mode = setting?.maintenance_requirement_mode || DEFAULT_MAINTENANCE_REQUIREMENTS.maintenance_requirement_mode;
  return MAINTENANCE_REQUIREMENT_OPTIONS.find((option) => option.id === mode)?.title || MAINTENANCE_REQUIREMENT_OPTIONS[0].title;
}

function getRegistrationStatus(vehicle) {
  if (!vehicle?.registration_expiration) {
    return 'Registration not recorded';
  }

  const expirationDate = new Date(`${vehicle.registration_expiration}T12:00:00`);
  if (Number.isNaN(expirationDate.getTime())) {
    return 'Registration not recorded';
  }

  const daysRemaining = Math.ceil((expirationDate.getTime() - Date.now()) / 86400000);

  if (daysRemaining < 0) {
    return `Expired ${formatDate(vehicle.registration_expiration)}`;
  }

  if (daysRemaining <= 30) {
    return `Expires ${formatDate(vehicle.registration_expiration)}`;
  }

  return formatDate(vehicle.registration_expiration);
}

function getStatusMeta(vehicle) {
  const missingInfo = !vehicle?.registration_expiration || !vehicle?.make || !vehicle?.model || !vehicle?.year || !vehicle?.plate;

  if (vehicle?.service_due) {
    return { filterKey: 'maintenance', label: 'Maintenance', tone: 'warning' };
  }

  if (vehicle?.today_assignment?.route_status === 'in_progress') {
    return { filterKey: 'assigned', label: 'On road', tone: 'warning' };
  }

  if (vehicle?.today_assignment) {
    return { filterKey: 'assigned', label: 'Assigned', tone: 'complete' };
  }

  if (missingInfo) {
    return { filterKey: 'missing info', label: 'Missing info', tone: 'neutral' };
  }

  return { filterKey: 'available', label: 'Available', tone: 'active' };
}

function getLastServiceSummary(vehicle) {
  const latest = vehicle?.latest_maintenance || null;
  const date = latest?.service_date || vehicle?.last_service_date || '';
  const detail = latest?.service_type || latest?.condition_notes || latest?.description || vehicle?.notes || '';

  return {
    dateLabel: date ? formatDate(date) : 'Not recorded',
    detailLabel: detail || 'No notes'
  };
}

function getAssignedDriverLabel(vehicle) {
  if (!vehicle?.today_assignment) {
    return 'Not assigned';
  }

  return vehicle.today_assignment.driver_name || 'Assigned';
}

function filterVehicles(vehicles = [], searchTerm = '', statusFilter = 'all') {
  const query = searchTerm.trim().toLowerCase();

  return vehicles.filter((vehicle) => {
    const statusMeta = getStatusMeta(vehicle);
    const statusMatches = statusFilter === 'all' || statusMeta.filterKey === statusFilter;
    const text = [
      vehicle?.name,
      getVehicleDescription(vehicle),
      vehicle?.plate,
      getAssignedDriverLabel(vehicle)
    ].filter(Boolean).join(' ').toLowerCase();

    return statusMatches && (!query || text.includes(query));
  });
}

function getVehicleForm(vehicle) {
  return {
    name: vehicle?.name || '',
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    year: vehicle?.year ? String(vehicle.year) : '',
    truck_type: vehicle?.truck_type || '',
    plate: vehicle?.plate || '',
    registration_expiration: vehicle?.registration_expiration || '',
    current_mileage: String(vehicle?.current_mileage || 0),
    notes: vehicle?.notes || ''
  };
}

function normalizeMaintenanceSettings(settings = []) {
  return (Array.isArray(settings) ? settings : [])
    .filter((setting) => setting?.is_enabled !== false)
    .map((setting) => ({
      ...setting,
      service_type: setting.service_type || 'Maintenance'
    }));
}

function normalizeMaintenanceSettingsDraft(settings = []) {
  return (Array.isArray(settings) ? settings : []).map((setting) => ({
    ...setting,
    service_type: setting.service_type || 'Maintenance',
    is_enabled: typeof setting.is_enabled === 'boolean' ? setting.is_enabled : true,
    default_interval_miles: setting.default_interval_miles ?? '',
    default_interval_days: setting.default_interval_days ?? '',
    notes: setting.notes || ''
  }));
}

function normalizeChecklistFields(template) {
  return (template?.fields || [])
    .filter((field) => field?.enabled !== false)
    .map((field) => field.label || field.id)
    .filter(Boolean);
}

function normalizeChecklistTemplateFields(template) {
  const submittedById = new Map(
    (Array.isArray(template?.fields) ? template.fields : [])
      .filter((field) => field && typeof field === 'object')
      .map((field) => [String(field.id || '').trim(), field])
      .filter(([id]) => Boolean(id))
  );

  return DEFAULT_CHECKLIST_TEMPLATE_FIELDS.map((defaultField) => {
    const submitted = submittedById.get(defaultField.id);
    return {
      ...defaultField,
      ...(submitted || {}),
      label: submitted?.label || defaultField.label,
      detail: submitted?.detail || defaultField.detail,
      enabled: typeof submitted?.enabled === 'boolean' ? submitted.enabled : defaultField.enabled
    };
  });
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

function getMaintenanceForm(vehicle) {
  return {
    condition_notes: '',
    cost: '',
    description: '',
    mileage_at_service: String(vehicle?.current_mileage || ''),
    next_service_date: '',
    next_service_mileage: '',
    service_date: getTodayDateParam(),
    service_type: 'Oil Change',
    vendor_name: ''
  };
}

function getOdometerForm(vehicle) {
  return {
    odometer_reading: vehicle?.current_mileage === null || vehicle?.current_mileage === undefined
      ? ''
      : String(vehicle.current_mileage),
    notes: '',
    confirmedLower: false
  };
}

function Field({ keyboardType, label, multiline = false, onChangeText, placeholder, value }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={appTheme.colors.textTertiary}
        style={[styles.textInput, multiline ? styles.textArea : null]}
        value={value}
      />
    </View>
  );
}

function VehicleCard({ onEditActions, onViewActions, vehicle }) {
  const assignedDriver = getAssignedDriverLabel(vehicle);
  const routeNumber = vehicle.today_assignment?.work_area_name;
  const statusMeta = getStatusMeta(vehicle);
  const lastService = getLastServiceSummary(vehicle);

  return (
    <View style={styles.vehicleRow}>
      <View style={styles.vehicleCardHeader}>
        <View style={styles.vehicleRowMain}>
          <Text numberOfLines={1} style={styles.vehicleName}>{vehicle.name || 'Truck not recorded'}</Text>
          <Text numberOfLines={1} style={styles.vehicleDescription}>{getVehicleDescription(vehicle)}</Text>
        </View>
        <View style={[styles.statusBadge, styles[`statusBadge${statusMeta.tone}`]]}>
          <Text style={[styles.statusBadgeText, styles[`statusBadgeText${statusMeta.tone}`]]}>{statusMeta.label}</Text>
        </View>
      </View>

      <View style={styles.vehicleListMeta}>
        <Text numberOfLines={1} style={styles.vehicleMetaText}>{formatMileage(vehicle.current_mileage)}</Text>
        <Text style={styles.vehicleMetaDot}>•</Text>
        <Text numberOfLines={1} style={styles.vehicleMetaText}>{routeNumber || assignedDriver}</Text>
      </View>
      <View style={styles.vehicleListMeta}>
        <Text numberOfLines={1} style={styles.vehicleMetaText}>{lastService.detailLabel}</Text>
        <Text style={styles.vehicleMetaDot}>•</Text>
        <Text numberOfLines={1} style={styles.vehicleMetaText}>{getRegistrationStatus(vehicle)}</Text>
      </View>

      <View style={styles.vehicleActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onEditActions(vehicle)}
          style={({ pressed }) => [styles.compactEditButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.compactEditButtonText}>Edit</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onViewActions(vehicle)}
          style={({ pressed }) => [styles.compactEditButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.compactEditButtonText}>View</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SectionTabs({ activeTab, onChange }) {
  return (
    <View style={styles.sectionTabs}>
      {VEHICLE_MANAGER_TABS.map((tab) => (
        <Pressable
          accessibilityRole="button"
          key={tab}
          onPress={() => onChange(tab)}
          style={({ pressed }) => [
            styles.sectionTab,
            activeTab === tab ? styles.sectionTabActive : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={[styles.sectionTabText, activeTab === tab ? styles.sectionTabTextActive : null]}>{tab}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function MaintenanceProgramPanel({
  isLoading,
  isSaving,
  onChangeSetting,
  onSave,
  records,
  settings,
  settingsErrorMessage
}) {
  const draftSettings = normalizeMaintenanceSettingsDraft(settings);
  const recentRecords = Array.isArray(records) ? records.slice(0, 8) : [];

  if (isLoading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={appTheme.colors.orange} size="large" />
        <Text style={styles.loadingText}>Loading maintenance</Text>
      </View>
    );
  }

  return (
    <View style={styles.panelStack}>
      <AppCard style={styles.managerMaintenanceCard}>
        <Text style={styles.panelTitle}>Maintenance Program</Text>
        <Text style={styles.panelBody}>Service categories this CSA tracks and the default reminder intervals.</Text>
        {draftSettings.length ? (
          <View style={styles.settingsList}>
            {draftSettings.map((setting, index) => (
              <View key={`${setting.service_type}-${index}`} style={styles.settingRow}>
                <View style={styles.settingRowHeader}>
                  <View style={styles.settingTitleBlock}>
                    <Text style={styles.settingName}>{setting.service_type}</Text>
                    <Text style={styles.settingMeta}>{setting.is_enabled ? formatInterval(setting) : 'Not tracked'}</Text>
                  </View>
                  <CheckToggle
                    checked={setting.is_enabled}
                    compact
                    label={setting.is_enabled ? 'On' : 'Off'}
                    onPress={() => onChangeSetting(index, 'is_enabled', !setting.is_enabled)}
                  />
                </View>
                <View style={styles.inlineFieldRow}>
                  <View style={styles.inlineField}>
                    <Text style={styles.summaryLabel}>Miles</Text>
                    <TextInput
                      keyboardType="number-pad"
                      onChangeText={(value) => onChangeSetting(index, 'default_interval_miles', value.replace(/\D/g, ''))}
                      placeholder="As needed"
                      placeholderTextColor={appTheme.colors.textTertiary}
                      style={styles.inlineInput}
                      value={String(setting.default_interval_miles ?? '')}
                    />
                  </View>
                  <View style={styles.inlineField}>
                    <Text style={styles.summaryLabel}>Days</Text>
                    <TextInput
                      keyboardType="number-pad"
                      onChangeText={(value) => onChangeSetting(index, 'default_interval_days', value.replace(/\D/g, ''))}
                      placeholder="As needed"
                      placeholderTextColor={appTheme.colors.textTertiary}
                      style={styles.inlineInput}
                      value={String(setting.default_interval_days ?? '')}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyBody}>No maintenance categories are enabled yet.</Text>
        )}
        {settingsErrorMessage ? <Text style={styles.modalError}>{settingsErrorMessage}</Text> : null}
        <Pressable disabled={isSaving} onPress={onSave} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
          {isSaving ? (
            <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save Maintenance Program</Text>
          )}
        </Pressable>
      </AppCard>

      <AppCard style={styles.managerMaintenanceCard}>
        <Text style={styles.panelTitle}>Recent Maintenance Records</Text>
        <Text style={styles.panelBody}>Completed oil changes, tires, brakes, filters, inspections, and repair records.</Text>
        {recentRecords.length ? (
          <View style={styles.recordsList}>
            {recentRecords.map((record) => (
              <View key={record.id || `${record.vehicle_id}-${record.service_date}-${record.service_type}`} style={styles.recordRow}>
                <View style={styles.recordRowHeader}>
                  <Text style={styles.recordTitle}>Truck {record.vehicle_name || record.vehicle?.name || 'Not recorded'}</Text>
                  <Text style={styles.recordDate}>{formatDate(record.service_date)}</Text>
                </View>
                <Text style={styles.recordService}>{record.service_type || 'Maintenance'}</Text>
                <Text style={styles.recordMeta}>
                  {[record.vendor_name, record.mileage_at_service ? formatMileage(record.mileage_at_service) : null]
                    .filter(Boolean)
                    .join(' • ') || 'No vendor or mileage recorded'}
                </Text>
                {record.description || record.condition_notes ? (
                  <Text style={styles.recordNotes}>{record.description || record.condition_notes}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyBody}>No fleet maintenance records yet.</Text>
        )}
      </AppCard>
    </View>
  );
}

function InspectionsPanel({ checklistTemplate, isLoading, requirements }) {
  const checklistFields = normalizeChecklistFields(checklistTemplate);

  if (isLoading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={appTheme.colors.orange} size="large" />
        <Text style={styles.loadingText}>Loading inspections</Text>
      </View>
    );
  }

  return (
    <View style={styles.panelStack}>
      <AppCard style={styles.managerMaintenanceCard}>
        <Text style={styles.panelTitle}>Vehicle Check Requirements</Text>
        <Text style={styles.panelBody}>{getMaintenanceModeLabel(requirements)}</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Weekly day</Text>
            <Text style={styles.summaryValue}>{requirements?.weekly_inspection_day || 'Monday'}</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Reported issues</Text>
            <Text style={styles.summaryValue}>
              {requirements?.custom_weekly_requirements?.require_manager_review_for_reported_issues ? 'Manager review required' : 'Manager review optional'}
            </Text>
          </View>
        </View>
        <Text style={styles.panelCaption}>Changes apply to the next workday so today’s driver checks are not interrupted.</Text>
      </AppCard>

      <AppCard style={styles.managerMaintenanceCard}>
        <Text style={styles.panelTitle}>Checklist Template</Text>
        <Text style={styles.panelBody}>Used for weekly full inspections in Option 1 and daily full inspections in Option 2.</Text>
        {checklistFields.length ? (
          <View style={styles.checklistList}>
            {checklistFields.map((field) => (
              <View key={field} style={styles.checklistRow}>
                <Text style={styles.checklistDot}>✓</Text>
                <Text style={styles.checklistText}>{field}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyBody}>No checklist fields are enabled yet.</Text>
        )}
      </AppCard>
    </View>
  );
}

function CheckToggle({ checked, compact = false, label, onPress }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => [styles.checkToggleRow, compact ? styles.checkToggleRowCompact : null, pressed ? styles.pressed : null]}
    >
      <View style={[styles.checkboxMark, checked ? styles.checkboxMarkActive : null]}>
        {checked ? <Text style={styles.checkboxMarkText}>✓</Text> : null}
      </View>
      <Text style={[styles.checkToggleText, compact ? styles.checkToggleTextCompact : null]}>{label}</Text>
    </Pressable>
  );
}

function RequirementOptionCard({ draft, option, onSelect }) {
  const selected = draft.maintenance_requirement_mode === option.id;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSelect(option.id)}
      style={({ pressed }) => [
        styles.requirementOptionCard,
        selected ? styles.requirementOptionCardSelected : null,
        pressed ? styles.pressed : null
      ]}
    >
      <View style={styles.requirementOptionTopline}>
        <Text style={styles.requirementOptionLabel}>{option.optionLabel}</Text>
        {option.badge ? (
          <Text style={[styles.requirementBadge, option.badgeTone === 'recommended' ? styles.requirementBadgeRecommended : styles.requirementBadgeStricter]}>
            {option.badge}
          </Text>
        ) : null}
      </View>
      <Text style={styles.requirementOptionTitle}>{option.title}</Text>
      <Text style={styles.requirementOptionDescription}>{option.description}</Text>
      <View style={styles.requirementListBlock}>
        <Text style={styles.summaryLabel}>Daily</Text>
        {option.dailyRequirements.map((item) => (
          <Text key={item} style={styles.requirementListItem}>• {item}</Text>
        ))}
      </View>
      <View style={styles.requirementListBlock}>
        <Text style={styles.summaryLabel}>Weekly</Text>
        {option.weeklyRequirements.map((item) => (
          <Text key={item} style={styles.requirementListItem}>• {item}</Text>
        ))}
      </View>
    </Pressable>
  );
}

function MaintenanceRequirementsEditor({
  draft,
  errorMessage,
  isSaving,
  onChangeCustomDaily,
  onChangeCustomWeekly,
  onChangeMode,
  onChangeWeeklyDay,
  onSave
}) {
  return (
    <AppCard style={styles.managerMaintenanceCard}>
      <Text style={styles.panelTitle}>Maintenance Requirements</Text>
      <Text style={styles.panelBody}>Choose what drivers must complete for vehicle checks.</Text>

      <View style={styles.requirementOptionsList}>
        {MAINTENANCE_REQUIREMENT_OPTIONS.map((option) => (
          <RequirementOptionCard
            draft={draft}
            key={option.id}
            onSelect={onChangeMode}
            option={option}
          />
        ))}
      </View>

      <View style={styles.weekdaySelector}>
        <Text style={styles.summaryLabel}>Weekly inspection day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.weekdayChips}>
            {WEEKLY_INSPECTION_DAYS.map((day) => (
              <Pressable
                key={day}
                onPress={() => onChangeWeeklyDay(day)}
                style={({ pressed }) => [
                  styles.weekdayChip,
                  draft.weekly_inspection_day === day ? styles.weekdayChipActive : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text style={[styles.weekdayChipText, draft.weekly_inspection_day === day ? styles.weekdayChipTextActive : null]}>{day}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {draft.maintenance_requirement_mode === 'custom' ? (
        <View style={styles.customRequirements}>
          <Text style={styles.settingName}>Custom Daily Requirements</Text>
          <CheckToggle
            checked={draft.custom_daily_requirements.require_truck_confirmation}
            label="Require daily truck confirmation"
            onPress={() => onChangeCustomDaily('require_truck_confirmation', !draft.custom_daily_requirements.require_truck_confirmation)}
          />
          <CheckToggle
            checked={draft.custom_daily_requirements.require_odometer_entry}
            label="Require daily odometer entry"
            onPress={() => onChangeCustomDaily('require_odometer_entry', !draft.custom_daily_requirements.require_odometer_entry)}
          />
          <CheckToggle
            checked={draft.custom_daily_requirements.show_issue_note_box}
            label="Show daily issue note box"
            onPress={() => onChangeCustomDaily('show_issue_note_box', !draft.custom_daily_requirements.show_issue_note_box)}
          />
          <CheckToggle
            checked={draft.custom_daily_requirements.require_full_checklist_daily}
            label="Require full checklist daily"
            onPress={() => onChangeCustomDaily('require_full_checklist_daily', !draft.custom_daily_requirements.require_full_checklist_daily)}
          />
          <Text style={[styles.settingName, styles.customRequirementsHeading]}>Custom Weekly Requirements</Text>
          <CheckToggle
            checked={draft.custom_weekly_requirements.require_full_checklist_weekly}
            label="Require full checklist weekly"
            onPress={() => onChangeCustomWeekly('require_full_checklist_weekly', !draft.custom_weekly_requirements.require_full_checklist_weekly)}
          />
          <CheckToggle
            checked={draft.custom_weekly_requirements.require_manager_review_for_reported_issues}
            label="Require manager review for reported issues"
            onPress={() => onChangeCustomWeekly(
              'require_manager_review_for_reported_issues',
              !draft.custom_weekly_requirements.require_manager_review_for_reported_issues
            )}
          />
        </View>
      ) : null}

      <Text style={styles.panelCaption}>Changes apply to the next workday so today’s driver checks are not interrupted.</Text>
      {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}
      <Pressable disabled={isSaving} onPress={onSave} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
        {isSaving ? (
          <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
        ) : (
          <Text style={styles.saveButtonText}>Save Requirements</Text>
        )}
      </Pressable>
    </AppCard>
  );
}

function ReminderScheduleEditor({ draft, errorMessage, isSaving, onChange, onSave }) {
  return (
    <AppCard style={styles.managerMaintenanceCard}>
      <Text style={styles.panelTitle}>Reminder Schedule</Text>
      <Text style={styles.panelBody}>Set weekly inspection day and warning windows for vehicle readiness.</Text>
      <View style={styles.weekdaySelector}>
        <Text style={styles.summaryLabel}>Weekly inspection day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.weekdayChips}>
            {WEEKLY_INSPECTION_DAYS.map((day) => (
              <Pressable
                key={day}
                onPress={() => onChange('weekly_inspection_day', day)}
                style={({ pressed }) => [
                  styles.weekdayChip,
                  draft.weekly_inspection_day === day ? styles.weekdayChipActive : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text style={[styles.weekdayChipText, draft.weekly_inspection_day === day ? styles.weekdayChipTextActive : null]}>{day}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={styles.inlineFieldRow}>
        <View style={styles.inlineField}>
          <Text style={styles.summaryLabel}>Maintenance miles</Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={(value) => onChange('maintenance_warning_miles', value.replace(/\D/g, ''))}
            placeholder="1000"
            placeholderTextColor={appTheme.colors.textTertiary}
            style={styles.inlineInput}
            value={String(draft.maintenance_warning_miles ?? '')}
          />
        </View>
        <View style={styles.inlineField}>
          <Text style={styles.summaryLabel}>Maintenance days</Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={(value) => onChange('maintenance_warning_days', value.replace(/\D/g, ''))}
            placeholder="14"
            placeholderTextColor={appTheme.colors.textTertiary}
            style={styles.inlineInput}
            value={String(draft.maintenance_warning_days ?? '')}
          />
        </View>
      </View>
      <View style={styles.inlineField}>
        <Text style={styles.summaryLabel}>Document expiration warning</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={(value) => onChange('document_warning_days', value.replace(/\D/g, ''))}
          placeholder="30"
          placeholderTextColor={appTheme.colors.textTertiary}
          style={styles.inlineInput}
          value={String(draft.document_warning_days ?? '')}
        />
      </View>
      <Text style={styles.panelCaption}>Expired documents and overdue maintenance still block vehicles automatically.</Text>
      {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}
      <Pressable disabled={isSaving} onPress={onSave} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
        {isSaving ? (
          <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
        ) : (
          <Text style={styles.saveButtonText}>Save Schedule</Text>
        )}
      </Pressable>
    </AppCard>
  );
}

function ChecklistTemplateEditor({ errorMessage, fields, isSaving, onSave, onToggleField }) {
  return (
    <AppCard style={styles.managerMaintenanceCard}>
      <Text style={styles.panelTitle}>Checklist Template</Text>
      <Text style={styles.panelBody}>Enable or disable fields for full vehicle inspections.</Text>
      <Text style={styles.panelCaption}>This checklist is used for weekly full inspections in Option 1 and daily full inspections in Option 2.</Text>
      {fields.length ? (
        <View style={styles.checklistList}>
          {fields.map((field, index) => (
            <View key={field.id} style={[styles.checklistRow, field.enabled ? null : styles.checklistRowDisabled]}>
              <Text style={styles.checklistNumber}>{index + 1}</Text>
              <View style={styles.checklistCopy}>
                <Text style={styles.checklistText}>{field.label}</Text>
                {field.detail ? <Text style={styles.settingMeta}>{field.detail}</Text> : null}
              </View>
              <CheckToggle
                checked={field.enabled}
                compact
                label={field.enabled ? 'On' : 'Off'}
                onPress={() => onToggleField(field.id, !field.enabled)}
              />
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyBody}>No checklist fields are available yet.</Text>
      )}
      {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}
      <Pressable disabled={isSaving} onPress={onSave} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
        {isSaving ? (
          <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
        ) : (
          <Text style={styles.saveButtonText}>Save Template</Text>
        )}
      </Pressable>
    </AppCard>
  );
}

function MaintenanceSettingsPanel({
  checklistTemplate,
  checklistTemplateErrorMessage,
  isLoading,
  isSavingChecklistTemplate,
  isSavingRequirements,
  isSavingReminderSchedule,
  onChangeCustomDaily,
  onChangeCustomWeekly,
  onChangeReminderSchedule,
  onChangeRequirementMode,
  onChangeWeeklyDay,
  onSaveChecklistTemplate,
  onSaveRequirements,
  onSaveReminderSchedule,
  onToggleChecklistField,
  reminderSchedule,
  reminderScheduleErrorMessage,
  requirementErrorMessage,
  requirements,
  settings
}) {
  const enabledSettings = normalizeMaintenanceSettings(settings);
  const checklistFields = normalizeChecklistTemplateFields(checklistTemplate);
  const draft = normalizeMaintenanceRequirementSetting(requirements);
  const scheduleDraft = {
    weekly_inspection_day: reminderSchedule?.weekly_inspection_day || draft.weekly_inspection_day,
    maintenance_warning_miles: reminderSchedule?.maintenance_warning_miles ?? draft.maintenance_warning_miles,
    maintenance_warning_days: reminderSchedule?.maintenance_warning_days ?? draft.maintenance_warning_days,
    document_warning_days: reminderSchedule?.document_warning_days ?? draft.document_warning_days
  };

  if (isLoading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={appTheme.colors.orange} size="large" />
        <Text style={styles.loadingText}>Loading settings</Text>
      </View>
    );
  }

  return (
    <View style={styles.panelStack}>
      <MaintenanceRequirementsEditor
        draft={draft}
        errorMessage={requirementErrorMessage}
        isSaving={isSavingRequirements}
        onChangeCustomDaily={onChangeCustomDaily}
        onChangeCustomWeekly={onChangeCustomWeekly}
        onChangeMode={onChangeRequirementMode}
        onChangeWeeklyDay={onChangeWeeklyDay}
        onSave={onSaveRequirements}
      />

      <ReminderScheduleEditor
        draft={scheduleDraft}
        errorMessage={reminderScheduleErrorMessage}
        isSaving={isSavingReminderSchedule}
        onChange={onChangeReminderSchedule}
        onSave={onSaveReminderSchedule}
      />

      <ChecklistTemplateEditor
        errorMessage={checklistTemplateErrorMessage}
        fields={checklistFields}
        isSaving={isSavingChecklistTemplate}
        onSave={onSaveChecklistTemplate}
        onToggleField={onToggleChecklistField}
      />

      <Text style={styles.panelCaption}>
        {checklistFields.filter((field) => field.enabled).length} checklist fields enabled • {enabledSettings.length} maintenance categories tracked
      </Text>
    </View>
  );
}

function EditVehicleModal({ errorMessage, form, isSaving, mode = 'edit', onChange, onClose, onSubmit, vehicle, visible }) {
  const isEdit = mode === 'edit';

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</Text>
              <Text style={styles.modalSubtitle}>{isEdit ? vehicle?.name || 'Vehicle details' : 'Create one fleet vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close edit vehicle" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            <Field label="Truck Number" onChangeText={(value) => onChange('name', value)} placeholder="Truck Number" value={form.name} />
            <Field label="Make" onChangeText={(value) => onChange('make', value)} placeholder="Make" value={form.make} />
            <Field label="Model" onChangeText={(value) => onChange('model', value)} placeholder="Model" value={form.model} />
            <Field keyboardType="number-pad" label="Year" onChangeText={(value) => onChange('year', value.replace(/\D/g, '').slice(0, 4))} placeholder="Year" value={form.year} />
            <Field label="Vehicle Type" onChangeText={(value) => onChange('truck_type', value)} placeholder="P1100, P1200, P1000, etc." value={form.truck_type} />
            <Field label="Vehicle ID" onChangeText={(value) => onChange('plate', value.toUpperCase())} placeholder="Vehicle ID" value={form.plate} />
            <Field label="Registration expiration" onChangeText={(value) => onChange('registration_expiration', value)} placeholder="YYYY-MM-DD" value={form.registration_expiration} />
            <Field keyboardType="number-pad" label="Mileage" onChangeText={(value) => onChange('current_mileage', value.replace(/\D/g, ''))} placeholder="Current mileage" value={form.current_mileage} />
            <Field label="Notes" multiline onChangeText={(value) => onChange('notes', value)} placeholder="Internal notes" value={form.notes} />
          </ScrollView>

          {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}

          <View style={styles.modalActions}>
            <AppButton label="Cancel" onPress={onClose} style={styles.modalActionButton} variant="outline" />
            <Pressable disabled={isSaving} onPress={onSubmit} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
              {isSaving ? (
                <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TruckActionRow({ disabled = false, label, onPress, primary = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.truckActionRow,
        primary ? styles.truckActionRowPrimary : null,
        disabled ? styles.truckActionRowDisabled : null,
        pressed ? styles.pressed : null
      ]}
    >
      <Text style={[
        styles.truckActionRowText,
        primary ? styles.truckActionRowTextPrimary : null,
        disabled ? styles.truckActionRowTextDisabled : null
      ]}>
        {label}
      </Text>
      {disabled ? <Text style={styles.truckActionRowMeta}>Coming soon</Text> : null}
    </Pressable>
  );
}

function EditTruckActionsModal({ onAddService, onClose, onEditInfo, onEditOdometer, onUpdateRegistration, vehicle }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(vehicle)}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable style={styles.smallModalCard}>
          <Text style={styles.modalTitle}>Edit Truck {vehicle?.name || ''}</Text>
          <Text style={styles.modalSubtitle}>Change information or add records.</Text>
          <View style={styles.truckActionList}>
            <TruckActionRow label="Update Odometer" onPress={onEditOdometer} primary />
            <TruckActionRow label="Edit Truck Info" onPress={onEditInfo} />
            <TruckActionRow label="Log Maintenance" onPress={onAddService} />
            <TruckActionRow label="Update Registration" onPress={onUpdateRegistration} />
          </View>
          <AppButton label="Close" onPress={onClose} style={styles.menuActionButton} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ViewTruckActionsModal({ onClose, onViewHistory, vehicle }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(vehicle)}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable style={styles.smallModalCard}>
          <Text style={styles.modalTitle}>View Truck {vehicle?.name || ''}</Text>
          <Text style={styles.modalSubtitle}>Open records and history.</Text>
          <View style={styles.truckActionList}>
            <TruckActionRow label="Service History" onPress={onViewHistory} />
            <TruckActionRow disabled label="Inspection History" />
            <TruckActionRow disabled label="Odometer History" />
            <TruckActionRow disabled label="Assignment History" />
          </View>
          <AppButton label="Close" onPress={onClose} style={styles.menuActionButton} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OdometerModal({ errorMessage, form, isSaving, onChange, onClose, onConfirmLower, onSubmit, vehicle }) {
  const currentMileage = Number(vehicle?.current_mileage || 0);
  const nextMileage = Number(form.odometer_reading || 0);
  const showLowerWarning = form.odometer_reading !== '' && nextMileage < currentMileage;
  const canSave = !showLowerWarning || form.confirmedLower;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(vehicle)}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Edit Odometer</Text>
              <Text style={styles.modalSubtitle}>{vehicle?.name || 'Vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close odometer editor" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.odometerSummary}>
            <View>
              <Text style={styles.summaryLabel}>Truck Number</Text>
              <Text style={styles.summaryValue}>{vehicle?.name || 'Not recorded'}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Description</Text>
              <Text style={styles.summaryValue}>{getVehicleDescription(vehicle)}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Current odometer</Text>
              <Text style={styles.summaryValue}>{formatMileage(currentMileage)}</Text>
            </View>
          </View>

          <Field
            keyboardType="number-pad"
            label="New odometer reading"
            onChangeText={(value) => onChange('odometer_reading', value.replace(/\D/g, ''))}
            placeholder="Current mileage"
            value={form.odometer_reading}
          />
          <Field
            label="Optional notes"
            multiline
            onChangeText={(value) => onChange('notes', value)}
            placeholder="Reason for manager override"
            value={form.notes}
          />

          {showLowerWarning ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                This is lower than the current odometer reading. Only continue if you are correcting an error.
              </Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.confirmedLower }}
                onPress={() => onConfirmLower(!form.confirmedLower)}
                style={({ pressed }) => [styles.confirmRow, pressed ? styles.pressed : null]}
              >
                <View style={[styles.checkboxMark, form.confirmedLower ? styles.checkboxMarkActive : null]}>
                  {form.confirmedLower ? <Text style={styles.checkboxMarkText}>✓</Text> : null}
                </View>
                <Text style={styles.confirmText}>I understand and want to save this correction.</Text>
              </Pressable>
            </View>
          ) : null}

          {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}

          <View style={styles.modalActions}>
            <AppButton label="Cancel" onPress={onClose} style={styles.modalActionButton} variant="outline" />
            <Pressable disabled={isSaving || !canSave} onPress={onSubmit} style={({ pressed }) => [styles.saveButton, isSaving || !canSave ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
              {isSaving ? (
                <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ServiceRecordModal({ errorMessage, form, isSaving, onChange, onClose, onSubmit, vehicle }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(vehicle)}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Log Completed Maintenance</Text>
              <Text style={styles.modalSubtitle}>{vehicle?.name || 'Vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close service record" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.odometerSummary}>
            <View>
              <Text style={styles.summaryLabel}>Truck Number</Text>
              <Text style={styles.summaryValue}>{vehicle?.name || 'Not recorded'}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Current odometer</Text>
              <Text style={styles.summaryValue}>{formatMileage(vehicle?.current_mileage)}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            <Field label="Maintenance item completed" onChangeText={(value) => onChange('service_type', value)} placeholder={SERVICE_TYPE_OPTIONS.join(', ')} value={form.service_type} />
            <Field keyboardType="number-pad" label="Service odometer reading" onChangeText={(value) => onChange('mileage_at_service', value.replace(/\D/g, ''))} placeholder="Mileage at service" value={form.mileage_at_service} />
            <Field label="Service date" onChangeText={(value) => onChange('service_date', value)} placeholder="YYYY-MM-DD" value={form.service_date} />
            <Field label="Vendor or shop name" onChangeText={(value) => onChange('vendor_name', value)} placeholder="Optional" value={form.vendor_name} />
            <Field keyboardType="numeric" label="Cost" onChangeText={(value) => onChange('cost', value)} placeholder="Optional" value={form.cost} />
            <Field label="Notes" multiline onChangeText={(value) => onChange('description', value)} placeholder="Optional notes" value={form.description} />
          </ScrollView>
          {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}
          <View style={styles.modalActions}>
            <AppButton label="Cancel" onPress={onClose} style={styles.modalActionButton} variant="outline" />
            <Pressable disabled={isSaving} onPress={onSubmit} style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed ? styles.pressed : null]}>
              {isSaving ? (
                <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Log Maintenance</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ServiceHistoryModal({ history, isLoading, onClose, vehicle }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(vehicle)}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Service History</Text>
              <Text style={styles.modalSubtitle}>{vehicle?.name || 'Vehicle'}</Text>
            </View>
            <Pressable accessibilityLabel="Close service history" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
          {isLoading ? (
            <ActivityIndicator color={appTheme.colors.orange} size="large" />
          ) : history.length ? (
            <ScrollView contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={false}>
              {history.map((row) => (
                <View key={row.id || `${row.service_date}-${row.service_type}`} style={styles.historyRow}>
                  <Text style={styles.historyTitle}>{formatDate(row.service_date)} • {row.service_type || 'Service'}</Text>
                  <Text style={styles.historyMeta}>{row.description || 'No description'}</Text>
                  {row.vendor_name ? <Text style={styles.historyMeta}>{row.vendor_name}</Text> : null}
                  <Text style={styles.historyMeta}>{row.mileage_at_service ? formatMileage(row.mileage_at_service) : 'Mileage not recorded'}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.emptyBody}>No service records yet.</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ManagerVehiclesScreen({ csaWorkspaceVersion = 0, identity }) {
  const [vehicles, setVehicles] = useState([]);
  const [activeTab, setActiveTab] = useState('Fleet');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [maintenanceSettings, setMaintenanceSettings] = useState([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [maintenanceRequirements, setMaintenanceRequirements] = useState(null);
  const [reminderSchedule, setReminderSchedule] = useState(null);
  const [checklistTemplate, setChecklistTemplate] = useState(null);
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(false);
  const [isSavingMaintenanceSettings, setIsSavingMaintenanceSettings] = useState(false);
  const [isSavingChecklistTemplate, setIsSavingChecklistTemplate] = useState(false);
  const [isSavingRequirements, setIsSavingRequirements] = useState(false);
  const [isSavingReminderSchedule, setIsSavingReminderSchedule] = useState(false);
  const [maintenanceErrorMessage, setMaintenanceErrorMessage] = useState('');
  const [maintenanceSettingsErrorMessage, setMaintenanceSettingsErrorMessage] = useState('');
  const [checklistTemplateErrorMessage, setChecklistTemplateErrorMessage] = useState('');
  const [requirementErrorMessage, setRequirementErrorMessage] = useState('');
  const [reminderScheduleErrorMessage, setReminderScheduleErrorMessage] = useState('');
  const [hasLoadedMaintenanceOverview, setHasLoadedMaintenanceOverview] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [vehicleModalMode, setVehicleModalMode] = useState('edit');
  const [vehicleForm, setVehicleForm] = useState(getVehicleForm(null));
  const [vehicleError, setVehicleError] = useState('');
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);
  const [isImportingVehicles, setIsImportingVehicles] = useState(false);
  const [vehicleImportMessage, setVehicleImportMessage] = useState('');
  const [serviceMenuVehicle, setServiceMenuVehicle] = useState(null);
  const [viewMenuVehicle, setViewMenuVehicle] = useState(null);
  const [serviceVehicle, setServiceVehicle] = useState(null);
  const [serviceForm, setServiceForm] = useState(getMaintenanceForm(null));
  const [serviceError, setServiceError] = useState('');
  const [isSavingService, setIsSavingService] = useState(false);
  const [historyVehicle, setHistoryVehicle] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [odometerVehicle, setOdometerVehicle] = useState(null);
  const [odometerForm, setOdometerForm] = useState(getOdometerForm(null));
  const [odometerError, setOdometerError] = useState('');
  const [isSavingOdometer, setIsSavingOdometer] = useState(false);

  async function loadVehicles() {
    setIsLoading(true);
    try {
      const response = await api.get('/vehicles', { authMode: 'manager' });
      setVehicles(response.data?.vehicles || []);
      setErrorMessage('');
    } catch (_error) {
      setErrorMessage('Unable to load vehicles right now.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMaintenanceOverview() {
    setIsLoadingMaintenance(true);
    const [
      settingsResponse,
      recordsResponse,
      requirementsResponse,
      reminderResponse,
      checklistResponse
    ] = await Promise.allSettled([
      api.get('/vehicles/settings/maintenance', { authMode: 'manager' }),
      api.get('/vehicles/maintenance-records', { authMode: 'manager' }),
      api.get('/vehicles/settings/maintenance-requirements', { authMode: 'manager' }),
      api.get('/vehicles/settings/reminder-schedule', { authMode: 'manager' }),
      api.get('/vehicles/settings/checklist-template', { authMode: 'manager' })
    ]);

    const fulfilled = [settingsResponse, recordsResponse, requirementsResponse, reminderResponse, checklistResponse]
      .filter((response) => response.status === 'fulfilled');

    if (settingsResponse.status === 'fulfilled') {
      setMaintenanceSettings(normalizeMaintenanceSettingsDraft(settingsResponse.value.data?.settings || []));
    }
    if (recordsResponse.status === 'fulfilled') {
      setMaintenanceRecords(recordsResponse.value.data?.maintenance || []);
    }
    if (requirementsResponse.status === 'fulfilled') {
      setMaintenanceRequirements(normalizeMaintenanceRequirementSetting(requirementsResponse.value.data?.setting));
    }
    if (reminderResponse.status === 'fulfilled') {
      setReminderSchedule(reminderResponse.value.data?.schedule || null);
    }
    if (checklistResponse.status === 'fulfilled') {
      setChecklistTemplate({
        ...(checklistResponse.value.data?.template || {}),
        fields: normalizeChecklistTemplateFields(checklistResponse.value.data?.template)
      });
    }

    if (fulfilled.length) {
      setMaintenanceErrorMessage('');
    } else {
      setMaintenanceErrorMessage('Unable to load vehicle maintenance settings right now.');
    }
    setHasLoadedMaintenanceOverview(true);
    setIsLoadingMaintenance(false);
  }

  useEffect(() => {
    loadVehicles();
  }, [csaWorkspaceVersion]);

  useEffect(() => {
    if (activeTab !== 'Fleet' && !hasLoadedMaintenanceOverview && !isLoadingMaintenance) {
      loadMaintenanceOverview();
    }
  }, [activeTab, hasLoadedMaintenanceOverview, isLoadingMaintenance]);

  const filteredVehicles = useMemo(() => filterVehicles(vehicles, searchTerm, statusFilter), [searchTerm, statusFilter, vehicles]);

  function openEditVehicle(vehicle) {
    setServiceMenuVehicle(null);
    setViewMenuVehicle(null);
    setEditingVehicle(vehicle);
    setVehicleModalMode('edit');
    setVehicleForm(getVehicleForm(vehicle));
    setVehicleError('');
  }

  function openAddVehicle() {
    setEditingVehicle({});
    setVehicleModalMode('add');
    setVehicleForm(getVehicleForm(null));
    setVehicleError('');
  }

  function closeEditVehicle() {
    setEditingVehicle(null);
    setVehicleForm(getVehicleForm(null));
    setVehicleError('');
  }

  function updateVehicleField(field, value) {
    setVehicleForm((current) => ({ ...current, [field]: value }));
  }

  async function submitVehicleEdit() {
    setVehicleError('');

    if (!vehicleForm.name || !vehicleForm.make || !vehicleForm.model || !vehicleForm.year || !vehicleForm.plate) {
      setVehicleError('Truck Number, make, model, year, and Vehicle ID are required.');
      return;
    }

    setIsSavingVehicle(true);
    try {
      if (vehicleModalMode === 'add') {
        await api.post('/vehicles', {
          ...vehicleForm,
          current_mileage: Number(vehicleForm.current_mileage || 0),
          year: Number(vehicleForm.year)
        }, {
          authMode: 'manager'
        });
      } else {
        await api.put(`/vehicles/${editingVehicle.id}`, {
          ...vehicleForm,
          current_mileage: Number(vehicleForm.current_mileage || 0),
          year: Number(vehicleForm.year)
        }, {
          authMode: 'manager'
        });
      }
      await loadVehicles();
      closeEditVehicle();
    } catch (_error) {
      setVehicleError(vehicleModalMode === 'add' ? 'Unable to create vehicle.' : 'Unable to update vehicle.');
    } finally {
      setIsSavingVehicle(false);
    }
  }

  async function importVehicles() {
    setVehicleImportMessage('');
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ]
    });

    if (result.canceled) {
      return;
    }

    const file = result.assets?.[0];
    if (!file) {
      return;
    }

    setIsImportingVehicles(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'vehicles.csv',
        type: file.mimeType || 'text/csv'
      });
      const response = await api.post('/vehicles/import', formData, {
        authMode: 'manager',
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      const summary = response.data || {};
      setVehicleImportMessage(`${summary.created || 0} vehicles imported. ${summary.skipped || 0} skipped.`);
      await loadVehicles();
    } catch (_error) {
      setVehicleImportMessage('Could not import vehicles. Check the file and try again.');
    } finally {
      setIsImportingVehicles(false);
    }
  }

  function openServiceRecord(vehicle) {
    setServiceMenuVehicle(null);
    setViewMenuVehicle(null);
    setServiceVehicle(vehicle);
    setServiceForm(getMaintenanceForm(vehicle));
    setServiceError('');
  }

  function closeServiceRecord() {
    setServiceVehicle(null);
    setServiceForm(getMaintenanceForm(null));
    setServiceError('');
  }

  function updateServiceField(field, value) {
    setServiceForm((current) => ({ ...current, [field]: value }));
  }

  function updateMaintenanceSetting(index, field, value) {
    setMaintenanceSettings((current) => normalizeMaintenanceSettingsDraft(current).map((setting, settingIndex) => (
      settingIndex === index ? { ...setting, [field]: value } : setting
    )));
    setMaintenanceSettingsErrorMessage('');
  }

  async function saveMaintenanceSettings() {
    setIsSavingMaintenanceSettings(true);
    setMaintenanceSettingsErrorMessage('');
    try {
      const settings = normalizeMaintenanceSettingsDraft(maintenanceSettings).map((setting) => ({
        ...setting,
        default_interval_miles: setting.default_interval_miles === '' ? null : Number(setting.default_interval_miles),
        default_interval_days: setting.default_interval_days === '' ? null : Number(setting.default_interval_days),
        notes: setting.notes?.trim() || null
      }));
      const response = await api.put('/vehicles/settings/maintenance', { settings }, { authMode: 'manager' });
      setMaintenanceSettings(normalizeMaintenanceSettingsDraft(response.data?.settings || settings));
    } catch (error) {
      setMaintenanceSettingsErrorMessage(getApiErrorMessage(error, 'Unable to save maintenance program.'));
    } finally {
      setIsSavingMaintenanceSettings(false);
    }
  }

  function updateRequirementDraft(updater) {
    setMaintenanceRequirements((current) => normalizeMaintenanceRequirementSetting(
      typeof updater === 'function' ? updater(normalizeMaintenanceRequirementSetting(current)) : updater
    ));
    setRequirementErrorMessage('');
  }

  function updateRequirementMode(mode) {
    updateRequirementDraft((current) => ({
      ...current,
      maintenance_requirement_mode: mode
    }));
  }

  function updateRequirementWeeklyDay(day) {
    updateRequirementDraft((current) => ({
      ...current,
      weekly_inspection_day: day
    }));
  }

  function updateCustomDailyRequirement(key, value) {
    updateRequirementDraft((current) => ({
      ...current,
      custom_daily_requirements: {
        ...current.custom_daily_requirements,
        [key]: value
      }
    }));
  }

  function updateCustomWeeklyRequirement(key, value) {
    updateRequirementDraft((current) => ({
      ...current,
      custom_weekly_requirements: {
        ...current.custom_weekly_requirements,
        [key]: value
      }
    }));
  }

  async function saveMaintenanceRequirements() {
    setIsSavingRequirements(true);
    setRequirementErrorMessage('');
    try {
      const draft = normalizeMaintenanceRequirementSetting(maintenanceRequirements);
      const response = await api.put('/vehicles/settings/maintenance-requirements', draft, { authMode: 'manager' });
      const savedSetting = normalizeMaintenanceRequirementSetting(response.data?.setting);
      setMaintenanceRequirements(savedSetting);
      setReminderSchedule((current) => ({
        ...(current || {}),
        weekly_inspection_day: savedSetting.weekly_inspection_day,
        maintenance_warning_miles: savedSetting.maintenance_warning_miles,
        maintenance_warning_days: savedSetting.maintenance_warning_days,
        document_warning_days: savedSetting.document_warning_days
      }));
    } catch (error) {
      setRequirementErrorMessage(getApiErrorMessage(error, 'Unable to save maintenance requirements.'));
    } finally {
      setIsSavingRequirements(false);
    }
  }

  function updateReminderSchedule(field, value) {
    setReminderSchedule((current) => {
      const base = {
        weekly_inspection_day: current?.weekly_inspection_day || maintenanceRequirements?.weekly_inspection_day || 'Monday',
        maintenance_warning_miles: current?.maintenance_warning_miles ?? maintenanceRequirements?.maintenance_warning_miles ?? 1000,
        maintenance_warning_days: current?.maintenance_warning_days ?? maintenanceRequirements?.maintenance_warning_days ?? 14,
        document_warning_days: current?.document_warning_days ?? maintenanceRequirements?.document_warning_days ?? 30
      };
      return { ...base, [field]: value };
    });

    if (field === 'weekly_inspection_day') {
      updateRequirementWeeklyDay(value);
    }

    setReminderScheduleErrorMessage('');
  }

  async function saveReminderSchedule() {
    setIsSavingReminderSchedule(true);
    setReminderScheduleErrorMessage('');
    try {
      const schedule = {
        weekly_inspection_day: reminderSchedule?.weekly_inspection_day || maintenanceRequirements?.weekly_inspection_day || 'Monday',
        maintenance_warning_miles: Number(reminderSchedule?.maintenance_warning_miles ?? maintenanceRequirements?.maintenance_warning_miles ?? 1000),
        maintenance_warning_days: Number(reminderSchedule?.maintenance_warning_days ?? maintenanceRequirements?.maintenance_warning_days ?? 14),
        document_warning_days: Number(reminderSchedule?.document_warning_days ?? maintenanceRequirements?.document_warning_days ?? 30)
      };
      const response = await api.put('/vehicles/settings/reminder-schedule', schedule, { authMode: 'manager' });
      setReminderSchedule(response.data?.schedule || schedule);
      setMaintenanceRequirements((current) => normalizeMaintenanceRequirementSetting({
        ...(current || {}),
        ...schedule
      }));
    } catch (error) {
      setReminderScheduleErrorMessage(getApiErrorMessage(error, 'Unable to save reminder schedule.'));
    } finally {
      setIsSavingReminderSchedule(false);
    }
  }

  function toggleChecklistField(fieldId, enabled) {
    setChecklistTemplate((current) => ({
      ...(current || {}),
      fields: normalizeChecklistTemplateFields(current).map((field) => (
        field.id === fieldId ? { ...field, enabled } : field
      ))
    }));
    setChecklistTemplateErrorMessage('');
  }

  async function saveChecklistTemplate() {
    setIsSavingChecklistTemplate(true);
    setChecklistTemplateErrorMessage('');
    try {
      const fields = normalizeChecklistTemplateFields(checklistTemplate);
      const response = await api.put('/vehicles/settings/checklist-template', { fields }, { authMode: 'manager' });
      setChecklistTemplate({
        ...(response.data?.template || {}),
        fields: normalizeChecklistTemplateFields(response.data?.template || { fields })
      });
    } catch (error) {
      setChecklistTemplateErrorMessage(getApiErrorMessage(error, 'Unable to save checklist template.'));
    } finally {
      setIsSavingChecklistTemplate(false);
    }
  }

  async function submitServiceRecord() {
    setServiceError('');

    if (!serviceForm.service_date || !serviceForm.service_type || !serviceForm.mileage_at_service) {
      setServiceError('Service date, maintenance item, and service odometer reading are required.');
      return;
    }

    setIsSavingService(true);
    try {
      await api.post(`/vehicles/${serviceVehicle.id}/maintenance`, {
        service_date: serviceForm.service_date,
        service_type: serviceForm.service_type,
        description: serviceForm.description || undefined,
        condition_notes: serviceForm.condition_notes || undefined,
        vendor_name: serviceForm.vendor_name || undefined,
        cost: serviceForm.cost ? Number(serviceForm.cost) : undefined,
        mileage_at_service: Number(serviceForm.mileage_at_service),
        next_service_mileage: serviceForm.next_service_mileage ? Number(serviceForm.next_service_mileage) : undefined,
        next_service_date: serviceForm.next_service_date || undefined
      }, {
        authMode: 'manager'
      });
      await loadVehicles();
      if (hasLoadedMaintenanceOverview) {
        await loadMaintenanceOverview();
      }
      closeServiceRecord();
    } catch (_error) {
      setServiceError('Unable to save service record.');
    } finally {
      setIsSavingService(false);
    }
  }

  async function openServiceHistory(vehicle) {
    setServiceMenuVehicle(null);
    setViewMenuVehicle(null);
    setHistoryVehicle(vehicle);
    setIsLoadingHistory(true);
    try {
      const response = await api.get(`/vehicles/${vehicle.id}/maintenance`, { authMode: 'manager' });
      setHistory(response.data?.maintenance || []);
    } catch (_error) {
      setHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  function openOdometerEditor(vehicle) {
    setServiceMenuVehicle(null);
    setViewMenuVehicle(null);
    setOdometerVehicle(vehicle);
    setOdometerForm(getOdometerForm(vehicle));
    setOdometerError('');
  }

  function closeOdometerEditor() {
    setOdometerVehicle(null);
    setOdometerForm(getOdometerForm(null));
    setOdometerError('');
  }

  function updateOdometerField(field, value) {
    setOdometerForm((current) => ({
      ...current,
      [field]: value,
      confirmedLower: field === 'odometer_reading' ? false : current.confirmedLower
    }));
  }

  async function submitOdometerUpdate() {
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

    setIsSavingOdometer(true);
    try {
      await api.post(`/vehicles/${odometerVehicle.id}/odometer`, {
        odometer_reading: nextMileage,
        notes: odometerForm.notes || undefined
      }, {
        authMode: 'manager'
      });
      await loadVehicles();
      closeOdometerEditor();
    } catch (_error) {
      setOdometerError('Unable to update odometer.');
    } finally {
      setIsSavingOdometer(false);
    }
  }

  const fleetHeader = (
    <View style={styles.headerStack}>
      <View style={styles.actionRow}>
        <AppButton label="Add Vehicle" onPress={openAddVehicle} style={styles.actionButton} />
        <AppButton
          label={isImportingVehicles ? 'Importing' : 'Import Vehicles'}
          onPress={importVehicles}
          style={styles.actionButton}
          variant="outline"
        />
      </View>
      {vehicleImportMessage ? <Text style={styles.importMessage}>{vehicleImportMessage}</Text> : null}
      <View style={styles.searchCard}>
        <RouteMetricIcon color={appTheme.colors.charcoalSoft} name="vehicles" size={appTheme.icons.sm} />
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearchTerm}
          placeholder="Search trucks by number or description"
          placeholderTextColor={appTheme.colors.textTertiary}
          style={styles.searchInput}
          value={searchTerm}
        />
      </View>
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setStatusFilter(item.key)}
            style={[styles.filterChip, statusFilter === item.key ? styles.filterChipActive : null]}
          >
            <Text style={[styles.filterChipText, statusFilter === item.key ? styles.filterChipTextActive : null]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.resultCount}>{filteredVehicles.length} of {vehicles.length} vehicles</Text>
      {errorMessage ? (
        <ErrorState body="Check your connection and try again." onAction={loadVehicles} title="Couldn’t load vehicles" />
      ) : null}
    </View>
  );

  const header = (
    <View style={styles.headerStack}>
      <SectionTabs activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'Fleet' ? fleetHeader : null}
    </View>
  );

  const maintenanceContent = (
    <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
      {header}
      {maintenanceErrorMessage ? (
        <ErrorState body="Check your connection and try again." onAction={loadMaintenanceOverview} title="Couldn’t load maintenance" />
      ) : null}
      {activeTab === 'Maintenance' ? (
        <MaintenanceProgramPanel
          isLoading={isLoadingMaintenance}
          isSaving={isSavingMaintenanceSettings}
          onChangeSetting={updateMaintenanceSetting}
          onSave={saveMaintenanceSettings}
          records={maintenanceRecords}
          settings={maintenanceSettings}
          settingsErrorMessage={maintenanceSettingsErrorMessage}
        />
      ) : null}
      {activeTab === 'Inspections' ? (
        <InspectionsPanel
          checklistTemplate={checklistTemplate}
          isLoading={isLoadingMaintenance}
          requirements={maintenanceRequirements}
        />
      ) : null}
      {activeTab === 'Settings' ? (
        <MaintenanceSettingsPanel
          checklistTemplate={checklistTemplate}
          checklistTemplateErrorMessage={checklistTemplateErrorMessage}
          isLoading={isLoadingMaintenance}
          isSavingChecklistTemplate={isSavingChecklistTemplate}
          isSavingRequirements={isSavingRequirements}
          isSavingReminderSchedule={isSavingReminderSchedule}
          onChangeCustomDaily={updateCustomDailyRequirement}
          onChangeCustomWeekly={updateCustomWeeklyRequirement}
          onChangeReminderSchedule={updateReminderSchedule}
          onChangeRequirementMode={updateRequirementMode}
          onChangeWeeklyDay={updateRequirementWeeklyDay}
          onSaveChecklistTemplate={saveChecklistTemplate}
          onSaveRequirements={saveMaintenanceRequirements}
          onSaveReminderSchedule={saveReminderSchedule}
          onToggleChecklistField={toggleChecklistField}
          reminderSchedule={reminderSchedule}
          reminderScheduleErrorMessage={reminderScheduleErrorMessage}
          requirementErrorMessage={requirementErrorMessage}
          requirements={maintenanceRequirements}
          settings={maintenanceSettings}
        />
      ) : null}
    </ScrollView>
  );

  return (
    <>
      <ManagerSectionLayout
        compact
        eyebrow="ReadyRoute"
        scrollEnabled={false}
        subtitle={identity?.companyName || 'Fleet inventory'}
        title="Vehicles"
        tone="light"
      >
        {activeTab === 'Fleet' ? (
          <FlatList
            ListEmptyComponent={!errorMessage ? (
              isLoading ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color={appTheme.colors.orange} size="large" />
                  <Text style={styles.loadingText}>Loading vehicles</Text>
                </View>
              ) : (
                <AppCard style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>{vehicles.length ? 'No matching vehicles' : 'No vehicles yet'}</Text>
                  <Text style={styles.emptyBody}>
                    {vehicles.length ? 'Try another vehicle search or status filter.' : 'Vehicles will appear here after they are added in ReadyRoute.'}
                  </Text>
                </AppCard>
              )
            ) : null}
            ListHeaderComponent={header}
            contentContainerStyle={styles.listContent}
            data={!isLoading && !errorMessage ? filteredVehicles : []}
            keyExtractor={(item, index) => String(item.id || item.name || index)}
            renderItem={({ item }) => (
              <VehicleCard
                onEditActions={setServiceMenuVehicle}
                onViewActions={setViewMenuVehicle}
                vehicle={item}
              />
            )}
            showsVerticalScrollIndicator={false}
          />
        ) : maintenanceContent}
      </ManagerSectionLayout>

      <EditVehicleModal
        errorMessage={vehicleError}
        form={vehicleForm}
        isSaving={isSavingVehicle}
        mode={vehicleModalMode}
        onChange={updateVehicleField}
        onClose={closeEditVehicle}
        onSubmit={submitVehicleEdit}
        vehicle={editingVehicle}
        visible={Boolean(editingVehicle)}
      />
      <EditTruckActionsModal
        onAddService={() => openServiceRecord(serviceMenuVehicle)}
        onClose={() => setServiceMenuVehicle(null)}
        onEditInfo={() => openEditVehicle(serviceMenuVehicle)}
        onEditOdometer={() => openOdometerEditor(serviceMenuVehicle)}
        onUpdateRegistration={() => openEditVehicle(serviceMenuVehicle)}
        vehicle={serviceMenuVehicle}
      />
      <ViewTruckActionsModal
        onClose={() => setViewMenuVehicle(null)}
        onViewHistory={() => openServiceHistory(viewMenuVehicle)}
        vehicle={viewMenuVehicle}
      />
      <OdometerModal
        errorMessage={odometerError}
        form={odometerForm}
        isSaving={isSavingOdometer}
        onChange={updateOdometerField}
        onClose={closeOdometerEditor}
        onConfirmLower={(confirmedLower) => setOdometerForm((current) => ({ ...current, confirmedLower }))}
        onSubmit={submitOdometerUpdate}
        vehicle={odometerVehicle}
      />
      <ServiceRecordModal
        errorMessage={serviceError}
        form={serviceForm}
        isSaving={isSavingService}
        onChange={updateServiceField}
        onClose={closeServiceRecord}
        onSubmit={submitServiceRecord}
        vehicle={serviceVehicle}
      />
      <ServiceHistoryModal
        history={history}
        isLoading={isLoadingHistory}
        onClose={() => setHistoryVehicle(null)}
        vehicle={historyVehicle}
      />
    </>
  );
}

export {
  filterVehicles,
  formatDate,
  formatMileage,
  getAssignedDriverLabel,
  getLastServiceSummary,
  getRegistrationStatus,
  getStatusMeta,
  getVehicleDescription,
  getVehicleForm,
  getTodayDateParam
};

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
    paddingBottom: appTheme.spacing.xl
  },
  headerStack: {
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs
  },
  sectionTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs
  },
  sectionTab: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: appTheme.spacing.sm
  },
  sectionTabActive: {
    backgroundColor: appTheme.colors.orange,
    borderColor: appTheme.colors.orange
  },
  sectionTabText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  sectionTabTextActive: {
    color: appTheme.colors.textInverse
  },
  actionRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  actionButton: {
    flex: 1
  },
  importMessage: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  searchCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    minHeight: 46,
    paddingHorizontal: appTheme.spacing.md
  },
  searchInput: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.semibold,
    minHeight: 44
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  filterChip: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 12
  },
  filterChipActive: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange
  },
  filterChipText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  filterChipTextActive: {
    color: appTheme.colors.orangeDeep
  },
  resultCount: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  loadingState: {
    alignItems: 'center',
    gap: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xl
  },
  loadingText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall
  },
  vehicleRow: {
    alignItems: 'stretch',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  panelStack: {
    gap: appTheme.spacing.sm
  },
  managerMaintenanceCard: {
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.lg
  },
  panelTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  panelBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  panelCaption: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.caption
  },
  settingsList: {
    gap: appTheme.spacing.xs
  },
  settingRow: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  settingRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    justifyContent: 'space-between'
  },
  settingTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  settingName: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  settingMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold,
    marginTop: 3
  },
  inlineFieldRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  inlineField: {
    flex: 1,
    gap: appTheme.spacing.xxs
  },
  inlineInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    minHeight: 38,
    paddingHorizontal: appTheme.spacing.sm
  },
  recordsList: {
    gap: appTheme.spacing.xs
  },
  recordRow: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: 3,
    padding: appTheme.spacing.md
  },
  recordRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    justifyContent: 'space-between'
  },
  recordTitle: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  recordDate: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  recordService: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  recordMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  recordNotes: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold,
    marginTop: 2
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  summaryTile: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 132,
    padding: appTheme.spacing.md
  },
  vehicleRowMain: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0
  },
  vehicleCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'space-between'
  },
  vehicleName: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  vehicleDescription: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    marginTop: 1
  },
  vehicleListMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  vehicleMetaText: {
    color: appTheme.colors.textSecondary,
    flexShrink: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  vehicleMetaDot: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  vehicleActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    justifyContent: 'space-between'
  },
  compactEditButton: {
    alignItems: 'center',
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: appTheme.spacing.sm
  },
  compactEditButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: appTheme.spacing.sm
  },
  statusBadgeactive: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: '#a7e2c2'
  },
  statusBadgecomplete: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: '#a7e2c2'
  },
  statusBadgewarning: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: '#ffd3a6'
  },
  statusBadgeneutral: {
    backgroundColor: appTheme.colors.grayBadge,
    borderColor: appTheme.colors.borderStrong
  },
  statusBadgeText: {
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  statusBadgeTextactive: {
    color: appTheme.colors.greenText
  },
  statusBadgeTextcomplete: {
    color: appTheme.colors.greenText
  },
  statusBadgeTextwarning: {
    color: appTheme.colors.warningText
  },
  statusBadgeTextneutral: {
    color: appTheme.colors.grayBadgeText
  },
  odometerSummary: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  summaryLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  checklistList: {
    gap: appTheme.spacing.xs
  },
  checklistRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  checklistRowDisabled: {
    backgroundColor: appTheme.colors.surfaceMuted,
    opacity: 0.74
  },
  checklistNumber: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    minWidth: 22
  },
  checklistCopy: {
    flex: 1,
    minWidth: 0
  },
  checklistDot: {
    color: appTheme.colors.greenText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  checklistText: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  summaryValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginTop: 2
  },
  requirementOptionsList: {
    gap: appTheme.spacing.xs
  },
  requirementOptionCard: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  requirementOptionCardSelected: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange
  },
  requirementOptionTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  requirementOptionLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  requirementBadge: {
    borderRadius: appTheme.radius.pill,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    overflow: 'hidden',
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xxs
  },
  requirementBadgeRecommended: {
    backgroundColor: appTheme.colors.greenSoft,
    color: appTheme.colors.greenText
  },
  requirementBadgeStricter: {
    backgroundColor: appTheme.colors.purpleSoft,
    color: appTheme.colors.purple
  },
  requirementOptionTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.heavy
  },
  requirementOptionDescription: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  requirementListBlock: {
    gap: 2
  },
  requirementListItem: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.caption
  },
  weekdaySelector: {
    gap: appTheme.spacing.xs
  },
  weekdayChips: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    paddingRight: appTheme.spacing.md
  },
  weekdayChip: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: appTheme.spacing.md
  },
  weekdayChipActive: {
    backgroundColor: appTheme.colors.orange,
    borderColor: appTheme.colors.orange
  },
  weekdayChipText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  weekdayChipTextActive: {
    color: appTheme.colors.textInverse
  },
  customRequirements: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  customRequirementsHeading: {
    marginTop: appTheme.spacing.xs
  },
  checkToggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    minHeight: 32
  },
  checkToggleRowCompact: {
    flexShrink: 0,
    minHeight: 28
  },
  checkToggleText: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  checkToggleTextCompact: {
    flex: 0,
    fontSize: appTheme.typography.caption
  },
  warningBox: {
    backgroundColor: '#fffbeb',
    borderColor: '#f59e0b',
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs,
    padding: appTheme.spacing.md
  },
  warningText: {
    color: '#92400e',
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: 20
  },
  confirmRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  checkboxMark: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: 5,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 22
  },
  checkboxMarkActive: {
    backgroundColor: appTheme.colors.orange,
    borderColor: appTheme.colors.orange
  },
  checkboxMarkText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  confirmText: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  emptyCard: {
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.lg
  },
  emptyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  emptyBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 23, 31, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: appTheme.spacing.lg
  },
  modalCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.lg,
    maxHeight: '88%',
    maxWidth: 560,
    padding: appTheme.spacing.lg,
    width: '100%'
  },
  smallModalCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.lg,
    maxWidth: 420,
    padding: appTheme.spacing.lg,
    width: '100%'
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: appTheme.spacing.sm
  },
  modalTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  modalSubtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    marginTop: 2
  },
  closeButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  closeButtonText: {
    color: appTheme.colors.textSecondary,
    fontSize: 24,
    fontWeight: appTheme.typography.weights.heavy
  },
  modalScrollContent: {
    paddingBottom: appTheme.spacing.xs
  },
  fieldGroup: {
    gap: 5,
    marginBottom: appTheme.spacing.xs
  },
  fieldLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  textInput: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    minHeight: 44,
    paddingHorizontal: appTheme.spacing.md
  },
  textArea: {
    minHeight: 86,
    paddingTop: appTheme.spacing.sm,
    textAlignVertical: 'top'
  },
  modalError: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.sm
  },
  modalActions: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.sm
  },
  modalActionButton: {
    flex: 1
  },
  saveButton: {
    alignItems: 'center',
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.buttons.radius,
    flex: 1,
    justifyContent: 'center',
    minHeight: appTheme.buttons.height,
    paddingHorizontal: appTheme.buttons.horizontalPadding
  },
  saveButtonDisabled: {
    opacity: 0.7
  },
  saveButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  truckActionList: {
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.md
  },
  truckActionRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: appTheme.spacing.md
  },
  truckActionRowPrimary: {
    backgroundColor: appTheme.colors.orange,
    borderColor: appTheme.colors.orange
  },
  truckActionRowDisabled: {
    opacity: 0.65
  },
  truckActionRowText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  truckActionRowTextPrimary: {
    color: appTheme.colors.textInverse
  },
  truckActionRowTextDisabled: {
    color: appTheme.colors.textSecondary
  },
  truckActionRowMeta: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  menuActionButton: {
    marginTop: appTheme.spacing.sm
  },
  historyList: {
    gap: appTheme.spacing.xs
  },
  historyRow: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    padding: appTheme.spacing.md
  },
  historyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  historyMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    marginTop: 3
  },
  pressed: {
    opacity: 0.86
  }
});
