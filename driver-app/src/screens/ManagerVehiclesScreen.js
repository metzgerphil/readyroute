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

const SERVICE_TYPE_OPTIONS = [
  'Inspection',
  'Oil Change',
  'Air Filter',
  'Brake Pads',
  'General Repair',
  'Other'
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

function getVehicleDescription(vehicle) {
  return [vehicle?.make, vehicle?.model, vehicle?.year].filter(Boolean).join(' ') || 'Description not recorded';
}

function getRegistrationSummary(vehicle) {
  if (!vehicle?.registration_expiration && !vehicle?.plate) {
    return 'Not recorded';
  }

  const plate = vehicle?.plate || 'Not recorded';
  const expiration = vehicle?.registration_expiration ? formatDate(vehicle.registration_expiration) : '';
  return expiration ? `${plate} • ${expiration}` : plate;
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
    plate: vehicle?.plate || '',
    registration_expiration: vehicle?.registration_expiration || '',
    current_mileage: String(vehicle?.current_mileage || 0),
    notes: vehicle?.notes || ''
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

function VehicleCard({ onEdit, onEditOdometer, onOpenServiceMenu, vehicle }) {
  const assignedDriver = getAssignedDriverLabel(vehicle);
  const routeNumber = vehicle.today_assignment?.work_area_name;

  return (
    <View style={styles.vehicleRow}>
      <View style={styles.vehicleRowMain}>
        <Text numberOfLines={1} style={styles.vehicleName}>{vehicle.name || 'Unnamed vehicle'}</Text>
        <Text numberOfLines={1} style={styles.vehicleDescription}>{getVehicleDescription(vehicle)}</Text>
        <Text numberOfLines={1} style={styles.vehicleMileage}>{formatMileage(vehicle.current_mileage)}</Text>
      </View>

      <View style={styles.vehicleRowSide}>
        <Text numberOfLines={1} style={vehicle.today_assignment ? styles.assignedDriver : styles.vehicleMuted}>
          {assignedDriver}
        </Text>
        {routeNumber ? (
          <Text numberOfLines={1} style={styles.routeValue}>{routeNumber}</Text>
        ) : null}
        <View style={styles.vehicleActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onEditOdometer(vehicle)}
            style={({ pressed }) => [styles.compactEditButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.compactEditButtonText}>Odometer</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onEdit(vehicle)}
            style={({ pressed }) => [styles.compactEditButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.compactEditButtonText}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => onOpenServiceMenu(vehicle)} style={({ pressed }) => [styles.moreButton, pressed ? styles.pressed : null]}>
          <Text style={styles.moreButtonText}>•••</Text>
          </Pressable>
        </View>
      </View>
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
            <Field label="Vehicle ID" onChangeText={(value) => onChange('name', value)} placeholder="Vehicle ID" value={form.name} />
            <Field label="Make" onChangeText={(value) => onChange('make', value)} placeholder="Make" value={form.make} />
            <Field label="Model" onChangeText={(value) => onChange('model', value)} placeholder="Model" value={form.model} />
            <Field keyboardType="number-pad" label="Year" onChangeText={(value) => onChange('year', value.replace(/\D/g, '').slice(0, 4))} placeholder="Year" value={form.year} />
            <Field label="Registration number" onChangeText={(value) => onChange('plate', value.toUpperCase())} placeholder="Registration number" value={form.plate} />
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

function ServiceMenuModal({ onAddService, onClose, onEditOdometer, onViewHistory, vehicle }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(vehicle)}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable style={styles.smallModalCard}>
          <Text style={styles.modalTitle}>{vehicle?.name || 'Vehicle'} Actions</Text>
          <AppButton label="Edit Odometer" onPress={onEditOdometer} style={styles.menuActionButton} variant="outline" />
          <AppButton label="Log Maintenance" onPress={onAddService} style={styles.menuActionButton} variant="outline" />
          <AppButton label="View History" onPress={onViewHistory} style={styles.menuActionButton} variant="outline" />
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
              <Text style={styles.summaryLabel}>Vehicle ID</Text>
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
              <Text style={styles.summaryLabel}>Vehicle ID</Text>
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
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
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

  useEffect(() => {
    loadVehicles();
  }, [csaWorkspaceVersion]);

  const filteredVehicles = useMemo(() => filterVehicles(vehicles, searchTerm, statusFilter), [searchTerm, statusFilter, vehicles]);

  function openEditVehicle(vehicle) {
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
      setVehicleError('Vehicle ID, make, model, year, and registration number are required.');
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
      closeServiceRecord();
    } catch (_error) {
      setServiceError('Unable to save service record.');
    } finally {
      setIsSavingService(false);
    }
  }

  async function openServiceHistory(vehicle) {
    setServiceMenuVehicle(null);
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

  const header = (
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
          placeholder="Search vehicles by ID or description"
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
              onEdit={openEditVehicle}
              onEditOdometer={openOdometerEditor}
              onOpenServiceMenu={setServiceMenuVehicle}
              vehicle={item}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
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
      <ServiceMenuModal
        onAddService={() => openServiceRecord(serviceMenuVehicle)}
        onClose={() => setServiceMenuVehicle(null)}
        onEditOdometer={() => openOdometerEditor(serviceMenuVehicle)}
        onViewHistory={() => openServiceHistory(serviceMenuVehicle)}
        vehicle={serviceMenuVehicle}
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
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    justifyContent: 'space-between',
    marginBottom: appTheme.spacing.xs,
    minHeight: 74,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.xs
  },
  vehicleRowMain: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingRight: appTheme.spacing.xxs
  },
  vehicleRowSide: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 3,
    justifyContent: 'center',
    maxWidth: '44%',
    minWidth: 116
  },
  vehicleName: {
    color: appTheme.colors.orangeDeep,
    fontSize: 20,
    fontWeight: appTheme.typography.weights.heavy
  },
  vehicleDescription: {
    color: appTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: appTheme.typography.weights.semibold,
    marginTop: 1
  },
  vehicleMileage: {
    color: appTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: appTheme.typography.weights.semibold,
    marginTop: 1
  },
  routeValue: {
    color: appTheme.colors.orangeDeep,
    fontSize: 15,
    fontWeight: appTheme.typography.weights.heavy
  },
  assignedDriver: {
    color: appTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: appTheme.typography.weights.heavy,
    textAlign: 'right'
  },
  vehicleMuted: {
    color: appTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: appTheme.typography.weights.semibold,
    textAlign: 'right'
  },
  vehicleActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xxs,
    justifyContent: 'flex-end'
  },
  compactEditButton: {
    alignItems: 'center',
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 26,
    minWidth: 48,
    paddingHorizontal: 8
  },
  compactEditButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: 11,
    fontWeight: appTheme.typography.weights.heavy
  },
  moreButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    width: 34
  },
  moreButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
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
  summaryValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginTop: 2
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
