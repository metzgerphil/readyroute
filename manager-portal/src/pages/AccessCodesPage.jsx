import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { EmptyState, PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
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

const SOURCE_LABELS = {
  manager: 'Manager',
  manager_manual: 'Manager',
  driver: 'Driver',
  imported_gate_code_doc: 'DOCX import',
  imported_gate_codes_xlsx: 'Spreadsheet import'
};

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function getSourceLabel(source) {
  return SOURCE_LABELS[source] || source || 'No source';
}

function getSourceTone(source) {
  if (source === 'driver') {
    return 'warning';
  }

  if (String(source || '').startsWith('imported_')) {
    return 'purple';
  }

  if (source) {
    return 'active';
  }

  return 'neutral';
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

function AccessCodeForm({ form, isSaving, onCancel, onChange, onSubmit }) {
  const isNew = !form.id;

  return (
    <form className="card access-code-editor" onSubmit={onSubmit}>
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
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [editingForm, setEditingForm] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const accessCodesQuery = useQuery({
    queryKey: ['property-intel', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/property-intel');
      return response.data || { property_intel: [] };
    }
  });

  const rows = accessCodesQuery.data?.property_intel || [];
  const filteredRows = useMemo(() => {
    const searchValue = normalizeSearch(search);

    return rows.filter((row) => {
      const sourceMatches = sourceFilter === 'all' || row.access_code_source === sourceFilter;
      const searchMatches = !searchValue || [
        row.display_address,
        row.normalized_address,
        row.property_name,
        row.building,
        row.access_code,
        row.access_note,
        row.entry_note
      ].some((value) => normalizeSearch(value).includes(searchValue));

      return sourceMatches && searchMatches;
    });
  }, [rows, search, sourceFilter]);

  const sourceOptions = useMemo(() => {
    const sources = [...new Set(rows.map((row) => row.access_code_source).filter(Boolean))].sort();
    return sources;
  }, [rows]);

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

  function handleFormChange(key, value) {
    setEditingForm((current) => ({
      ...(current || EMPTY_FORM),
      [key]: value
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!editingForm) {
      return;
    }
    saveMutation.mutate(editingForm);
  }

  return (
    <section className="page-section access-codes-page">
      <PageHeader
        eyebrow="Property Intel"
        title="Access Codes"
        description={`${selectedCsaName || 'Current CSA'} reusable gate codes, entry notes, and building access details.`}
        actions={(
          <button className="primary-cta" onClick={() => setEditingForm({ ...EMPTY_FORM })} type="button">
            Add Access Code
          </button>
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

      {editingForm ? (
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
            <select className="text-field" onChange={(event) => setSourceFilter(event.target.value)} value={sourceFilter}>
              <option value="all">All sources</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>{getSourceLabel(source)}</option>
              ))}
            </select>
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
              <span>Source</span>
              <span>Action</span>
            </div>
            {filteredRows.map((row) => (
              <div className="access-code-table-row" key={row.id || row.normalized_address}>
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
                <StatusBadge tone={getSourceTone(row.access_code_source)}>
                  {getSourceLabel(row.access_code_source)}
                </StatusBadge>
                <button className="secondary-inline-button" onClick={() => setEditingForm(toForm(row))} type="button">
                  Edit
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No access codes found"
            description="Try a different search, or add the property manually."
            actions={(
              <button className="primary-cta" onClick={() => setEditingForm({ ...EMPTY_FORM })} type="button">
                Add Access Code
              </button>
            )}
          />
        )}
      </div>
    </section>
  );
}
