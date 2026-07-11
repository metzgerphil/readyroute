import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import ManagerSectionLayout from '../components/ManagerSectionLayout';
import AppButton from '../components/ui/AppButton';
import AppCard from '../components/ui/AppCard';
import ErrorState from '../components/ui/ErrorState';
import KeyboardAwareModal from '../components/ui/KeyboardAwareModal';
import RouteMetricIcon from '../components/RouteMetricIcon';
import api from '../services/api';
import appTheme from '../theme/appTheme';

function getTodayDateParam() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function formatPhoneDisplay(phone) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone || 'Not recorded';
}

function getFedexDriverId(driver) {
  return String(driver?.fedex_driver_id || '').trim();
}

function formatFedexDriverId(driver) {
  return getFedexDriverId(driver) || 'Not recorded';
}

function getDriverStatus(driver) {
  return driver?.is_active === false
    ? { label: 'Inactive', tone: 'neutral' }
    : { label: 'Active', tone: 'active' };
}

function getRouteDisplay(routeName) {
  return routeName ? `Route ${routeName}` : 'Not assigned';
}

function buildRoutesByDriverId(routes = []) {
  const entries = new Map();

  routes.forEach((route) => {
    if (route?.driver_id && route?.work_area_name) {
      entries.set(route.driver_id, route.work_area_name);
    }
  });

  return entries;
}

function filterDrivers(drivers = [], searchTerm = '') {
  const query = searchTerm.trim().toLowerCase();

  if (!query) {
    return drivers;
  }

  return drivers.filter((driver) => (
    String(driver.name || '').toLowerCase().includes(query) ||
    getFedexDriverId(driver).toLowerCase().includes(query)
  ));
}

function getInitialDriverForm(driver) {
  return {
    id: driver?.id || '',
    name: driver?.name || '',
    email: driver?.email || '',
    date_of_birth: driver?.date_of_birth || '',
    fedex_driver_id: getFedexDriverId(driver),
    phone: driver?.phone || '',
    hourly_rate: driver?.hourly_rate != null ? String(driver.hourly_rate) : '',
    daily_flat_rate: driver?.daily_flat_rate != null ? String(driver.daily_flat_rate) : '',
    pin: '',
    confirmPin: ''
  };
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateDriverForm(form) {
  const errors = {};

  if (!form.name.trim()) {
    errors.name = 'Driver name is required.';
  }

  if (!form.email.trim()) {
    errors.email = 'Driver email is required.';
  } else if (!emailPattern.test(form.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (!/^\d{4}$/.test(String(form.pin))) {
    errors.pin = 'Enter a 4-digit numeric PIN.';
  }

  if (!form.confirmPin) {
    errors.confirmPin = 'Confirm the driver PIN.';
  } else if (form.pin !== form.confirmPin) {
    errors.confirmPin = 'PINs must match.';
  }

  return errors;
}

const DRIVER_DOCUMENT_TYPES = [
  { key: 'driver_license', label: 'Driver License', required: true, expires: true, multiple: false },
  { key: 'mec', label: 'MEC', required: true, expires: true, multiple: false },
  { key: 'qualification_certificate', label: 'Qualification Certificate', required: true, expires: false, multiple: false },
  { key: 'signed_policy', label: 'Signed Policy', required: true, expires: false, multiple: false },
  { key: 'write_up', label: 'Write-ups', required: false, expires: false, multiple: true },
  { key: 'other', label: 'Other Documents', required: false, expires: false, multiple: true }
];

function getDocumentsForType(driver, documentType) {
  return (driver?.documents || []).filter((document) => document.document_type === documentType);
}

function getDocumentStatus(driver, documentType) {
  const definition = DRIVER_DOCUMENT_TYPES.find((type) => type.key === documentType);
  const documents = getDocumentsForType(driver, documentType);

  if (!documents.length) {
    return definition?.required
      ? { label: 'Missing', tone: 'danger' }
      : { label: 'Optional', tone: 'neutral' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const warningDate = new Date(today);
  warningDate.setDate(warningDate.getDate() + 30);

  if (documents.some((document) => {
    if (!document.expires_on) return false;
    return new Date(`${document.expires_on}T00:00:00`) < today;
  })) {
    return { label: 'Expired', tone: 'danger' };
  }

  if (documents.some((document) => {
    if (!document.expires_on) return false;
    const expiresAt = new Date(`${document.expires_on}T00:00:00`);
    return expiresAt >= today && expiresAt <= warningDate;
  })) {
    return { label: 'Expiring soon', tone: 'warning' };
  }

  return { label: documents.length > 1 ? `${documents.length} files` : 'Uploaded', tone: 'success' };
}

function getDocumentSummaryLabel(driver) {
  const summary = driver?.document_summary;
  if (!summary) {
    return 'Docs not started';
  }
  if (summary.expired > 0) {
    return `${summary.expired} expired`;
  }
  if (summary.expiring_soon > 0) {
    return `${summary.expiring_soon} expiring`;
  }
  if (summary.missing_required?.length) {
    return `${summary.required_complete}/${summary.required_total} docs`;
  }
  return 'Docs complete';
}

function getDocumentSummaryTone(driver) {
  const summary = driver?.document_summary;
  if (!summary || summary.expired > 0 || summary.missing_required?.length) {
    return 'danger';
  }
  if (summary.expiring_soon > 0) {
    return 'warning';
  }
  return 'success';
}

function getComplianceLabel(driver) {
  const summary = driver?.document_summary;
  if (!summary) return 'Needs documents';
  if (summary.expired > 0) return 'Expired documents';
  if (summary.expiring_soon > 0) return 'Expiring soon';
  if (summary.missing_required?.length) return 'Needs documents';
  return 'Ready';
}

function Field({ editable = true, error, keyboardType, label, onChangeText, placeholder, secureTextEntry = false, value }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        editable={editable}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={appTheme.colors.textTertiary}
        secureTextEntry={secureTextEntry}
        style={[styles.textInput, !editable ? styles.textInputDisabled : null, error ? styles.textInputError : null]}
        value={value}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function StatusChip({ label, tone = 'neutral' }) {
  return (
    <View style={[styles.statusChip, styles[`statusChip_${tone}`] || styles.statusChip_neutral]}>
      <Text style={[styles.statusChipText, styles[`statusChipText_${tone}`] || styles.statusChipText_neutral]}>
        {label}
      </Text>
    </View>
  );
}

function DriverCard({ driver, onEdit, onOpen, routeToday }) {
  const routeLabel = getRouteDisplay(routeToday);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(driver)}
      style={({ pressed }) => [
        styles.driverRow,
        pressed ? styles.pressed : null
      ]}
    >
      <View style={styles.driverRowMain}>
        <Text numberOfLines={1} style={styles.driverName}>{driver.name || 'Unnamed driver'}</Text>
        <Text numberOfLines={1} style={styles.driverSubline}>FedEx ID: {formatFedexDriverId(driver)}</Text>
        <Text numberOfLines={1} style={styles.driverDetailValue}>{formatPhoneDisplay(driver.phone)}</Text>
        <StatusChip label={getDocumentSummaryLabel(driver)} tone={getDocumentSummaryTone(driver)} />
      </View>
      <View style={styles.driverRowSide}>
        <Text numberOfLines={1} style={routeToday ? styles.driverRouteValue : styles.driverDetailMuted}>
          {routeLabel}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => onEdit(driver)}
          style={({ pressed }) => [
            styles.compactEditButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Text style={styles.compactEditButtonText}>Edit</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function DriverDocumentList({
  activeUploadDraft,
  driver,
  documentUploadError,
  isUploadingDocument,
  onChooseCameraRollFile,
  onChooseDocumentFile,
  onOpenDocument,
  onRemoveDocument,
  onUploadDocument
}) {
  return (
    <View style={styles.pinSection}>
      <Text style={styles.pinSectionTitle}>Driver Documents</Text>
      <Text style={styles.pinHelp}>Upload required driver files here. Write-ups and other documents can hold multiple files.</Text>
      {DRIVER_DOCUMENT_TYPES.map((documentType) => {
        const documents = getDocumentsForType(driver, documentType.key);
        const status = getDocumentStatus(driver, documentType.key);
        const isActiveUpload = activeUploadDraft?.driverId === driver?.id && activeUploadDraft?.documentType?.key === documentType.key;
        return (
          <View key={documentType.key} style={styles.documentSlot}>
            <View style={styles.documentSlotHeader}>
              <View style={styles.documentSlotTitleGroup}>
                <Text style={styles.documentSlotTitle}>{documentType.label}</Text>
                <Text style={styles.documentSlotSubtitle}>
                  {documentType.required ? 'Required' : 'Optional'}{documentType.multiple ? ' · multiple files' : ''}{documents.length ? ` · ${documents.length} file${documents.length === 1 ? '' : 's'}` : ''}
                </Text>
              </View>
              <StatusChip label={status.label} tone={status.tone} />
            </View>
            {documents.map((document) => (
              <View key={document.id} style={styles.documentFileRow}>
                <Pressable onPress={() => onOpenDocument(document)} style={styles.documentFileMain}>
                  <Text numberOfLines={1} style={styles.documentFileName}>{document.file_name}</Text>
                  <Text numberOfLines={2} style={styles.documentFileMeta}>
                    {document.expires_on ? `Expires ${document.expires_on}` : 'No expiration'}
                    {document.notes ? ` · ${document.notes}` : ''}
                  </Text>
                </Pressable>
                <Pressable onPress={() => onRemoveDocument(document)} style={styles.documentRemoveButton}>
                  <Text style={styles.documentRemoveButtonText}>Remove</Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              disabled={isUploadingDocument}
              onPress={() => onUploadDocument(documentType)}
              style={({ pressed }) => [
                styles.documentUploadButton,
                styles.documentUploadButtonFull,
                pressed ? styles.pressed : null,
                isUploadingDocument ? styles.saveButtonDisabled : null
              ]}
            >
              <Text style={styles.documentUploadButtonText}>
                {isActiveUpload ? 'Hide options' : documents.length && !documentType.multiple ? 'Replace' : 'Upload'}
              </Text>
            </Pressable>
            {isActiveUpload ? (
              <View style={styles.uploadSourcePanel}>
                <View style={styles.uploadSourceRow}>
                  <Pressable
                    disabled={isUploadingDocument}
                    onPress={onChooseDocumentFile}
                    style={({ pressed }) => [
                      styles.uploadSourceButton,
                      styles.uploadSourceButtonPrimary,
                      pressed ? styles.pressed : null,
                      isUploadingDocument ? styles.saveButtonDisabled : null
                    ]}
                  >
                    <Text style={[styles.uploadSourceButtonText, styles.uploadSourceButtonTextPrimary]}>Files</Text>
                  </Pressable>
                  <Pressable
                    disabled={isUploadingDocument}
                    onPress={onChooseCameraRollFile}
                    style={({ pressed }) => [
                      styles.uploadSourceButton,
                      pressed ? styles.pressed : null,
                      isUploadingDocument ? styles.saveButtonDisabled : null
                    ]}
                  >
                    <Text style={styles.uploadSourceButtonText}>Camera Roll</Text>
                  </Pressable>
                </View>

                {documentUploadError ? <Text style={styles.modalError}>{documentUploadError}</Text> : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function DriverProfileModal({
  activeUploadDraft,
  driver,
  documentUploadError,
  isUploadingDocument,
  onClose,
  onEdit,
  onOpenDocument,
  onRemoveDocument,
  onChooseCameraRollFile,
  onChooseDocumentFile,
  onUploadDocument,
  routeToday,
  visible
}) {
  if (!driver) return null;

  const status = getDriverStatus(driver);

  return (
    <KeyboardAwareModal onClose={onClose} visible={visible}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleGroup}>
              <Text style={styles.modalTitle}>{driver.name || 'Unnamed driver'}</Text>
              <Text style={styles.modalSubtitle}>{getRouteDisplay(routeToday)} · {formatPhoneDisplay(driver.phone)}</Text>
            </View>
            <Pressable accessibilityLabel="Close driver profile" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.modalScrollContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <View style={styles.profileHero}>
              <View style={styles.profileInitials}>
                <Text style={styles.profileInitialsText}>
                  {String(driver.name || driver.email || 'D').trim().slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileHeroText}>
                <Text numberOfLines={1} style={styles.profileHeroTitle}>{driver.email || 'No email recorded'}</Text>
                <Text style={styles.profileHeroSubtitle}>FedEx ID: {formatFedexDriverId(driver)}</Text>
              </View>
              <StatusChip label={status.label} tone={status.tone} />
            </View>

            <View style={styles.profileMetricGrid}>
              <View style={styles.profileMetricCard}>
                <Text style={styles.profileMetricLabel}>Compliance</Text>
                <Text style={styles.profileMetricValue}>{getComplianceLabel(driver)}</Text>
              </View>
              <View style={styles.profileMetricCard}>
                <Text style={styles.profileMetricLabel}>Date of Birth</Text>
                <Text style={styles.profileMetricValue}>{driver.date_of_birth || 'Not recorded'}</Text>
              </View>
            </View>

            <View style={styles.profileActionRow}>
              <AppButton label="Edit Profile" onPress={() => onEdit(driver)} style={styles.profileActionButton} />
              <AppButton
                label="Call"
                onPress={() => driver.phone && Linking.openURL(`tel:${String(driver.phone).replace(/\D/g, '')}`)}
                style={styles.profileActionButton}
                variant="outline"
              />
            </View>

            <DriverDocumentList
              activeUploadDraft={activeUploadDraft}
              driver={driver}
              documentUploadError={documentUploadError}
              isUploadingDocument={isUploadingDocument}
              onChooseCameraRollFile={onChooseCameraRollFile}
              onChooseDocumentFile={onChooseDocumentFile}
              onOpenDocument={onOpenDocument}
              onRemoveDocument={onRemoveDocument}
              onUploadDocument={onUploadDocument}
            />
          </ScrollView>
    </KeyboardAwareModal>
  );
}

function EditDriverModal({
  activeUploadDraft,
  documentUploadError,
  driver,
  errorMessage,
  fieldErrors,
  form,
  isSaving,
  isUploadingDocument,
  mode = 'edit',
  onChange,
  onChooseCameraRollFile,
  onChooseDocumentFile,
  onClose,
  onOpenDocument,
  onRemoveDocument,
  onUploadDocument,
  onSubmit,
  visible
}) {
  const isEdit = mode === 'edit';

  return (
    <KeyboardAwareModal onClose={onClose} visible={visible}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{isEdit ? 'Edit Driver' : 'Add Driver'}</Text>
              <Text style={styles.modalSubtitle}>
                Enter a 4 digit PIN. Confirm PIN must match.
              </Text>
            </View>
            <Pressable accessibilityLabel="Close edit driver" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.modalScrollContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalScroll}
          >
            <Field
              error={fieldErrors.name}
              label="Driver name"
              onChangeText={(value) => onChange('name', value)}
              placeholder="Driver name"
              value={form.name}
            />
            <Field
              label="Date of birth"
              onChangeText={(value) => onChange('date_of_birth', value)}
              placeholder="YYYY-MM-DD"
              value={form.date_of_birth}
            />
            <Field
              label="FedEx Driver ID"
              onChangeText={(value) => onChange('fedex_driver_id', value)}
              placeholder="FedEx Driver ID"
              value={form.fedex_driver_id}
            />
            <Field
              editable={!isEdit}
              error={fieldErrors.email}
              keyboardType="email-address"
              label="Email"
              onChangeText={(value) => onChange('email', value)}
              placeholder="Email"
              value={form.email}
            />
            <Field
              keyboardType="phone-pad"
              label="Phone number"
              onChangeText={(value) => onChange('phone', value)}
              placeholder="Phone number"
              value={form.phone}
            />

            <View style={styles.pinSection}>
              <Text style={styles.pinSectionTitle}>Compensation</Text>
              <Field
                keyboardType="decimal-pad"
                label="Daily hourly rate"
                onChangeText={(value) => onChange('hourly_rate', value)}
                placeholder="0.00"
                value={form.hourly_rate}
              />
              <Field
                keyboardType="decimal-pad"
                label="Daily flat rate"
                onChangeText={(value) => onChange('daily_flat_rate', value)}
                placeholder="0.00"
                value={form.daily_flat_rate}
              />
            </View>

            <View style={styles.pinSection}>
              <Text style={styles.pinSectionTitle}>PIN reset</Text>
              <Text style={styles.pinHelp}>Enter new 4 digit PIN to reset. Confirm PIN must match.</Text>
              <Field
                error={fieldErrors.pin}
                keyboardType="number-pad"
                label="New 4 digit PIN"
                onChangeText={(value) => onChange('pin', value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4 digit PIN"
                secureTextEntry
                value={form.pin}
              />
              <Field
                error={fieldErrors.confirmPin}
                keyboardType="number-pad"
                label="Confirm PIN"
                onChangeText={(value) => onChange('confirmPin', value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Confirm new PIN"
                secureTextEntry
                value={form.confirmPin}
              />
            </View>

            {isEdit ? (
              <DriverDocumentList
                activeUploadDraft={activeUploadDraft}
                driver={driver}
                documentUploadError={documentUploadError}
                isUploadingDocument={isUploadingDocument}
                onChooseCameraRollFile={onChooseCameraRollFile}
                onChooseDocumentFile={onChooseDocumentFile}
                onOpenDocument={onOpenDocument}
                onRemoveDocument={onRemoveDocument}
                onUploadDocument={onUploadDocument}
              />
            ) : null}
          </ScrollView>

          {errorMessage ? <Text style={styles.modalError}>{errorMessage}</Text> : null}

          <View style={styles.modalActions}>
            <AppButton label="Cancel" onPress={onClose} style={styles.modalActionButton} variant="outline" />
            <Pressable
              disabled={isSaving}
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.saveButton,
                isSaving ? styles.saveButtonDisabled : null,
                pressed ? styles.pressed : null
              ]}
            >
              {isSaving ? (
                <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
    </KeyboardAwareModal>
  );
}

export default function ManagerDriversScreen({ csaWorkspaceVersion = 0, identity }) {
  const [drivers, setDrivers] = useState([]);
  const [routesByDriverId, setRoutesByDriverId] = useState(new Map());
  const [workspaceName, setWorkspaceName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingDriver, setEditingDriver] = useState(null);
  const [profileDriver, setProfileDriver] = useState(null);
  const [modalMode, setModalMode] = useState('edit');
  const [form, setForm] = useState(getInitialDriverForm(null));
  const [formErrors, setFormErrors] = useState({});
  const [modalErrorMessage, setModalErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [documentUploadDraft, setDocumentUploadDraft] = useState(null);
  const [documentUploadError, setDocumentUploadError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const date = getTodayDateParam();

  async function loadDrivers() {
    setIsLoading(true);

    try {
      const [driversResponse, routesResponse] = await Promise.all([
        api.get('/manager/drivers', { authMode: 'manager' }),
        api.get('/manager/routes', {
          authMode: 'manager',
          params: { date }
        })
      ]);

      const nextDrivers = driversResponse.data?.drivers || [];
      setDrivers(nextDrivers);
      setRoutesByDriverId(buildRoutesByDriverId(routesResponse.data?.routes || []));
      setWorkspaceName(routesResponse.data?.account?.company_name || '');
      setErrorMessage('');
      return nextDrivers;
    } catch (_error) {
      setErrorMessage('Unable to load drivers right now.');
      return [];
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDrivers();
  }, [csaWorkspaceVersion]);

  const filteredDrivers = useMemo(() => filterDrivers(drivers, searchTerm), [drivers, searchTerm]);

  function openEditDriver(driver) {
    setEditingDriver(driver);
    setModalMode('edit');
    setForm(getInitialDriverForm(driver));
    setFormErrors({});
    setModalErrorMessage('');
  }

  function openDriverProfile(driver) {
    setProfileDriver(driver);
  }

  function closeDriverProfile() {
    setProfileDriver(null);
  }

  function openEditFromProfile(driver) {
    closeDriverProfile();
    openEditDriver(driver);
  }

  function openAddDriver() {
    setEditingDriver({});
    setModalMode('add');
    setForm(getInitialDriverForm(null));
    setFormErrors({});
    setModalErrorMessage('');
  }

  function closeEditDriver() {
    setEditingDriver(null);
    setForm(getInitialDriverForm(null));
    setFormErrors({});
    setModalErrorMessage('');
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submitDriverEdit() {
    setModalErrorMessage('');
    const nextFormErrors = validateDriverForm(form);

    if (Object.keys(nextFormErrors).length > 0) {
      setFormErrors(nextFormErrors);
      return;
    }

    setFormErrors({});
    setIsSaving(true);

    try {
      if (modalMode === 'add') {
        await api.post('/manager/drivers', {
          name: form.name.trim(),
          email: form.email.trim(),
          date_of_birth: form.date_of_birth.trim() || null,
          fedex_driver_id: form.fedex_driver_id.trim(),
          phone: form.phone.trim(),
          hourly_rate: Number(form.hourly_rate || 0),
          daily_flat_rate: Number(form.daily_flat_rate || 0),
          pin: form.pin
        }, {
          authMode: 'manager'
        });
      } else {
        await api.put(`/manager/drivers/${form.id}`, {
          name: form.name.trim(),
          date_of_birth: form.date_of_birth.trim() || null,
          fedex_driver_id: form.fedex_driver_id.trim(),
          phone: form.phone.trim(),
          hourly_rate: Number(form.hourly_rate || 0),
          daily_flat_rate: Number(form.daily_flat_rate || 0),
          pin: form.pin
        }, {
          authMode: 'manager'
        });
      }
      await loadDrivers();
      closeEditDriver();
    } catch (_error) {
      setModalErrorMessage(modalMode === 'add' ? 'Unable to create driver.' : 'Unable to update driver.');
    } finally {
      setIsSaving(false);
    }
  }

  async function importDrivers() {
    setImportMessage('');
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

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'drivers.csv',
        type: file.mimeType || 'text/csv'
      });
      const response = await api.post('/manager/drivers/import', formData, {
        authMode: 'manager',
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      const summary = response.data || {};
      setImportMessage(`${summary.created || 0} drivers imported. ${summary.skipped || 0} skipped.`);
      await loadDrivers();
    } catch (_error) {
      setImportMessage('Could not import drivers. Check the file and try again.');
    } finally {
      setIsImporting(false);
    }
  }

  function getActiveDocumentDriver() {
    return editingDriver?.id ? editingDriver : profileDriver;
  }

  function openDocumentUpload(documentType) {
    const driver = getActiveDocumentDriver();
    if (!driver?.id) {
      return;
    }

    if (documentUploadDraft?.driverId === driver.id && documentUploadDraft?.documentType?.key === documentType.key) {
      closeDocumentUpload();
      return;
    }

    setDocumentUploadDraft({
      documentType,
      driverId: driver.id
    });
    setDocumentUploadError('');
  }

  function closeDocumentUpload() {
    setDocumentUploadDraft(null);
    setDocumentUploadError('');
  }

  async function chooseDriverDocumentFile() {
    if (!documentUploadDraft) {
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false
    });

    if (result.canceled) {
      return;
    }

    const file = result.assets?.[0];
    if (!file) {
      return;
    }

    await uploadDriverDocumentFile(file, documentUploadDraft);
  }

  async function chooseDriverDocumentFromCameraRoll() {
    if (!documentUploadDraft) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setDocumentUploadError('Allow photo access to choose from camera roll.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      quality: 1
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      return;
    }

    const fallbackName = `${documentUploadDraft.documentType?.key || 'driver-document'}.jpg`;
    await uploadDriverDocumentFile({
      uri: asset.uri,
      name: asset.fileName || fallbackName,
      mimeType: asset.mimeType || 'image/jpeg'
    }, documentUploadDraft);
  }

  async function uploadDriverDocumentFile(file, uploadDraft) {
    if (!uploadDraft?.driverId || !uploadDraft?.documentType) {
      return;
    }

    if (!file) {
      setDocumentUploadError('Choose a file before uploading.');
      return;
    }

    setIsUploadingDocument(true);
    setModalErrorMessage('');
    setDocumentUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name || `${uploadDraft.documentType.key}.pdf`,
        type: file.mimeType || 'application/octet-stream'
      });
      formData.append('document_type', uploadDraft.documentType.key);

      await api.post(`/manager/drivers/${uploadDraft.driverId}/documents`, formData, {
        authMode: 'manager',
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const nextDrivers = await loadDrivers();
      const updatedDriver = nextDrivers.find((driver) => driver.id === uploadDraft.driverId);
      if (updatedDriver) {
        if (editingDriver?.id === updatedDriver.id) {
          setEditingDriver(updatedDriver);
        }
        if (profileDriver?.id === updatedDriver.id) {
          setProfileDriver(updatedDriver);
        }
      }
      closeDocumentUpload();
    } catch (_error) {
      setDocumentUploadError('Unable to upload driver document.');
    } finally {
      setIsUploadingDocument(false);
    }
  }

  async function removeDriverDocument(document) {
    const driver = getActiveDocumentDriver();
    if (!driver?.id || !document?.id) {
      return;
    }

    setIsUploadingDocument(true);
    setModalErrorMessage('');
    try {
      await api.delete(`/manager/drivers/${driver.id}/documents/${document.id}`, {
        authMode: 'manager'
      });
      const nextDrivers = await loadDrivers();
      const updatedDriver = nextDrivers.find((nextDriver) => nextDriver.id === driver.id);
      if (updatedDriver) {
        if (editingDriver?.id === updatedDriver.id) {
          setEditingDriver(updatedDriver);
        }
        if (profileDriver?.id === updatedDriver.id) {
          setProfileDriver(updatedDriver);
        }
      }
    } catch (_error) {
      setModalErrorMessage('Unable to remove driver document.');
    } finally {
      setIsUploadingDocument(false);
    }
  }

  function openDriverDocument(document) {
    const accessUrl = document?.access_url || document?.public_url;
    if (accessUrl) {
      Linking.openURL(accessUrl);
    }
  }

  const header = (
      <View style={styles.headerStack}>
      <View style={styles.actionRow}>
        <AppButton label="Add Driver" onPress={openAddDriver} style={styles.actionButton} />
        <AppButton
          label={isImporting ? 'Importing' : 'Import Drivers'}
          onPress={importDrivers}
          style={styles.actionButton}
          variant="outline"
        />
      </View>
      {importMessage ? <Text style={styles.importMessage}>{importMessage}</Text> : null}
      <View style={styles.searchCard}>
        <RouteMetricIcon color={appTheme.colors.charcoalSoft} name="drivers" size={appTheme.icons.sm} />
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearchTerm}
          placeholder="Search drivers by name or FedEx Driver ID"
          placeholderTextColor={appTheme.colors.textTertiary}
          style={styles.searchInput}
          value={searchTerm}
        />
      </View>
      <Text style={styles.resultCount}>{filteredDrivers.length} of {drivers.length} drivers</Text>
      {errorMessage ? (
        <ErrorState
          body="Check your connection and try again."
          onAction={loadDrivers}
          title="Couldn’t load drivers"
        />
      ) : null}
    </View>
  );

  return (
    <>
      <ManagerSectionLayout
        compact
        eyebrow="ReadyRoute"
        scrollEnabled={false}
        subtitle={workspaceName || identity?.companyName || 'Driver directory'}
        title="Drivers"
        tone="light"
      >
        <FlatList
          ListEmptyComponent={!errorMessage ? (
            isLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color={appTheme.colors.orange} size="large" />
                <Text style={styles.loadingText}>Loading drivers</Text>
              </View>
            ) : (
              <AppCard style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{drivers.length ? 'No matching drivers' : 'No drivers yet'}</Text>
                <Text style={styles.emptyBody}>
                  {drivers.length ? 'Try searching by driver name or FedEx Driver ID.' : 'Drivers will appear here after they are added in ReadyRoute.'}
                </Text>
              </AppCard>
            )
          ) : null}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          data={!isLoading && !errorMessage ? filteredDrivers : []}
          keyExtractor={(item, index) => String(item.id || item.email || index)}
          renderItem={({ item }) => (
            <DriverCard
              driver={item}
              onEdit={openEditDriver}
              onOpen={openDriverProfile}
              routeToday={routesByDriverId.get(item.id)}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      </ManagerSectionLayout>

      <EditDriverModal
        activeUploadDraft={documentUploadDraft}
        documentUploadError={documentUploadError}
        driver={editingDriver}
        errorMessage={modalErrorMessage}
        fieldErrors={formErrors}
        form={form}
        isUploadingDocument={isUploadingDocument}
        isSaving={isSaving}
        mode={modalMode}
        onChange={updateField}
        onChooseCameraRollFile={chooseDriverDocumentFromCameraRoll}
        onChooseDocumentFile={chooseDriverDocumentFile}
        onClose={closeEditDriver}
        onOpenDocument={openDriverDocument}
        onRemoveDocument={removeDriverDocument}
        onUploadDocument={openDocumentUpload}
        onSubmit={submitDriverEdit}
        visible={Boolean(editingDriver)}
      />
      <DriverProfileModal
        activeUploadDraft={documentUploadDraft}
        documentUploadError={documentUploadError}
        driver={profileDriver}
        isUploadingDocument={isUploadingDocument}
        onChooseCameraRollFile={chooseDriverDocumentFromCameraRoll}
        onChooseDocumentFile={chooseDriverDocumentFile}
        onClose={closeDriverProfile}
        onEdit={openEditFromProfile}
        onOpenDocument={openDriverDocument}
        onRemoveDocument={removeDriverDocument}
        onUploadDocument={openDocumentUpload}
        routeToday={profileDriver?.id ? routesByDriverId.get(profileDriver.id) : null}
        visible={Boolean(profileDriver)}
      />
    </>
  );
}

export {
  buildRoutesByDriverId,
  filterDrivers,
  formatFedexDriverId,
  formatPhoneDisplay,
  getDriverStatus,
  getDocumentStatus,
  getInitialDriverForm,
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
  driverRow: {
    alignItems: 'center',
    borderBottomColor: appTheme.colors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    minHeight: 58,
    paddingVertical: appTheme.spacing.xs
  },
  driverRowMain: {
    flex: 1,
    minWidth: 0
  },
  driverRowSide: {
    alignItems: 'flex-end',
    gap: appTheme.spacing.xxs,
    maxWidth: '42%'
  },
  driverName: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  driverSubline: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    marginTop: 2
  },
  compactEditButton: {
    alignItems: 'center',
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 54,
    paddingHorizontal: appTheme.spacing.xs
  },
  compactEditButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  driverDetailValue: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.medium,
    marginTop: 1
  },
  driverDetailMuted: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  driverRouteValue: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
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
    maxWidth: 520,
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
  fieldGroup: {
    gap: 5,
    marginBottom: appTheme.spacing.xs
  },
  modalScroll: {
    flexShrink: 1
  },
  modalScrollContent: {
    paddingBottom: appTheme.spacing.lg
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
  textInputError: {
    borderColor: appTheme.colors.dangerText
  },
  textInputDisabled: {
    color: appTheme.colors.textSecondary
  },
  fieldError: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  textArea: {
    minHeight: 86,
    paddingTop: appTheme.spacing.sm,
    textAlignVertical: 'top'
  },
  pinSection: {
    borderTopColor: appTheme.colors.divider,
    borderTopWidth: 1,
    marginTop: appTheme.spacing.xs,
    paddingTop: appTheme.spacing.sm
  },
  pinSectionTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  pinHelp: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginBottom: appTheme.spacing.sm,
    marginTop: 2
  },
  documentSlot: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.xs,
    padding: appTheme.spacing.sm
  },
  documentSlotHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    justifyContent: 'space-between'
  },
  documentSlotTitleGroup: {
    flex: 1,
    minWidth: 0
  },
  documentSlotTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  documentSlotSubtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold,
    marginTop: 2
  },
  documentUploadButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: appTheme.spacing.sm
  },
  documentUploadButtonFull: {
    alignSelf: 'stretch'
  },
  documentUploadButtonText: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  documentFileRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    justifyContent: 'space-between',
    padding: appTheme.spacing.xs
  },
  documentFileMain: {
    flex: 1,
    minWidth: 0
  },
  documentFileName: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    maxWidth: 230
  },
  documentFileMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    marginTop: 2
  },
  documentRemoveButton: {
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: 4
  },
  documentRemoveButtonText: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  statusChip: {
    alignSelf: 'flex-start',
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    marginTop: appTheme.spacing.xxs,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: 3
  },
  statusChip_success: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: '#bceacc'
  },
  statusChip_warning: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: '#ffd8aa'
  },
  statusChip_danger: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: '#f5b7ae'
  },
  statusChip_active: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: '#bceacc'
  },
  statusChip_neutral: {
    backgroundColor: appTheme.colors.grayBadge,
    borderColor: appTheme.colors.border
  },
  statusChipText: {
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 0.3,
    textTransform: 'uppercase'
  },
  statusChipText_success: {
    color: appTheme.colors.greenText
  },
  statusChipText_warning: {
    color: appTheme.colors.warningText
  },
  statusChipText_danger: {
    color: appTheme.colors.dangerText
  },
  statusChipText_active: {
    color: appTheme.colors.greenText
  },
  statusChipText_neutral: {
    color: appTheme.colors.grayBadgeText
  },
  modalTitleGroup: {
    flex: 1,
    minWidth: 0,
    paddingRight: appTheme.spacing.sm
  },
  profileHero: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.sm,
    padding: appTheme.spacing.sm
  },
  profileInitials: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  profileInitialsText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  profileHeroText: {
    flex: 1,
    minWidth: 0
  },
  profileHeroTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  profileHeroSubtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    marginTop: 2
  },
  profileMetricGrid: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.sm
  },
  profileMetricCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flex: 1,
    padding: appTheme.spacing.sm
  },
  profileMetricLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  profileMetricValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginTop: appTheme.spacing.xxs
  },
  profileActionRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.sm
  },
  profileActionButton: {
    flex: 1
  },
  uploadSourcePanel: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.xs,
    padding: appTheme.spacing.xs
  },
  uploadSourceRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  uploadSourceButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: appTheme.spacing.xs
  },
  uploadSourceButtonPrimary: {
    backgroundColor: appTheme.colors.orange,
    borderColor: appTheme.colors.orange
  },
  uploadSourceButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    textAlign: 'center'
  },
  uploadSourceButtonTextPrimary: {
    color: appTheme.colors.textInverse
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
  pressed: {
    opacity: 0.86
  }
});
