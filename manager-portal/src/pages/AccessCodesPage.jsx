import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';

import { EmptyState, PageHeader, StatCard } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import api from '../services/api';

const EMPTY_FORM = {
  id: null,
  display_address: '',
  property_name: '',
  property_type: '',
  building: '',
  access_code: '',
  original_access_code: '',
  access_code_source: 'manager',
  access_note: '',
  entry_note: '',
  parking_note: '',
  shared_note: ''
};

const ACCESS_CODE_TEMPLATE_ROWS = [
  ['Address', 'Access Code', 'Entry Note', 'Driver Note', 'Property Name', 'Building', 'Property Type', 'Parking Note', 'Shared Note'],
  ['250 W 15th Ave, Escondido, CA', '#1357', 'Use left call box, then enter through north gate.', '', 'Fifteenth Apartments', 'Building A', 'apartment', '', '']
];

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function toForm(row = {}) {
  return {
    id: row.id || null,
    display_address: row.display_address || '',
    property_name: row.property_name || '',
    property_type: row.property_type || '',
    building: row.building || '',
    access_code: row.access_code || '',
    original_access_code: row.access_code || '',
    access_code_source: row.access_code_source || 'manager',
    access_note: row.access_note || '',
    entry_note: row.entry_note || '',
    parking_note: row.parking_note || '',
    shared_note: row.shared_note || ''
  };
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsvTemplate() {
  const csv = ACCESS_CODE_TEMPLATE_ROWS
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'readyroute-access-code-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function AccessCodeForm({ form, isInline = false, isSaving, onCancel, onChange, onSubmit }) {
  const isNew = !form.id;

  return (
    <form className={isInline ? 'access-code-editor access-code-inline-editor' : 'card access-code-editor'} onSubmit={onSubmit}>
      <div className="section-title-row">
        <div>
          <div className="card-title">{isNew ? 'Add access code' : 'Edit access code'}</div>
          <div className="driver-meta">
            {isNew ? 'Create a reusable property record from a known address.' : form.display_address}
          </div>
        </div>
        <button className="secondary-inline-button" onClick={onCancel} type="button">
          Close
        </button>
      </div>

      <div className="access-code-form-grid">
        <label>
          <span className="field-label">Address</span>
          <input
            className="text-field"
            disabled={!isNew}
            onChange={(event) => onChange('display_address', event.target.value)}
            placeholder="Example: 250 W 15th Ave"
            required
            value={form.display_address}
          />
        </label>
        <label>
          <span className="field-label">Access code</span>
          <input
            className="text-field"
            onChange={(event) => onChange('access_code', event.target.value)}
            placeholder="Example: #1357"
            value={form.access_code}
          />
        </label>
        <label>
          <span className="field-label">Property name</span>
          <input
            className="text-field"
            onChange={(event) => onChange('property_name', event.target.value)}
            placeholder="Optional"
            value={form.property_name}
          />
        </label>
        <label>
          <span className="field-label">Building / group</span>
          <input
            className="text-field"
            onChange={(event) => onChange('building', event.target.value)}
            placeholder="Optional"
            value={form.building}
          />
        </label>
      </div>

      <label>
        <span className="field-label">Entry note</span>
        <textarea
          className="text-field access-code-textarea"
          onChange={(event) => onChange('entry_note', event.target.value)}
          placeholder="Example: Use left call box, then enter through north gate."
          value={form.entry_note}
        />
      </label>

      <label>
        <span className="field-label">Driver note</span>
        <textarea
          className="text-field access-code-textarea"
          onChange={(event) => onChange('access_note', event.target.value)}
          placeholder="Optional detail drivers should see at this property."
          value={form.access_note}
        />
      </label>

      <div className="access-code-editor-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="primary-cta" disabled={isSaving} type="submit">
          {isSaving ? 'Saving...' : 'Save access code'}
        </button>
      </div>
    </form>
  );
}

export default function AccessCodesPage() {
  const queryClient = useQueryClient();
  const { selectedCsaId, selectedCsaName } = useSelectedCsa();
  const importInputRef = useRef(null);
  const [search, setSearch] = useState('');
  const [editingForm, setEditingForm] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [importSummary, setImportSummary] = useState(null);

  const accessCodesQuery = useQuery({
    queryKey: ['property-intel', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/property-intel');
      return response.data || { property_intel: [] };
    }
  });

  const rows = useMemo(() => accessCodesQuery.data?.property_intel || [], [accessCodesQuery.data]);
  const filteredRows = useMemo(() => {
    const searchValue = normalizeSearch(search);

    return rows.filter((row) => {
      const searchMatches = !searchValue || [
        row.display_address,
        row.normalized_address,
        row.property_name,
        row.building,
        row.access_code,
        row.access_note,
        row.entry_note
      ].some((value) => normalizeSearch(value).includes(searchValue));

      return searchMatches;
    });
  }, [rows, search]);

  const codedCount = rows.filter((row) => row.access_code).length;
  const driverSubmittedCount = rows.filter((row) => row.access_code_source === 'driver').length;
  const importedCount = rows.filter((row) => String(row.access_code_source || '').startsWith('imported_')).length;

  const saveMutation = useMutation({
    mutationFn: async (form) => {
      const payload = {
        ...form,
        access_code_source: form.access_code_source || 'manager'
      };

      if (form.id) {
        const response = await api.patch(`/manager/property-intel/${form.id}`, payload);
        return response.data;
      }

      const response = await api.post('/manager/property-intel', {
        ...payload,
        access_code_source: 'manager_manual'
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-intel', selectedCsaId] });
      setEditingForm(null);
      setErrorMessage('');
      setStatusMessage('Access code saved.');
    },
    onError: (error) => {
      setStatusMessage('');
      setErrorMessage(error.response?.data?.error || 'Unable to save access code.');
    }
  });

  const importMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/manager/property-intel/import', formData);
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['property-intel', selectedCsaId] });
      setImportSummary(result);
      setErrorMessage('');
      setStatusMessage(`Imported ${result.imported || 0} access code ${result.imported === 1 ? 'record' : 'records'}.`);
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    },
    onError: (error) => {
      setStatusMessage('');
      setImportSummary(null);
      setErrorMessage(error.response?.data?.error || 'Unable to import access codes.');
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    }
  });

  function handleFormChange(key, value) {
    setEditingForm((current) => ({
      ...(current || EMPTY_FORM),
      [key]: value
    }));
  }

  function handleStartAdd() {
    setEditingForm({ ...EMPTY_FORM });
    setStatusMessage('');
    setErrorMessage('');
    setImportSummary(null);
  }

  function handleStartEdit(row) {
    setEditingForm(toForm(row));
    setStatusMessage('');
    setErrorMessage('');
    setImportSummary(null);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!editingForm) {
      return;
    }
    saveMutation.mutate(editingForm);
  }

  function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setEditingForm(null);
    setStatusMessage('');
    setErrorMessage('');
    setImportSummary(null);
    importMutation.mutate(file);
  }

  return (
    <section className="page-section access-codes-page">
      <PageHeader
        eyebrow="Property Intel"
        title="Access Codes"
        description={`${selectedCsaName || 'Current CSA'} reusable gate codes, entry notes, and building access details.`}
        actions={(
          <div className="access-code-header-actions">
            <button className="secondary-button" onClick={downloadCsvTemplate} type="button">
              Download CSV Template
            </button>
            <button className="secondary-button" disabled={importMutation.isPending} onClick={() => importInputRef.current?.click()} type="button">
              {importMutation.isPending ? 'Importing...' : 'Import Spreadsheet'}
            </button>
            <button className="primary-cta" onClick={handleStartAdd} type="button">
              Add Access Code
            </button>
            <input
              accept=".csv,.xls,.xlsx"
              className="visually-hidden-file-input"
              onChange={handleImportFile}
              ref={importInputRef}
              type="file"
            />
          </div>
        )}
      />

      <div className="access-code-summary-grid">
        <StatCard label="Properties" value={rows.length} detail="Saved records" />
        <StatCard label="With Codes" value={codedCount} detail="Ready for drivers" tone={codedCount ? 'active' : 'default'} />
        <StatCard label="Imported" value={importedCount} detail="From gate-code files" tone={importedCount ? 'purple' : 'default'} />
        <StatCard label="Driver Submitted" value={driverSubmittedCount} detail="Needs manager attention" tone={driverSubmittedCount ? 'warning' : 'default'} />
      </div>

      {statusMessage ? <div className="success-banner">{statusMessage}</div> : null}
      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
      {importSummary?.errors?.length ? (
        <div className="info-banner access-code-import-summary">
          <strong>{importSummary.skipped || importSummary.errors.length} row{(importSummary.skipped || importSummary.errors.length) === 1 ? '' : 's'} need review.</strong>
          <span>
            {importSummary.errors.slice(0, 3).map((error) => `Row ${error.row}: ${error.error}`).join(' ')}
            {importSummary.errors.length > 3 ? ` ${importSummary.errors.length - 3} more not shown.` : ''}
          </span>
        </div>
      ) : null}

      {editingForm && !editingForm.id ? (
        <AccessCodeForm
          form={editingForm}
          isSaving={saveMutation.isPending}
          onCancel={() => {
            setEditingForm(null);
            setErrorMessage('');
          }}
          onChange={handleFormChange}
          onSubmit={handleSubmit}
        />
      ) : null}

      <div className="card access-code-list-card">
        <div className="section-title-row access-code-toolbar">
          <div>
            <div className="card-title">Saved property access</div>
            <div className="driver-meta">{filteredRows.length} of {rows.length} records shown</div>
          </div>
          <div className="access-code-toolbar-controls">
            <input
              className="text-field"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search address, property, code, or note..."
              type="search"
              value={search}
            />
          </div>
        </div>

        {accessCodesQuery.isLoading ? (
          <div className="driver-meta">Loading access codes...</div>
        ) : accessCodesQuery.isError ? (
          <div className="error-banner">Unable to load access codes.</div>
        ) : filteredRows.length ? (
          <div className="access-code-table">
            <div className="access-code-table-header">
              <span>Property</span>
              <span>Access</span>
              <span>Notes</span>
              <span>Action</span>
            </div>
            {filteredRows.map((row) => {
              const rowKey = row.id || row.normalized_address;
              const isEditing = editingForm?.id && editingForm.id === row.id;

              return (
                <div className="access-code-table-row-group" key={rowKey}>
                  <div className={`access-code-table-row${isEditing ? ' access-code-table-row-active' : ''}`}>
                    <div>
                      <div className="access-code-address">{row.display_address || row.normalized_address}</div>
                      <div className="driver-meta">{row.property_name || row.building || 'No property label yet'}</div>
                    </div>
                    <div>
                      <div className="access-code-value">{row.access_code || 'No code'}</div>
                      <div className="driver-meta">{row.access_code_confirmed_at ? 'Confirmed' : 'Not confirmed'}</div>
                    </div>
                    <div className="access-code-notes">
                      {row.entry_note || row.access_note || row.shared_note || 'No notes'}
                    </div>
                    <button className="secondary-inline-button" onClick={() => handleStartEdit(row)} type="button">
                      Edit
                    </button>
                  </div>
                  {isEditing ? (
                    <AccessCodeForm
                      form={editingForm}
                      isInline
                      isSaving={saveMutation.isPending}
                      onCancel={() => {
                        setEditingForm(null);
                        setErrorMessage('');
                      }}
                      onChange={handleFormChange}
                      onSubmit={handleSubmit}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No access codes found"
            description="Try a different search, or add the property manually."
            actions={(
              <button className="primary-cta" onClick={handleStartAdd} type="button">
                Add Access Code
              </button>
            )}
          />
        )}
      </div>
    </section>
  );
}
