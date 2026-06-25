import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import ManagerSectionLayout from '../components/ManagerSectionLayout';
import AppButton from '../components/ui/AppButton';
import AppCard from '../components/ui/AppCard';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import KeyboardAwareModal from '../components/ui/KeyboardAwareModal';
import StatusBadge from '../components/ui/StatusBadge';
import api from '../services/api';
import appTheme from '../theme/appTheme';
import { getApiErrorMessage } from '../utils/apiError';

const EMPTY_FORM = {
  id: '',
  display_address: '',
  property_name: '',
  property_type: '',
  building: '',
  access_code: '',
  access_note: '',
  parking_note: '',
  entry_note: '',
  shared_note: ''
};

function toForm(row = {}) {
  return {
    id: row.id || '',
    display_address: row.display_address || '',
    property_name: row.property_name || '',
    property_type: row.property_type || '',
    building: row.building || '',
    access_code: row.access_code || '',
    access_note: row.access_note || '',
    parking_note: row.parking_note || '',
    entry_note: row.entry_note || '',
    shared_note: row.shared_note || ''
  };
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function Field({ editable = true, label, multiline = false, onChangeText, placeholder, value }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        editable={editable}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={appTheme.colors.textTertiary}
        style={[styles.input, multiline ? styles.multilineInput : null, !editable ? styles.inputDisabled : null]}
        value={value}
      />
    </View>
  );
}

function AccessCodeCard({ item, onEdit }) {
  const note = item.entry_note || item.access_note || item.shared_note || '';

  return (
    <AppCard style={styles.rowCard}>
      <View style={styles.rowHeader}>
        <View style={styles.rowMain}>
          <Text numberOfLines={2} style={styles.addressText}>{item.display_address || item.normalized_address || 'No address'}</Text>
          <Text numberOfLines={1} style={styles.propertyText}>{item.property_name || item.building || 'No property label yet'}</Text>
        </View>
        <Pressable onPress={() => onEdit(item)} style={({ pressed }) => [styles.editButton, pressed ? styles.pressed : null]}>
          <Text style={styles.editButtonText}>Edit</Text>
        </Pressable>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Access</Text>
        <Text style={item.access_code ? styles.codeText : styles.detailValue}>{item.access_code || 'No code saved'}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Notes</Text>
        <Text numberOfLines={3} style={styles.detailValue}>{note || 'No notes'}</Text>
      </View>
      <StatusBadge label={item.access_code ? 'Confirmed' : 'Needs code'} tone={item.access_code ? 'active' : 'warning'} style={styles.statusBadge} />
    </AppCard>
  );
}

export default function ManagerAccessCodesScreen({ csaWorkspaceVersion = 0, identity }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function loadAccessCodes({ refreshing = false } = {}) {
    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage('');

    try {
      const response = await api.get('/manager/property-intel', { authMode: 'manager' });
      setRows(response.data?.property_intel || []);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Unable to load access codes.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadAccessCodes();
  }, [csaWorkspaceVersion]);

  const filteredRows = useMemo(() => {
    const searchValue = normalizeSearch(search);
    if (!searchValue) {
      return rows;
    }

    return rows.filter((row) => [
      row.display_address,
      row.normalized_address,
      row.property_name,
      row.building,
      row.access_code,
      row.access_note,
      row.entry_note,
      row.shared_note
    ].some((value) => normalizeSearch(value).includes(searchValue)));
  }, [rows, search]);

  const codedCount = rows.filter((row) => row.access_code).length;

  function openAddEditor() {
    setForm(EMPTY_FORM);
    setSuccessMessage('');
    setErrorMessage('');
    setIsEditorOpen(true);
  }

  function openEditEditor(row) {
    setForm(toForm(row));
    setSuccessMessage('');
    setErrorMessage('');
    setIsEditorOpen(true);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveAccessCode() {
    const address = form.display_address.trim();
    const accessCode = form.access_code.trim();
    const accessNote = form.access_note.trim();
    const entryNote = form.entry_note.trim();

    if (!address) {
      setErrorMessage('Address is required.');
      return;
    }

    if (!accessCode && !accessNote && !entryNote && !form.parking_note.trim() && !form.shared_note.trim()) {
      setErrorMessage('Add an access code or note before saving.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    const payload = {
      property_name: form.property_name.trim(),
      property_type: form.property_type.trim(),
      building: form.building.trim(),
      access_code: accessCode,
      access_code_source: 'manager',
      access_note: accessNote || entryNote,
      parking_note: form.parking_note.trim(),
      entry_note: entryNote,
      shared_note: form.shared_note.trim(),
      warning_flags: accessCode || accessNote || entryNote ? ['gate'] : []
    };

    try {
      if (form.id) {
        await api.patch(`/manager/property-intel/${form.id}`, payload, { authMode: 'manager' });
      } else {
        await api.post('/manager/property-intel', { address, ...payload }, { authMode: 'manager' });
      }

      setSuccessMessage('Access code saved.');
      setIsEditorOpen(false);
      await loadAccessCodes();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Unable to save access code.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ManagerSectionLayout
      actions={<AppButton label="Add" onPress={openAddEditor} />}
      eyebrow="Property Intel"
      subtitle={`${identity?.companyName || 'Current CSA'} reusable gate codes and entry notes`}
      title="Access Codes"
      tone="light"
    >
      <View style={styles.summaryGrid}>
        <AppCard style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{rows.length}</Text>
          <Text style={styles.summaryLabel}>Properties</Text>
        </AppCard>
        <AppCard style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{codedCount}</Text>
          <Text style={styles.summaryLabel}>With codes</Text>
        </AppCard>
      </View>

      {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
      {errorMessage && !isLoading ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <TextInput
        autoCapitalize="none"
        onChangeText={setSearch}
        placeholder="Search address, property, code, or note"
        placeholderTextColor={appTheme.colors.textTertiary}
        style={styles.searchInput}
        value={search}
      />

      {isLoading ? (
        <AppCard style={styles.loadingCard}>
          <ActivityIndicator color={appTheme.colors.orange} />
          <Text style={styles.loadingText}>Loading access codes</Text>
        </AppCard>
      ) : errorMessage ? (
        <ErrorState body={errorMessage} onAction={loadAccessCodes} title="Couldn’t load access codes" />
      ) : filteredRows.length ? (
        <FlatList
          data={filteredRows}
          keyExtractor={(item) => item.id || item.normalized_address || item.display_address}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadAccessCodes({ refreshing: true })} />}
          renderItem={({ item }) => <AccessCodeCard item={item} onEdit={openEditEditor} />}
          scrollEnabled={false}
        />
      ) : (
        <EmptyState
          body={rows.length ? 'Try another search.' : 'Saved access codes will appear here after they are added.'}
          title="No access codes found"
        />
      )}

      <KeyboardAwareModal animationType="slide" onClose={() => setIsEditorOpen(false)} visible={isEditorOpen}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{form.id ? 'Edit Access Code' : 'Add Access Code'}</Text>
                <Text style={styles.modalSubtitle}>Saved here is available to managers and drivers.</Text>
              </View>
              <Pressable accessibilityLabel="Close access code editor" onPress={() => setIsEditorOpen(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={styles.modalContent}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.modalScroll}
            >
              <Field
                editable={!form.id}
                label="Address"
                onChangeText={(value) => updateForm('display_address', value)}
                placeholder="101 S Spruce St"
                value={form.display_address}
              />
              <Field label="Access code" onChangeText={(value) => updateForm('access_code', value)} placeholder="#2511" value={form.access_code} />
              <Field label="Entry note" multiline onChangeText={(value) => updateForm('entry_note', value)} placeholder="Use north gate or left call box" value={form.entry_note} />
              <Field label="Driver note" multiline onChangeText={(value) => updateForm('access_note', value)} placeholder="Short note drivers should see" value={form.access_note} />
              <Field label="Property name" onChangeText={(value) => updateForm('property_name', value)} placeholder="Apartment or business name" value={form.property_name} />
              <Field label="Building" onChangeText={(value) => updateForm('building', value)} placeholder="Building A" value={form.building} />
              <Field label="Property type" onChangeText={(value) => updateForm('property_type', value)} placeholder="Apartment, business, house" value={form.property_type} />
              <Field label="Parking note" multiline onChangeText={(value) => updateForm('parking_note', value)} placeholder="Visitor parking, loading dock, etc." value={form.parking_note} />
              <Field label="Shared note" multiline onChangeText={(value) => updateForm('shared_note', value)} placeholder="Anything reusable for this property" value={form.shared_note} />
              <Pressable
                disabled={isSaving}
                onPress={saveAccessCode}
                style={({ pressed }) => [styles.saveButton, isSaving ? styles.saveButtonDisabled : null, pressed && !isSaving ? styles.pressed : null]}
              >
                {isSaving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveButtonText}>Save access code</Text>}
              </Pressable>
            </ScrollView>
      </KeyboardAwareModal>
    </ManagerSectionLayout>
  );
}

const styles = StyleSheet.create({
  summaryGrid: {
    flexDirection: 'row',
    gap: appTheme.spacing.sm
  },
  summaryCard: {
    flex: 1,
    padding: appTheme.spacing.md
  },
  summaryValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.statValue,
    fontWeight: appTheme.typography.weights.heavy
  },
  summaryLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  searchInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    minHeight: 48,
    paddingHorizontal: appTheme.spacing.md
  },
  loadingCard: {
    alignItems: 'center',
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.lg
  },
  loadingText: {
    color: appTheme.colors.textSecondary,
    fontWeight: appTheme.typography.weights.heavy
  },
  rowCard: {
    gap: appTheme.spacing.md,
    marginBottom: appTheme.spacing.sm,
    padding: appTheme.spacing.md
  },
  rowHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: appTheme.spacing.md
  },
  rowMain: {
    flex: 1
  },
  addressText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.bodyLarge
  },
  propertyText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginTop: 2
  },
  editButton: {
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  editButtonText: {
    color: appTheme.colors.textPrimary,
    fontWeight: appTheme.typography.weights.heavy
  },
  detailRow: {
    gap: 2
  },
  detailLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  detailValue: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.semibold
  },
  codeText: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.heavy
  },
  statusBadge: {
    alignSelf: 'flex-start'
  },
  successText: {
    color: appTheme.colors.greenText,
    fontWeight: appTheme.typography.weights.heavy
  },
  errorText: {
    color: appTheme.colors.dangerText,
    fontWeight: appTheme.typography.weights.heavy
  },
  modalBackdrop: {
    backgroundColor: appTheme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end'
  },
  modalCard: {
    backgroundColor: appTheme.colors.surface,
    borderTopLeftRadius: appTheme.radius.xl,
    borderTopRightRadius: appTheme.radius.xl,
    maxHeight: '92%',
    padding: appTheme.spacing.lg
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: appTheme.spacing.md
  },
  modalTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy
  },
  modalSubtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall
  },
  closeButton: {
    padding: appTheme.spacing.sm
  },
  closeButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: 24,
    fontWeight: appTheme.typography.weights.heavy
  },
  modalScroll: {
    flexShrink: 1
  },
  modalContent: {
    gap: appTheme.spacing.md,
    paddingBottom: appTheme.spacing.xl
  },
  fieldGroup: {
    gap: appTheme.spacing.xs
  },
  fieldLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  input: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    minHeight: 46,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  inputDisabled: {
    backgroundColor: appTheme.colors.surfaceTint,
    color: appTheme.colors.textSecondary
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top'
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    minHeight: 48
  },
  saveButtonDisabled: {
    opacity: 0.6
  },
  saveButtonText: {
    color: appTheme.colors.textInverse,
    fontWeight: appTheme.typography.weights.heavy
  },
  pressed: {
    opacity: 0.86
  }
});
