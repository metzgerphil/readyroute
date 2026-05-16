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
    fedex_driver_id: getFedexDriverId(driver),
    phone: driver?.phone || '',
    pin: '',
    confirmPin: ''
  };
}

function Field({ editable = true, keyboardType, label, onChangeText, placeholder, secureTextEntry = false, value }) {
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
        style={[styles.textInput, !editable ? styles.textInputDisabled : null]}
        value={value}
      />
    </View>
  );
}

function DriverCard({ driver, onEdit, routeToday }) {
  const routeLabel = getRouteDisplay(routeToday);

  return (
    <View style={styles.driverRow}>
      <View style={styles.driverRowMain}>
        <Text numberOfLines={1} style={styles.driverName}>{driver.name || 'Unnamed driver'}</Text>
        <Text numberOfLines={1} style={styles.driverSubline}>FedEx ID: {formatFedexDriverId(driver)}</Text>
        <Text numberOfLines={1} style={styles.driverDetailValue}>{formatPhoneDisplay(driver.phone)}</Text>
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
    </View>
  );
}

function EditDriverModal({
  errorMessage,
  form,
  isSaving,
  mode = 'edit',
  onChange,
  onClose,
  onSubmit,
  visible
}) {
  const isEdit = mode === 'edit';

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{isEdit ? 'Edit Driver' : 'Add Driver'}</Text>
              <Text style={styles.modalSubtitle}>
                {isEdit ? 'Leave PIN blank to keep the current PIN.' : 'Leave PIN blank to use the CSA starter PIN.'}
              </Text>
            </View>
            <Pressable accessibilityLabel="Close edit driver" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            <Field
              label="Driver name"
              onChangeText={(value) => onChange('name', value)}
              placeholder="Driver name"
              value={form.name}
            />
            <Field
              label="FedEx Driver ID"
              onChangeText={(value) => onChange('fedex_driver_id', value)}
              placeholder="FedEx Driver ID"
              value={form.fedex_driver_id}
            />
            <Field
              editable={!isEdit}
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
              <Text style={styles.pinSectionTitle}>PIN reset</Text>
              <Text style={styles.pinHelp}>Enter new 4 digit PIN to reset. Confirm PIN must match.</Text>
              <Field
                keyboardType="number-pad"
                label="New 4 digit PIN"
                onChangeText={(value) => onChange('pin', value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Leave blank"
                secureTextEntry
                value={form.pin}
              />
              <Field
                keyboardType="number-pad"
                label="Confirm PIN"
                onChangeText={(value) => onChange('confirmPin', value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Confirm new PIN"
                secureTextEntry
                value={form.confirmPin}
              />
            </View>
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
        </Pressable>
      </Pressable>
    </Modal>
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
  const [modalMode, setModalMode] = useState('edit');
  const [form, setForm] = useState(getInitialDriverForm(null));
  const [modalErrorMessage, setModalErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
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

      setDrivers(driversResponse.data?.drivers || []);
      setRoutesByDriverId(buildRoutesByDriverId(routesResponse.data?.routes || []));
      setWorkspaceName(routesResponse.data?.account?.company_name || '');
      setErrorMessage('');
    } catch (_error) {
      setErrorMessage('Unable to load drivers right now.');
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
    setModalErrorMessage('');
  }

  function openAddDriver() {
    setEditingDriver({});
    setModalMode('add');
    setForm(getInitialDriverForm(null));
    setModalErrorMessage('');
  }

  function closeEditDriver() {
    setEditingDriver(null);
    setForm(getInitialDriverForm(null));
    setModalErrorMessage('');
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitDriverEdit() {
    setModalErrorMessage('');

    if (!form.name.trim() || (modalMode === 'add' && !form.email.trim()) || (modalMode === 'edit' && !form.phone.trim())) {
      setModalErrorMessage(modalMode === 'add' ? 'Driver name and email are required.' : 'Driver name and phone number are required.');
      return;
    }

    if (form.pin || form.confirmPin) {
      if (form.pin !== form.confirmPin) {
        setModalErrorMessage('PINs must match.');
        return;
      }

      if (!/^\d{4}$/.test(String(form.pin))) {
        setModalErrorMessage('PIN must be a 4-digit code.');
        return;
      }
    }

    setIsSaving(true);

    try {
      if (modalMode === 'add') {
        await api.post('/manager/drivers', {
          name: form.name.trim(),
          email: form.email.trim(),
          fedex_driver_id: form.fedex_driver_id.trim(),
          phone: form.phone.trim(),
          pin: form.pin || undefined
        }, {
          authMode: 'manager'
        });
      } else {
        await api.put(`/manager/drivers/${form.id}`, {
          name: form.name.trim(),
          fedex_driver_id: form.fedex_driver_id.trim(),
          phone: form.phone.trim(),
          pin: form.pin || undefined
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
              routeToday={routesByDriverId.get(item.id)}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      </ManagerSectionLayout>

      <EditDriverModal
        errorMessage={modalErrorMessage}
        form={form}
        isSaving={isSaving}
        mode={modalMode}
        onChange={updateField}
        onClose={closeEditDriver}
        onSubmit={submitDriverEdit}
        visible={Boolean(editingDriver)}
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
  modalScrollContent: {
    paddingBottom: appTheme.spacing.xs
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
  textInputDisabled: {
    color: appTheme.colors.textSecondary
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
