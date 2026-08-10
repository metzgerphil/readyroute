import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import { EmptyState, ErrorState, LoadingState } from '../components/PortalDesignSystem';
import api from '../services/api';
import { getTodayString, loadStoredOperationsDate, saveStoredOperationsDate } from '../utils/operationsDate';

const CODE_CATEGORY_GROUPS = [
  {
    key: '1',
    title: 'Delivery Not Attempted',
    codes: ['011', '012', '015', '016', '017', '027', '079', '081', '082', '083', '095', '100']
  },
  {
    key: '2',
    title: 'Delivery Attempted, Not Completed',
    codes: ['001', '002', '003', '004', '006', '007', '010', '030', '034', '250']
  },
  {
    key: '3',
    title: 'Delivery Completed',
    codes: ['009', '013', '014', '018', '019', '021', '025', '026', '028', '029']
  },
  {
    key: '4',
    title: 'Pickup Codes',
    codes: ['P01', 'P14', 'P16', 'P17', 'P24', 'P25', 'P10', 'P11', 'P15', 'P21', 'P26']
  }
];

const CODE_LABELS = {
  '001': 'Customer Security Delay',
  '002': 'Incorrect Recipient Address',
  '003': 'Unable to Locate',
  '004': 'Recipient Not In',
  '006': 'Refused',
  '007': 'Unable to Indirect/Release',
  '009': 'Delivery to Business',
  '010': 'Inspection Required',
  '011': 'Closed on Saturday',
  '012': 'Sorted to Wrong Route',
  '013': 'Residential Delivery',
  '014': 'Residence Driver Release',
  '015': 'Holding Package',
  '016': 'Not on Van',
  '017': 'Misdelivered Pickup',
  '018': 'Delivered to Correct Recipient',
  '019': 'Indirect Delivery',
  '021': 'Business Driver Release',
  '025': 'Tendered to USPS',
  '026': 'Delivered to Shipper',
  '027': 'No Attempt',
  '028': 'Connecting Carrier',
  '029': 'Call Tag Pickup',
  '030': 'Retail Refusal',
  '034': 'Future Delivery',
  '079': 'Package Transfer',
  '081': 'Contractor Refused',
  '082': 'Weather Delay',
  '083': 'Holiday',
  '095': 'Intra-FedEx Transfer',
  '100': 'Customer Request',
  '250': 'Unable to Hold',
  P01: 'Missed Pickup',
  P10: 'Pickup Not Ready',
  P11: 'Closed, No Packages',
  P14: 'Weather',
  P15: 'Residential Not Home',
  P16: 'Holiday/Contingency',
  P17: 'Hazmat',
  P21: 'Express Pickup Cancel',
  P24: 'Pickup Cancelled',
  P25: 'Wrong Address',
  P26: 'Pickup Not Scanned'
};

const emptyForm = {
  name: '',
  email: '',
  date_of_birth: '',
  phone: '',
  hourly_rate: '',
  daily_flat_rate: '',
  pin: '',
  confirmPin: ''
};

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

const emptyDocumentDraft = {
  file: null,
  expires_on: '',
  notes: ''
};

const emptyManagerInviteForm = {
  full_name: '',
  email: ''
};

const emptyLaborForm = {
  driver_id: '',
  driver_name: '',
  date: '',
  clock_in: '',
  clock_out: '',
  break_minutes: '0',
  lunch_minutes: '0',
  adjustment_reason: ''
};

const DRIVER_TABS = [
  { key: 'directory', label: 'Driver Directory' },
  { key: 'labor', label: 'Labor' }
];

const DRIVER_PAGE_SIZE_OPTIONS = [10, 25, 50];

const DRIVER_SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'hourly_rate', label: 'Hourly rate' },
  { value: 'daily_flat_rate', label: 'Daily flat rate' }
];

const DRIVER_COMPLIANCE_RANK = {
  expired: 0,
  expiring_soon: 1,
  needs_documents: 2,
  not_reviewed: 3,
  good: 4
};

function getDocumentsForType(driver, documentType) {
  return (driver?.documents || []).filter((document) => document.document_type === documentType);
}

function getDocumentStatus(driver, documentType) {
  const documents = getDocumentsForType(driver, documentType);
  if (!documents.length) {
    return { label: 'Missing', tone: 'warning' };
  }

  const hasExpired = documents.some((document) => {
    if (!document.expires_on) return false;
    return new Date(document.expires_on).getTime() < Date.now();
  });

  if (hasExpired) {
    return { label: 'Expired', tone: 'danger' };
  }

  const hasExpiringSoon = documents.some((document) => {
    if (!document.expires_on) return false;
    const expiresAt = new Date(document.expires_on).getTime();
    return Number.isFinite(expiresAt) && expiresAt >= Date.now() && expiresAt <= Date.now() + 30 * 24 * 60 * 60 * 1000;
  });

  if (hasExpiringSoon) {
    return { label: 'Expiring soon', tone: 'warning' };
  }

  return { label: documents.length > 1 ? `${documents.length} files` : 'Uploaded', tone: 'success' };
}

function getDocumentSummaryLabel(driver) {
  const summary = driver?.document_summary;
  if (!summary) {
    return 'No docs yet';
  }

  if (summary.expired > 0) {
    return `${summary.expired} expired`;
  }

  if (summary.expiring_soon > 0) {
    return `${summary.expiring_soon} expiring`;
  }

  if (summary.missing_required?.length) {
    return `${summary.required_complete}/${summary.required_total} complete`;
  }

  return 'Required complete';
}

function getComplianceLabel(driver) {
  const summary = driver?.document_summary;
  if (!summary) return 'Not reviewed';
  if (summary.expired > 0) return 'Expired docs';
  if (summary.expiring_soon > 0) return 'Expiring soon';
  if (summary.missing_required?.length) return 'Needs documents';
  return 'Good standing';
}

function getComplianceStatus(driver) {
  const summary = driver?.document_summary;
  if (!summary) return 'not_reviewed';
  if (summary.expired > 0) return 'expired';
  if (summary.expiring_soon > 0) return 'expiring_soon';
  if (summary.missing_required?.length) return 'needs_documents';
  return 'good';
}

function getDriverSearchText(driver) {
  return [
    driver.name,
    driver.email,
    driver.phone,
    driver.fedex_driver_id,
    driver.is_active ? 'active' : 'inactive',
    getDocumentSummaryLabel(driver),
    getComplianceLabel(driver)
  ].filter(Boolean).join(' ').toLowerCase();
}

function getDriverSortValue(driver, sortKey) {
  switch (sortKey) {
    case 'status':
      return driver.is_active ? 0 : 1;
    case 'compliance':
      return DRIVER_COMPLIANCE_RANK[getComplianceStatus(driver)] ?? DRIVER_COMPLIANCE_RANK.not_reviewed;
    case 'hourly_rate':
      return Number(driver.hourly_rate || 0);
    case 'daily_flat_rate':
      return Number(driver.daily_flat_rate || 0);
    case 'name':
    default:
      return String(driver.name || '').toLowerCase();
  }
}

function compareDrivers(aDriver, bDriver, sortKey, sortDirection) {
  const aValue = getDriverSortValue(aDriver, sortKey);
  const bValue = getDriverSortValue(bDriver, sortKey);
  const directionMultiplier = sortDirection === 'desc' ? -1 : 1;

  if (typeof aValue === 'number' && typeof bValue === 'number') {
    return (aValue - bValue) * directionMultiplier;
  }

  return String(aValue).localeCompare(String(bValue), undefined, { numeric: true }) * directionMultiplier;
}

function getStatusToneClass(tone) {
  switch (tone) {
    case 'success':
      return 'driver-doc-chip-success';
    case 'danger':
      return 'driver-doc-chip-danger';
    case 'warning':
    default:
      return 'driver-doc-chip-warning';
  }
}

function DriverTabs({ activeTab, onChange }) {
  return (
    <div className="drivers-tab-bar" role="tablist" aria-label="Driver sections">
      {DRIVER_TABS.map((tab) => (
        <button
          aria-selected={activeTab === tab.key}
          className={`drivers-tab-button${activeTab === tab.key ? ' active' : ''}`}
          key={tab.key}
          onClick={() => onChange(tab.key)}
          role="tab"
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function DriverDocumentSlot({
  documentType,
  driver,
  draft,
  isUploading,
  onDraftChange,
  onRemove,
  onUpload
}) {
  const documents = getDocumentsForType(driver, documentType.key);
  const status = getDocumentStatus(driver, documentType.key);

  return (
    <div className="driver-document-slot">
      <div className="driver-document-slot-header">
        <div>
          <strong>{documentType.label}</strong>
          <span>{documentType.required ? 'Required' : 'Optional'}{documentType.multiple ? ' · multiple files' : ''}</span>
        </div>
        <span className={`driver-doc-chip ${getStatusToneClass(status.tone)}`}>{status.label}</span>
      </div>

      {documents.length ? (
        <div className="driver-document-files">
          {documents.map((document) => (
            <div className="driver-document-file" key={document.id}>
              <div>
                <a href={document.access_url || document.public_url || '#'} rel="noreferrer" target="_blank">{document.file_name}</a>
                <span>
                  {document.expires_on ? `Expires ${document.expires_on}` : 'No expiration'}
                  {document.notes ? ` · ${document.notes}` : ''}
                </span>
              </div>
              <button className="secondary-inline-button" onClick={() => onRemove(document)} type="button">Remove</button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="driver-document-upload-row">
        <input
          className="text-field driver-document-file-input"
          onChange={(event) => onDraftChange(documentType.key, 'file', event.target.files?.[0] || null)}
          type="file"
        />
        {documentType.expires ? (
          <input
            className="text-field"
            onChange={(event) => onDraftChange(documentType.key, 'expires_on', event.target.value)}
            type="date"
            value={draft?.expires_on || ''}
          />
        ) : null}
        <input
          className="text-field"
          onChange={(event) => onDraftChange(documentType.key, 'notes', event.target.value)}
          placeholder="Notes"
          value={draft?.notes || ''}
        />
        <button
          className="primary-inline-button"
          disabled={!draft?.file || isUploading}
          onClick={() => onUpload(documentType.key)}
          type="button"
        >
          {isUploading ? 'Uploading...' : documents.length && !documentType.multiple ? 'Replace' : 'Upload'}
        </button>
      </div>
    </div>
  );
}

function DriverModal({
  documentDrafts,
  documentError,
  fieldErrors,
  form,
  mode,
  errorMessage,
  isDocumentBusy,
  isSubmitting,
  selectedDriver,
  onChange,
  onClose,
  onDocumentDraftChange,
  onDocumentRemove,
  onDocumentUpload,
  onSubmit
}) {
  const isEdit = mode === 'edit';

  return (
    <div className="modal-backdrop">
      <div className="modal-card driver-profile-modal-card">
        <div className="modal-header">
          <div>
            <div className="card-title">{isEdit ? 'Edit Driver Profile' : 'Add Driver'}</div>
            <div className="driver-meta">{isEdit ? 'Update driver details, pay, documents, and app access.' : 'Create the driver first, then upload documents from the saved profile.'}</div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form driver-profile-form" onSubmit={onSubmit}>
          <div className="driver-modal-section">
            <div className="driver-modal-section-title">Personal Info</div>
            <div className="driver-profile-grid">
              <label className="driver-modal-field">
                <span className="field-label">First and Last Name</span>
                <input
                  aria-invalid={Boolean(fieldErrors.name)}
                  className="text-field"
                  onChange={(event) => onChange('name', event.target.value)}
                  placeholder="Full Name"
                  value={form.name}
                />
                {fieldErrors.name ? <span className="field-error">{fieldErrors.name}</span> : null}
              </label>
              <label className="driver-modal-field">
                <span className="field-label">Date of Birth</span>
                <input className="text-field" onChange={(event) => onChange('date_of_birth', event.target.value)} type="date" value={form.date_of_birth} />
              </label>
            </div>
          </div>

          <div className="driver-modal-section">
            <div className="driver-modal-section-title">Contact Details</div>
            <div className="driver-profile-grid">
              <label className="driver-modal-field">
                <span className="field-label">Email Address</span>
                <input
                  aria-invalid={Boolean(fieldErrors.email)}
                  className="text-field"
                  disabled={isEdit}
                  onChange={(event) => onChange('email', event.target.value)}
                  placeholder="Email"
                  type="email"
                  value={form.email}
                />
                {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
              </label>
              <label className="driver-modal-field">
                <span className="field-label">Phone Number</span>
                <input className="text-field" onChange={(event) => onChange('phone', event.target.value)} placeholder="Phone" value={form.phone} />
              </label>
            </div>
          </div>

          <div className="driver-modal-section">
            <div className="driver-modal-section-title">Compensation</div>
            <div className="driver-profile-grid">
              <label className="driver-modal-field money-field">
                <span className="field-label">Daily Hourly Rate</span>
                <div className="money-input-wrap">
                  <span>$</span>
                  <input
                    className="text-field money-input"
                    min="0"
                    onChange={(event) => onChange('hourly_rate', event.target.value)}
                    placeholder="Hourly Rate"
                    step="0.01"
                    type="number"
                    value={form.hourly_rate}
                  />
                </div>
              </label>
              <label className="driver-modal-field money-field">
                <span className="field-label">Daily Flat Rate</span>
                <div className="money-input-wrap">
                  <span>$</span>
                  <input
                    className="text-field money-input"
                    min="0"
                    onChange={(event) => onChange('daily_flat_rate', event.target.value)}
                    placeholder="Flat Rate"
                    step="0.01"
                    type="number"
                    value={form.daily_flat_rate}
                  />
                </div>
              </label>
            </div>
          </div>

          <div className="driver-modal-section">
            <div className="driver-modal-section-title">App Access</div>
            {!isEdit ? (
              <>
              <div className="driver-meta">
                Enter a 4-digit PIN for this driver. Confirm PIN must match.
              </div>
              <input
                aria-invalid={Boolean(fieldErrors.pin)}
                className="text-field"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => onChange('pin', event.target.value)}
                placeholder="4-digit PIN"
                type="password"
                value={form.pin}
              />
              {fieldErrors.pin ? <span className="field-error">{fieldErrors.pin}</span> : null}
              <input
                aria-invalid={Boolean(fieldErrors.confirmPin)}
                className="text-field"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => onChange('confirmPin', event.target.value)}
                placeholder="Confirm PIN"
                type="password"
                value={form.confirmPin}
              />
              {fieldErrors.confirmPin ? <span className="field-error">{fieldErrors.confirmPin}</span> : null}
              </>
            ) : (
              <>
              <div className="driver-meta">
                Enter a 4-digit PIN for this driver. Confirm PIN must match.
              </div>
              <input
                aria-invalid={Boolean(fieldErrors.pin)}
                className="text-field"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => onChange('pin', event.target.value)}
                placeholder="New 4-digit PIN"
                type="password"
                value={form.pin}
              />
              {fieldErrors.pin ? <span className="field-error">{fieldErrors.pin}</span> : null}
              <input
                aria-invalid={Boolean(fieldErrors.confirmPin)}
                className="text-field"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => onChange('confirmPin', event.target.value)}
                placeholder="Confirm new PIN"
                type="password"
                value={form.confirmPin}
              />
              {fieldErrors.confirmPin ? <span className="field-error">{fieldErrors.confirmPin}</span> : null}
              </>
            )}
          </div>

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Driver'}
            </button>
          </div>
        </form>

        {isEdit ? (
          <div className="driver-modal-section driver-documents-section">
            <div>
              <div className="driver-modal-section-title">Driver Documents</div>
              <div className="driver-meta">Required files are tracked separately from optional write-ups and other documents.</div>
            </div>
            {documentError ? <div className="error-banner">{documentError}</div> : null}
            {DRIVER_DOCUMENT_TYPES.map((documentType) => (
              <DriverDocumentSlot
                documentType={documentType}
                draft={documentDrafts[documentType.key] || emptyDocumentDraft}
                driver={selectedDriver}
                isUploading={isDocumentBusy}
                key={documentType.key}
                onDraftChange={onDocumentDraftChange}
                onRemove={onDocumentRemove}
                onUpload={onDocumentUpload}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ManagerModal({
  form,
  managerUsers,
  errorMessage,
  result,
  isSubmitting,
  isRefreshingInvite,
  onChange,
  onClose,
  onSubmit,
  onRefreshInvite
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card manager-modal-card">
        <div className="modal-header">
          <div className="card-title">Add Manager</div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form manager-invite-form" onSubmit={onSubmit}>
          <input
            className="text-field"
            onChange={(event) => onChange('full_name', event.target.value)}
            placeholder="Manager name"
            value={form.full_name}
          />
          <input
            className="text-field"
            onChange={(event) => onChange('email', event.target.value)}
            placeholder="Manager email"
            type="email"
            value={form.email}
          />

          {result?.message ? <div className="info-banner">{result.message}</div> : null}
          {result?.invite_url ? (
            <div className="driver-meta">
              Email delivery is not configured yet, so share the invite link manually below.
            </div>
          ) : null}
          {result?.invite_url ? <textarea className="text-field" readOnly rows={4} value={result.invite_url} /> : null}
          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Sending invite...' : 'Send invite'}
            </button>
          </div>
        </form>

        <div className="manager-modal-list">
          <div className="card-title">Current Managers</div>
          <div className="manager-access-list">
            {(managerUsers || []).map((managerUser) => (
              <div className="manager-access-row" key={managerUser.id || managerUser.email}>
                <div>
                  <strong>{managerUser.full_name || managerUser.email}</strong>
                  <div className="driver-meta">{managerUser.email}</div>
                </div>
                <div className="manager-access-status-group">
                  <span className={`pin-workflow-chip ${managerUser.status === 'active' ? 'pin-workflow-chip-good' : 'pin-workflow-chip-warning'}`}>
                    {managerUser.status === 'active' ? (managerUser.is_primary ? 'Primary manager' : 'Active') : 'Invite pending'}
                  </span>
                  {managerUser.status === 'pending_invite' && managerUser.id ? (
                    <button
                      className="secondary-inline-button"
                      disabled={isRefreshingInvite}
                      onClick={() => onRefreshInvite(managerUser.id)}
                      type="button"
                    >
                      {isRefreshingInvite ? 'Refreshing...' : 'Resend invite'}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LaborAdjustmentModal({
  form,
  errorMessage,
  isSubmitting,
  onChange,
  onClose,
  onSubmit
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="card-title">Edit Labor</div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <div className="driver-meta">
            Adjust labor for <strong>{form.driver_name || 'Driver'}</strong> on {form.date || 'the selected date'}.
          </div>
          <label className="field-group">
            <span className="field-label">Clock In</span>
            <input
              className="text-field"
              onChange={(event) => onChange('clock_in', event.target.value)}
              type="datetime-local"
              value={form.clock_in}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Clock Out</span>
            <input
              className="text-field"
              onChange={(event) => onChange('clock_out', event.target.value)}
              type="datetime-local"
              value={form.clock_out}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Break Minutes</span>
            <input
              className="text-field"
              min="0"
              onChange={(event) => onChange('break_minutes', event.target.value)}
              step="1"
              type="number"
              value={form.break_minutes}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Lunch Minutes</span>
            <input
              className="text-field"
              min="0"
              onChange={(event) => onChange('lunch_minutes', event.target.value)}
              step="1"
              type="number"
              value={form.lunch_minutes}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Reason</span>
            <textarea
              className="text-field"
              onChange={(event) => onChange('adjustment_reason', event.target.value)}
              placeholder="Why are you correcting this labor record?"
              rows={4}
              value={form.adjustment_reason}
            />
          </label>

          <div className="driver-meta">
            ReadyRoute will save these as the manager-corrected labor totals for that day and refresh the daily labor summary if the day is already closed out.
          </div>

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : 'Save Labor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(value || 0));
}

function formatHours(value) {
  return `${Number(value || 0).toFixed(2)} hrs`;
}

function formatMinutes(value) {
  return `${Number(value || 0)} min`;
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function formatShiftWindow(clockIn, clockOut) {
  if (!clockIn) {
    return '—';
  }

  const start = formatDateTime(clockIn);
  const end = clockOut ? formatDateTime(clockOut) : 'Still clocked in';
  return `${start} → ${end}`;
}

function formatShortTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function getLiveStatusClass(code) {
  switch (code) {
    case 'working':
      return 'live-status-chip-working';
    case 'on_lunch':
      return 'live-status-chip-lunch';
    case 'on_break':
      return 'live-status-chip-break';
    case 'clocked_out':
      return 'live-status-chip-off';
    case 'not_clocked_in':
    default:
      return 'live-status-chip-idle';
  }
}

function getMinutesUntil(value) {
  if (!value) {
    return null;
  }

  const targetMs = new Date(value).getTime();
  if (!Number.isFinite(targetMs)) {
    return null;
  }

  return Math.max(0, Math.ceil((targetMs - Date.now()) / (1000 * 60)));
}

function formatDateTimeLocalInput(value, fallbackDate) {
  if (!value) {
    return fallbackDate ? `${fallbackDate}T08:00` : '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallbackDate ? `${fallbackDate}T08:00` : '';
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function localInputToIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function formatPhoneDisplay(phone) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone || 'No phone on file';
}

function groupExceptionBreakdown(breakdown) {
  return CODE_CATEGORY_GROUPS.map((group) => ({
    ...group,
    items: group.codes
      .filter((code) => breakdown?.[code])
      .map((code) => ({
        code,
        count: breakdown[code],
        label: CODE_LABELS[code] || 'FedEx code'
      }))
  })).filter((group) => group.items.length > 0);
}

export default function DriversPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedWeekDate, setSelectedWeekDate] = useState(loadStoredOperationsDate() || getTodayString());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLaborModalOpen, setIsLaborModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [documentDrafts, setDocumentDrafts] = useState({});
  const [documentError, setDocumentError] = useState('');
  const [laborForm, setLaborForm] = useState(emptyLaborForm);
  const [laborErrorMessage, setLaborErrorMessage] = useState('');
  const [expandedLiveLaborDriverId, setExpandedLiveLaborDriverId] = useState(null);
  const [expandedWeeklyLaborDriverId, setExpandedWeeklyLaborDriverId] = useState(null);
  const [expandedDailyLaborDriverId, setExpandedDailyLaborDriverId] = useState(null);
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [managerInviteForm, setManagerInviteForm] = useState(emptyManagerInviteForm);
  const [managerInviteError, setManagerInviteError] = useState('');
  const [managerInviteResult, setManagerInviteResult] = useState(null);
  const [starterPinDraft, setStarterPinDraft] = useState(null);
  const [starterPinError, setStarterPinError] = useState('');
  const [activeDriversTab, setActiveDriversTab] = useState('directory');
  const [driverSearch, setDriverSearch] = useState('');
  const [driverStatusFilter, setDriverStatusFilter] = useState('all');
  const [driverComplianceFilter, setDriverComplianceFilter] = useState('all');
  const [driverSortKey, setDriverSortKey] = useState('name');
  const [driverSortDirection, setDriverSortDirection] = useState('asc');
  const [driverPage, setDriverPage] = useState(1);
  const [driverPageSize, setDriverPageSize] = useState(10);

  const driversQuery = useQuery({
    queryKey: ['manager-drivers'],
    queryFn: async () => {
      const response = await api.get('/manager/drivers');
      return response.data?.drivers || [];
    }
  });

  const activeDriverStatsId = expandedDailyLaborDriverId || expandedWeeklyLaborDriverId || null;

  const driverStatsQuery = useQuery({
    queryKey: ['manager-driver-stats', activeDriverStatsId],
    queryFn: async () => {
      const response = await api.get(`/manager/drivers/${activeDriverStatsId}/stats`);
      return response.data?.stats || null;
    },
    enabled: Boolean(activeDriverStatsId)
  });

  const weeklyTimecardsQuery = useQuery({
    queryKey: ['manager-weekly-timecards', selectedWeekDate],
    queryFn: async () => {
      const response = await api.get('/manager/timecards/weekly', {
        params: {
          date: selectedWeekDate
        }
      });
      return response.data || null;
    }
  });

  const dailyLaborQuery = useQuery({
    queryKey: ['manager-daily-labor', selectedWeekDate],
    queryFn: async () => {
      const response = await api.get('/manager/timecards/daily', {
        params: {
          date: selectedWeekDate
        }
      });
      return response.data || null;
    }
  });

  const liveLaborQuery = useQuery({
    queryKey: ['manager-live-labor', selectedWeekDate],
    queryFn: async () => {
      const response = await api.get('/manager/timecards/live', {
        params: {
          date: selectedWeekDate
        }
      });
      return response.data || null;
    },
    refetchInterval: selectedWeekDate === getTodayString() ? 30000 : false
  });

  const managerUsersQuery = useQuery({
    queryKey: ['manager-users'],
    queryFn: async () => {
      const response = await api.get('/manager/manager-users');
      return response.data?.manager_users || [];
    }
  });

  const driverAccessQuery = useQuery({
    queryKey: ['manager-driver-access'],
    queryFn: async () => {
      const response = await api.get('/manager/driver-access');
      return response.data || { starter_pin: null };
    }
  });

  const createDriver = useMutation({
    mutationFn: async () => {
      await api.post('/manager/drivers', {
        name: form.name,
        email: form.email,
        date_of_birth: form.date_of_birth || null,
        phone: form.phone,
        hourly_rate: Number(form.hourly_rate),
        daily_flat_rate: Number(form.daily_flat_rate || 0),
        pin: form.pin
      });
    },
    onSuccess: () => {
      setIsModalOpen(false);
      setForm(emptyForm);
      setFieldErrors({});
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['manager-drivers'] });
    },
    onError: (error) => {
      setErrorMessage(error.response?.data?.error || 'Unable to create driver.');
    }
  });

  const updateDriver = useMutation({
    mutationFn: async () => {
      await api.put(`/manager/drivers/${form.id}`, {
        name: form.name,
        date_of_birth: form.date_of_birth || null,
        phone: form.phone,
        hourly_rate: Number(form.hourly_rate),
        daily_flat_rate: Number(form.daily_flat_rate || 0),
        pin: form.pin
      });
    },
    onSuccess: () => {
      setIsModalOpen(false);
      setForm(emptyForm);
      setFieldErrors({});
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['manager-drivers'] });
    },
    onError: (error) => {
      setErrorMessage(error.response?.data?.error || 'Unable to update driver.');
    }
  });

  const deactivateDriver = useMutation({
    mutationFn: async ({ driverId, isActive }) => {
      await api.patch(`/manager/drivers/${driverId}/status`, {
        is_active: isActive
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-drivers'] });
    }
  });

  const uploadDriverDocument = useMutation({
    mutationFn: async ({ documentType }) => {
      const draft = documentDrafts[documentType] || emptyDocumentDraft;
      const formData = new FormData();
      formData.append('file', draft.file);
      formData.append('document_type', documentType);
      if (draft.expires_on) {
        formData.append('expires_on', draft.expires_on);
      }
      if (draft.notes) {
        formData.append('notes', draft.notes);
      }

      await api.post(`/manager/drivers/${selectedDriverId}/documents`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
    },
    onSuccess: (_data, variables) => {
      setDocumentError('');
      setDocumentDrafts((current) => ({
        ...current,
        [variables.documentType]: emptyDocumentDraft
      }));
      queryClient.invalidateQueries({ queryKey: ['manager-drivers'] });
    },
    onError: (error) => {
      setDocumentError(error.response?.data?.error || 'Unable to upload driver document.');
    }
  });

  const removeDriverDocument = useMutation({
    mutationFn: async (document) => {
      await api.delete(`/manager/drivers/${selectedDriverId}/documents/${document.id}`);
    },
    onSuccess: () => {
      setDocumentError('');
      queryClient.invalidateQueries({ queryKey: ['manager-drivers'] });
    },
    onError: (error) => {
      setDocumentError(error.response?.data?.error || 'Unable to remove driver document.');
    }
  });

  const updateDriverAccess = useMutation({
    mutationFn: async () => {
      const response = await api.patch('/manager/driver-access', {
        starter_pin: starterPin
      });
      return response.data || null;
    },
    onSuccess: (data) => {
      setStarterPinError('');
      setStarterPinDraft(data?.starter_pin || '');
      queryClient.invalidateQueries({ queryKey: ['manager-driver-access'] });
    },
    onError: (error) => {
      setStarterPinError(error.response?.data?.error || 'Unable to update starter PIN.');
    }
  });

  const updateLabor = useMutation({
    mutationFn: async () => {
      const response = await api.put('/manager/timecards/live', {
        date: laborForm.date,
        driver_id: laborForm.driver_id,
        clock_in: localInputToIso(laborForm.clock_in),
        clock_out: localInputToIso(laborForm.clock_out),
        break_minutes: Number(laborForm.break_minutes || 0),
        lunch_minutes: Number(laborForm.lunch_minutes || 0),
        adjustment_reason: laborForm.adjustment_reason.trim()
      });
      return response.data || null;
    },
    onSuccess: () => {
      setIsLaborModalOpen(false);
      setLaborErrorMessage('');
      setLaborForm(emptyLaborForm);
      queryClient.invalidateQueries({ queryKey: ['manager-live-labor', selectedWeekDate] });
      queryClient.invalidateQueries({ queryKey: ['manager-daily-labor', selectedWeekDate] });
      queryClient.invalidateQueries({ queryKey: ['manager-weekly-timecards', selectedWeekDate] });
    },
    onError: (error) => {
      setLaborErrorMessage(error.response?.data?.error || 'Unable to update labor.');
    }
  });

  const inviteManagerUser = useMutation({
    mutationFn: async () => {
      const response = await api.post('/manager/manager-users/invite', managerInviteForm);
      return response.data;
    },
    onSuccess: (data) => {
      setManagerInviteError('');
      setManagerInviteResult(data);
      setManagerInviteForm(emptyManagerInviteForm);
      queryClient.invalidateQueries({ queryKey: ['manager-users'] });
    },
    onError: (error) => {
      setManagerInviteError(error.response?.data?.error || 'Unable to prepare manager invite.');
    }
  });

  const refreshManagerInvite = useMutation({
    mutationFn: async (managerUserId) => {
      const response = await api.post(`/manager/manager-users/${managerUserId}/invite`);
      return response.data;
    },
    onSuccess: (data) => {
      setManagerInviteError('');
      setManagerInviteResult(data);
      queryClient.invalidateQueries({ queryKey: ['manager-users'] });
    },
    onError: (error) => {
      setManagerInviteError(error.response?.data?.error || 'Unable to refresh manager invite.');
    }
  });

  const isSubmitting = createDriver.isPending || updateDriver.isPending;
  const isDocumentBusy = uploadDriverDocument.isPending || removeDriverDocument.isPending;
  const drivers = useMemo(() => driversQuery.data || [], [driversQuery.data]);
  const filteredDrivers = useMemo(() => {
    const searchQuery = driverSearch.trim().toLowerCase();

    return [...drivers]
      .filter((driver) => {
        const statusMatches = driverStatusFilter === 'all'
          || (driverStatusFilter === 'active' && driver.is_active)
          || (driverStatusFilter === 'inactive' && !driver.is_active);
        const complianceStatus = getComplianceStatus(driver);
        const complianceMatches = driverComplianceFilter === 'all' || complianceStatus === driverComplianceFilter;
        const searchMatches = !searchQuery || getDriverSearchText(driver).includes(searchQuery);

        return statusMatches && complianceMatches && searchMatches;
      })
      .sort((aDriver, bDriver) => compareDrivers(aDriver, bDriver, driverSortKey, driverSortDirection));
  }, [driverComplianceFilter, driverSearch, driverSortDirection, driverSortKey, driverStatusFilter, drivers]);
  const driverPageCount = Math.max(1, Math.ceil(filteredDrivers.length / driverPageSize));
  const visibleDriverPage = Math.min(driverPage, driverPageCount);
  const driverPageStartIndex = (visibleDriverPage - 1) * driverPageSize;
  const pagedDrivers = filteredDrivers.slice(driverPageStartIndex, driverPageStartIndex + driverPageSize);
  const driverPaginationStart = filteredDrivers.length ? driverPageStartIndex + 1 : 0;
  const driverPaginationEnd = Math.min(driverPageStartIndex + driverPageSize, filteredDrivers.length);
  const selectedDriver = useMemo(
    () => drivers.find((driver) => driver.id === selectedDriverId) || null,
    [drivers, selectedDriverId]
  );
  const managerUsers = useMemo(() => managerUsersQuery.data || [], [managerUsersQuery.data]);
  const isSetupFlow = searchParams.get('source') === 'setup';
  const setupFocus = searchParams.get('focus') || '';
  const setupBanner = useMemo(() => {
    if (!isSetupFlow) {
      return null;
    }

    const starterPinSet = Boolean(driverAccessQuery.data?.starter_pin);

    if (setupFocus === 'starter-pin') {
      if (starterPinSet) {
        return {
          tone: 'done',
          title: 'Starter PIN is ready',
          body: 'New drivers can now use the shared CSA PIN during initial login.',
          actionTo: '/vedr?source=setup&focus=vedr',
          actionLabel: 'Continue to VEDR'
        };
      }

      return {
        tone: 'active',
        title: 'Set the shared driver PIN first',
        body: 'Save one 4-digit CSA PIN here, then ReadyRoute can create driver accounts without requiring a unique PIN for each driver up front.'
      };
    }

    if (setupFocus === 'drivers') {
      if (drivers.length > 0) {
        return {
          tone: 'done',
          title: 'Drivers are loaded',
          body: `${drivers.length} driver${drivers.length === 1 ? '' : 's'} are ready for dispatch and route assignment.`,
          actionTo: '/vehicles?source=setup&focus=vehicles',
          actionLabel: 'Continue to Vehicles'
        };
      }

      if (!starterPinSet) {
        return {
          tone: 'blocked',
          title: 'Drivers are blocked until the starter PIN is saved',
          body: 'Set the CSA starter PIN in the Driver Access card below, then come back to create your first drivers.'
        };
      }

      return {
        tone: 'active',
        title: 'Add the first drivers for this CSA',
        body: 'Once at least one driver is added here, ReadyRoute can move you straight into vehicle setup.'
      };
    }

    if (setupFocus === 'managers') {
      return {
        tone: 'active',
        title: 'Manager access is in place',
        body: 'You can invite supporting managers here if needed, or jump back into setup and keep moving.',
        actionTo: '/setup',
        actionLabel: 'Back to Setup'
      };
    }

    return null;
  }, [driverAccessQuery.data?.starter_pin, drivers.length, isSetupFlow, setupFocus]);

  const starterPin = starterPinDraft ?? driverAccessQuery.data?.starter_pin ?? '';

  function openAddModal() {
    setModalMode('add');
    setForm(emptyForm);
    setFieldErrors({});
    setErrorMessage('');
    setSelectedDriverId(null);
    setDocumentDrafts({});
    setDocumentError('');
    setIsModalOpen(true);
  }

  function openManagerModal() {
    setManagerInviteError('');
    setManagerInviteResult(null);
    setManagerInviteForm(emptyManagerInviteForm);
    setIsManagerModalOpen(true);
  }

  function openLaborModal(row) {
    const latestTimecard = row.latest_timecard || null;
    setLaborErrorMessage('');
    setLaborForm({
      driver_id: row.driver_id,
      driver_name: row.driver_name,
      date: selectedWeekDate,
      clock_in: formatDateTimeLocalInput(latestTimecard?.clock_in, selectedWeekDate),
      clock_out: latestTimecard?.clock_out ? formatDateTimeLocalInput(latestTimecard.clock_out, null) : '',
      break_minutes: String(row.break_minutes ?? 0),
      lunch_minutes: String(row.lunch_minutes ?? 0),
      adjustment_reason: ''
    });
    setIsLaborModalOpen(true);
  }

  function openEditModal(driver) {
    setModalMode('edit');
    setSelectedDriverId(driver.id);
    setForm({
      id: driver.id,
      name: driver.name || '',
      email: driver.email || '',
      date_of_birth: driver.date_of_birth || '',
      phone: driver.phone || '',
      hourly_rate: String(driver.hourly_rate ?? ''),
      daily_flat_rate: String(driver.daily_flat_rate ?? ''),
      pin: '',
      confirmPin: ''
    });
    setErrorMessage('');
    setFieldErrors({});
    setDocumentDrafts({});
    setDocumentError('');
    setIsModalOpen(true);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateDocumentDraft(documentType, field, value) {
    setDocumentDrafts((current) => ({
      ...current,
      [documentType]: {
        ...(current[documentType] || emptyDocumentDraft),
        [field]: value
      }
    }));
  }

  function handleDocumentUpload(documentType) {
    setDocumentError('');
    const draft = documentDrafts[documentType] || emptyDocumentDraft;

    if (!selectedDriverId || !draft.file) {
      setDocumentError('Choose a file before uploading.');
      return;
    }

    uploadDriverDocument.mutate({ documentType });
  }

  function handleDocumentRemove(document) {
    const shouldContinue = window.confirm(`Remove ${document.file_name}?`);

    if (!shouldContinue) {
      return;
    }

    removeDriverDocument.mutate(document);
  }

  function handleModalSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    const nextFieldErrors = validateDriverForm(form);

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});

    if (modalMode === 'add') {
      createDriver.mutate();
      return;
    }

    updateDriver.mutate();
  }

  function handleStatusToggle(driver) {
    const nextStatus = !driver.is_active;

    if (!nextStatus) {
      const shouldContinue = window.confirm(
        `Deactivating ${driver.name} will prevent them from logging in. Their history will be preserved. Continue?`
      );

      if (!shouldContinue) {
        return;
      }
    }

    deactivateDriver.mutate({
      driverId: driver.id,
      isActive: nextStatus
    });
  }

  async function handleSendDriverInvite(driver) {
    try {
      const response = await api.post(`/manager/drivers/${driver.id}/invite`);
      const inviteUrl = response.data?.invite_url;
      if (inviteUrl) {
        window.prompt('Email delivery is unavailable. Copy this secure, single-use invite link:', inviteUrl);
      } else {
        window.alert(response.data?.message || `Invite sent to ${driver.email}.`);
      }
    } catch (inviteError) {
      window.alert(inviteError.response?.data?.error || 'Unable to send the driver invite.');
    }
  }

  async function handleResetDriverAccess(driver) {
    try {
      const response = await api.post(`/manager/drivers/${driver.id}/password-reset`);
      const resetUrl = response.data?.reset_url;
      if (resetUrl) window.prompt('Copy this secure, single-use password reset link:', resetUrl);
      else window.alert(response.data?.message || `Password reset sent to ${driver.email}.`);
    } catch (resetError) {
      window.alert(resetError.response?.data?.error || 'Unable to reset driver access.');
    }
  }

  function toggleWeeklyLaborDetail(driverId) {
    setExpandedWeeklyLaborDriverId((current) => (current === driverId ? null : driverId));
    setExpandedDailyLaborDriverId(null);
    setExpandedLiveLaborDriverId(null);
  }

  function toggleDailyLaborDetail(driverId) {
    setExpandedDailyLaborDriverId((current) => (current === driverId ? null : driverId));
    setExpandedWeeklyLaborDriverId(null);
    setExpandedLiveLaborDriverId(null);
  }

  function toggleLiveLaborDetail(driverId) {
    setExpandedLiveLaborDriverId((current) => (current === driverId ? null : driverId));
    setExpandedWeeklyLaborDriverId(null);
    setExpandedDailyLaborDriverId(null);
  }

  function updateManagerInviteField(field, value) {
    setManagerInviteForm((current) => ({ ...current, [field]: value }));
  }

  function handleManagerInviteSubmit(event) {
    event.preventDefault();
    setManagerInviteError('');

    if (!managerInviteForm.email.trim()) {
      setManagerInviteError('Manager email is required.');
      return;
    }

    inviteManagerUser.mutate();
  }

  function handleStarterPinSubmit(event) {
    event.preventDefault();
    setStarterPinError('');

    if (!/^\d{4}$/.test(String(starterPin))) {
      setStarterPinError('Starter PIN must be a 4-digit code.');
      return;
    }

    updateDriverAccess.mutate();
  }

  function updateLaborField(field, value) {
    setLaborForm((current) => ({ ...current, [field]: value }));
  }

  function handleLaborSubmit(event) {
    event.preventDefault();
    setLaborErrorMessage('');

    if (!laborForm.clock_in) {
      setLaborErrorMessage('Clock in time is required.');
      return;
    }

    if (!laborForm.adjustment_reason.trim()) {
      setLaborErrorMessage('A reason is required for labor edits.');
      return;
    }

    if (laborForm.clock_out) {
      const clockInIso = localInputToIso(laborForm.clock_in);
      const clockOutIso = localInputToIso(laborForm.clock_out);

      if (!clockInIso || !clockOutIso) {
        setLaborErrorMessage('Clock in and clock out must be valid datetimes.');
        return;
      }

      if (new Date(clockOutIso).getTime() <= new Date(clockInIso).getTime()) {
        setLaborErrorMessage('Clock out must be later than clock in.');
        return;
      }
    }

    updateLabor.mutate();
  }

  return (
    <section className="page-section">
      <div className="page-header">
        <div>
          <h1>Drivers</h1>
          <p>Manage access, pay rates, and performance for your active fleet.</p>
        </div>
        <div className="page-header-actions">
          <button className="primary-cta manifest-button" onClick={openManagerModal} type="button">
            Add Manager
          </button>
          <button className="primary-cta manifest-button" onClick={openAddModal} type="button">
            Add Driver
          </button>
        </div>
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

      <DriverTabs activeTab={activeDriversTab} onChange={setActiveDriversTab} />

      {activeDriversTab === 'directory' ? (
        <>
      <div className="card driver-access-card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Driver Access</div>
            <div className="driver-meta">
              New drivers can start with one shared CSA PIN, then get a personal reset later if needed.
            </div>
          </div>
        </div>
        <form className="driver-access-inline-form" onSubmit={handleStarterPinSubmit}>
          <label className="field-group">
            <span className="field-label">Starter Driver PIN</span>
            <input
              className="text-field"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setStarterPinDraft(event.target.value)}
              placeholder="4-digit PIN"
              type="password"
              value={starterPin}
            />
          </label>
          <button className="primary-inline-button" disabled={updateDriverAccess.isPending} type="submit">
            {updateDriverAccess.isPending ? 'Saving...' : 'Save Starter PIN'}
          </button>
        </form>
        {starterPinError ? <div className="error-banner">{starterPinError}</div> : null}
        {driverAccessQuery.isLoading ? <LoadingState skeletonRows={1} title="Loading current starter PIN" /> : null}
      </div>

      <div className="info-banner">
        Drivers do not need to self-register. Use each driver&apos;s email as the login, assign a simple 4-digit PIN from this page, and the app will keep them signed in until you deactivate them or reset their access.
      </div>

      <div className="card">
        <div className="section-title-row drivers-directory-toolbar">
          <div>
            <div className="card-title">Driver Directory</div>
            <div className="driver-meta">
              Every driver added to this CSA appears here, even before they have any labor activity.
            </div>
          </div>
          <div className="drivers-directory-toolbar-actions">
            <input
              aria-label="Search drivers"
              className="text-field"
              onChange={(event) => {
                setDriverSearch(event.target.value);
                setDriverPage(1);
              }}
              placeholder="Search name, email, phone, or document status"
              type="search"
              value={driverSearch}
            />
            <select
              aria-label="Filter drivers by status"
              className="text-field drivers-directory-filter"
              onChange={(event) => {
                setDriverStatusFilter(event.target.value);
                setDriverPage(1);
              }}
              value={driverStatusFilter}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              aria-label="Filter drivers by compliance"
              className="text-field drivers-directory-filter"
              onChange={(event) => {
                setDriverComplianceFilter(event.target.value);
                setDriverPage(1);
              }}
              value={driverComplianceFilter}
            >
              <option value="all">All Compliance</option>
              <option value="good">Good Standing</option>
              <option value="needs_documents">Needs Documents</option>
              <option value="expiring_soon">Expiring Soon</option>
              <option value="expired">Expired Docs</option>
              <option value="not_reviewed">Not Reviewed</option>
            </select>
            <select
              aria-label="Sort drivers"
              className="text-field drivers-directory-sort"
              onChange={(event) => {
                setDriverSortKey(event.target.value);
                setDriverPage(1);
              }}
              value={driverSortKey}
            >
              {DRIVER_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{`Sort by ${option.label}`}</option>
              ))}
            </select>
            <select
              aria-label="Driver sort direction"
              className="text-field drivers-directory-filter"
              onChange={(event) => {
                setDriverSortDirection(event.target.value);
                setDriverPage(1);
              }}
              value={driverSortDirection}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <span className="driver-meta drivers-directory-count">
              {filteredDrivers.length} of {drivers.length} driver{drivers.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {driversQuery.isLoading ? (
          <LoadingState title="Loading drivers" />
        ) : driversQuery.isError ? (
          <ErrorState
            title="Unable to load drivers"
            description="The driver directory could not be loaded."
            onRetry={() => driversQuery.refetch()}
          />
        ) : drivers.length ? (
          <>
            {filteredDrivers.length ? (
              <>
                <div className="drivers-manager-table driver-profile-table">
                  <div className="drivers-manager-table-header">
                    <span>Driver</span>
                    <span>Contact</span>
                    <span>Documents</span>
                    <span>Compliance</span>
                    <span>App Access</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  {pagedDrivers.map((driver) => (
                    <div className="drivers-manager-table-row" key={driver.id}>
                      <div className="drivers-manager-driver-cell">
                        <div>
                          <strong>{driver.name}</strong>
                          <span>{driver.fedex_driver_id ? `FedEx ID ${driver.fedex_driver_id}` : 'No FedEx ID'}</span>
                        </div>
                      </div>
                      <div className="drivers-table-value driver-contact-cell">
                        <span className="driver-phone-text">{formatPhoneDisplay(driver.phone)}</span>
                        <span className="driver-email-text" title={driver.email}>{driver.email}</span>
                      </div>
                      <span className={`driver-doc-chip ${driver.document_summary?.missing_required?.length ? 'driver-doc-chip-warning' : 'driver-doc-chip-success'}`}>
                        {getDocumentSummaryLabel(driver)}
                      </span>
                      <span className={`driver-doc-chip ${driver.document_summary?.expired ? 'driver-doc-chip-danger' : driver.document_summary?.expiring_soon || driver.document_summary?.missing_required?.length ? 'driver-doc-chip-warning' : 'driver-doc-chip-success'}`}>
                        {getComplianceLabel(driver)}
                      </span>
                      <span className="drivers-muted-value">PIN enabled</span>
                      <span className={`driver-doc-chip ${driver.is_active ? 'driver-doc-chip-success' : 'driver-doc-chip-neutral'}`}>
                        {driver.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <div className="drivers-table-actions">
                        <button className="secondary-inline-button" onClick={() => handleSendDriverInvite(driver)} type="button">
                          Send Invite
                        </button>
                        <button className="secondary-inline-button" onClick={() => handleResetDriverAccess(driver)} type="button">
                          Reset Access
                        </button>
                        <button className="secondary-inline-button" onClick={() => openEditModal(driver)} type="button">
                          Edit
                        </button>
                        <button className="secondary-inline-button" onClick={() => handleStatusToggle(driver)} type="button">
                          {driver.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="drivers-pagination" aria-label="Driver directory pagination">
                  <span className="driver-meta">
                    Showing {driverPaginationStart}-{driverPaginationEnd} of {filteredDrivers.length}
                  </span>
                  <label className="drivers-page-size">
                    <span className="field-label">Rows</span>
                    <select
                      className="text-field"
                      onChange={(event) => {
                        setDriverPageSize(Number(event.target.value));
                        setDriverPage(1);
                      }}
                      value={driverPageSize}
                    >
                      {DRIVER_PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <div className="drivers-pagination-actions">
                    <button
                      className="secondary-inline-button"
                      disabled={visibleDriverPage <= 1}
                      onClick={() => setDriverPage(Math.max(1, visibleDriverPage - 1))}
                      type="button"
                    >
                      Previous
                    </button>
                    <span className="drivers-pagination-page">Page {visibleDriverPage} of {driverPageCount}</span>
                    <button
                      className="secondary-inline-button"
                      disabled={visibleDriverPage >= driverPageCount}
                      onClick={() => setDriverPage(Math.min(driverPageCount, visibleDriverPage + 1))}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                variant="inline"
                title="No drivers match the current search or filters"
                description="Clear or adjust the search, status, compliance, or sort controls to see more drivers."
              />
            )}
          </>
        ) : (
          <EmptyState
            variant="inline"
            title="No drivers have been added to this CSA yet"
            description="Add your first driver to make them available for route assignment and app access."
          />
        )}
      </div>
        </>
      ) : null}

      {activeDriversTab === 'labor' ? (
        <>
      <div className="card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Live Labor</div>
            <div className="driver-meta">
              Real-time clock-in, lunch, and break visibility for {selectedWeekDate}.
            </div>
          </div>
          <div className="driver-meta">
            {selectedWeekDate === getTodayString() ? 'Auto-refreshing every 30 seconds' : 'Historical date selected'}
          </div>
        </div>

        {liveLaborQuery.isLoading ? (
          <LoadingState title="Loading live labor status" />
        ) : liveLaborQuery.isError ? (
          <ErrorState
            title="Unable to load live labor status"
            description="Live labor totals and driver rows could not be loaded."
            onRetry={() => liveLaborQuery.refetch()}
          />
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Working</div>
                <div className="stat-value small">{liveLaborQuery.data?.totals?.working ?? 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">On Lunch</div>
                <div className="stat-value small">{liveLaborQuery.data?.totals?.on_lunch ?? 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">On Break</div>
                <div className="stat-value small">{liveLaborQuery.data?.totals?.on_break ?? 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Not Clocked In</div>
                <div className="stat-value small">{liveLaborQuery.data?.totals?.not_clocked_in ?? 0}</div>
              </div>
            </div>

            <div className="weekly-timecard-table live-labor-table">
              <div className="weekly-timecard-header">
                <span>Driver</span>
                <span>Status</span>
                <span>Current Shift</span>
                <span>Worked</span>
                <span>Breaks</span>
                <span>Actions</span>
              </div>

              {(liveLaborQuery.data?.drivers || []).map((row) => {
                const driverRecord = drivers.find((driver) => driver.id === row.driver_id) || null;
                const isExpanded = expandedLiveLaborDriverId === row.driver_id;
                const breakEndsIn = getMinutesUntil(row.active_break?.scheduled_end_at);

                return (
                  <div className="weekly-timecard-group" key={`live-${row.driver_id}`}>
                    <div className="weekly-timecard-row">
                      <div className="driver-cell-stack">
                        <strong>{row.driver_name}</strong>
                        <div className="driver-cell-meta">
                          <small>{row.email}</small>
                          <small className="driver-cell-phone">{formatPhoneDisplay(driverRecord?.phone || row.phone)}</small>
                        </div>
                      </div>
                      <div className="live-status-cell">
                        <span className={`live-status-chip ${getLiveStatusClass(row.status?.code)}`}>
                          {row.status?.label || 'Unknown'}
                        </span>
                        {row.active_break?.scheduled_end_at ? (
                          <small>
                            Ends {formatShortTime(row.active_break.scheduled_end_at)}
                            {breakEndsIn !== null ? ` · ${breakEndsIn} min` : ''}
                          </small>
                        ) : null}
                      </div>
                      <span>{row.latest_timecard ? formatShiftWindow(row.latest_timecard.clock_in, row.latest_timecard.clock_out) : '—'}</span>
                      <span>{formatHours(row.worked_hours)}</span>
                      <span>{`${formatMinutes(row.break_minutes)} · ${formatMinutes(row.lunch_minutes)} lunch`}</span>
                      <span>
                        <button className="secondary-inline-button" onClick={() => toggleLiveLaborDetail(row.driver_id)} type="button">
                          {isExpanded ? 'Hide' : 'View'}
                        </button>
                      </span>
                    </div>
                    {isExpanded ? (
                      <div className="labor-detail-panel">
                        <div className="driver-directory-actions">
                          <button className="secondary-inline-button" onClick={() => openLaborModal(row)} type="button">
                            Edit Labor
                          </button>
                        </div>
                        {row.latest_timecard ? (
                          <div className="labor-shift-card">
                            <div className="labor-shift-topline">
                              <strong>{row.latest_timecard.route_name ? `Route ${row.latest_timecard.route_name}` : 'No route linked'}</strong>
                              <span>{formatShiftWindow(row.latest_timecard.clock_in, row.latest_timecard.clock_out)}</span>
                            </div>
                            <div className="labor-shift-metrics">
                              <span>{formatHours(row.worked_hours)} worked so far</span>
                              <span>{formatMinutes(row.break_minutes)} total breaks</span>
                              <span>{formatMinutes(row.lunch_minutes)} lunch</span>
                              {row.latest_timecard.manager_adjusted ? <span>Manager adjusted</span> : null}
                            </div>
                            {row.latest_timecard.compliance_flags?.length ? (
                              <div className="labor-flag-list">
                                {row.latest_timecard.compliance_flags.map((flag) => (
                                  <span className="labor-flag-chip" key={`${row.driver_id}-${flag}`}>{flag}</span>
                                ))}
                              </div>
                            ) : null}
                            {row.adjustments?.length ? (
                              <div className="labor-audit-list">
                                {row.adjustments.map((adjustment) => (
                                  <div className="labor-audit-card" key={adjustment.id}>
                                    <strong>{formatDateTime(adjustment.created_at)}</strong>
                                    <span>{adjustment.adjustment_reason}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {(row.timecards || []).length ? (
                              <div className="labor-break-list">
                                {row.timecards.flatMap((timecard) => timecard.breaks || []).map((breakRow) => (
                                  <span className="labor-break-chip" key={breakRow.id}>
                                    {`${String(breakRow.break_type || 'break').toUpperCase()} · ${formatShortTime(breakRow.started_at)}${
                                      breakRow.ended_at ? ` → ${formatShortTime(breakRow.ended_at)}` : ' · Active'
                                    }`}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="labor-empty-state">No labor activity recorded for this driver on {selectedWeekDate}.</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Finalized Day</div>
            <div className="driver-meta">
              {dailyLaborQuery.data?.snapshot
                ? `Finalized at ${new Date(dailyLaborQuery.data.snapshot.finalized_at).toLocaleString()}`
                : 'This day will finalize automatically when the last driver clocks out.'}
            </div>
          </div>
        </div>

        {dailyLaborQuery.isLoading ? (
          <LoadingState title="Loading finalized labor snapshot" />
        ) : dailyLaborQuery.isError ? (
          <ErrorState
            title="Unable to load finalized day snapshot"
            description="The finalized labor snapshot could not be loaded for this date."
            onRetry={() => dailyLaborQuery.refetch()}
          />
        ) : dailyLaborQuery.data?.snapshot ? (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Worked Hours</div>
                <div className="stat-value small">{formatHours(dailyLaborQuery.data.snapshot.total_worked_hours)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Payable Hours</div>
                <div className="stat-value small">{formatHours(dailyLaborQuery.data.snapshot.total_payable_hours)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Drivers Finalized</div>
                <div className="stat-value small">{dailyLaborQuery.data.snapshot.driver_count}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Estimated Payroll</div>
                <div className="stat-value small">{formatCurrency(dailyLaborQuery.data.snapshot.estimated_payroll)}</div>
              </div>
            </div>

            <div className="weekly-timecard-table">
              <div className="weekly-timecard-header">
                <span>Driver</span>
                <span>Shifts</span>
                <span>Worked</span>
                <span>Breaks</span>
                <span>Lunch</span>
                <span>Actions</span>
              </div>

              {(dailyLaborQuery.data.drivers || []).map((row) => {
                const driverRecord = drivers.find((driver) => driver.id === row.driver_id) || null;
                const isExpanded = expandedDailyLaborDriverId === row.driver_id;
                const stats = isExpanded ? driverStatsQuery.data : null;
                const groupedExceptions = groupExceptionBreakdown(stats?.exception_code_breakdown || {});

                return (
                <div className="weekly-timecard-group" key={row.driver_id}>
                  <div className="weekly-timecard-row">
                    <div className="driver-cell-stack">
                      <strong>{row.driver_name}</strong>
                      <div className="driver-cell-meta">
                        <small>{row.email}</small>
                        <small className="driver-cell-phone">{formatPhoneDisplay(driverRecord?.phone)}</small>
                      </div>
                    </div>
                    <span>{row.shift_count}</span>
                    <span>{formatHours(row.worked_hours)}</span>
                    <span>{formatMinutes(row.break_minutes)}</span>
                    <span>{formatMinutes(row.lunch_minutes)}</span>
                    <span>
                      <button className="secondary-inline-button" onClick={() => toggleDailyLaborDetail(row.driver_id)} type="button">
                        {isExpanded ? 'Hide' : 'View'}
                      </button>
                    </span>
                  </div>
                  {isExpanded ? (
                    <div className="labor-detail-panel">
                      <div className="driver-directory-actions">
                        {driverRecord ? (
                          <>
                            <button className="secondary-inline-button" onClick={() => openEditModal(driverRecord)} type="button">
                              Edit Driver
                            </button>
                            <button className="secondary-inline-button" onClick={() => handleStatusToggle(driverRecord)} type="button">
                              {driverRecord.is_active ? 'Deactivate Driver' : 'Activate Driver'}
                            </button>
                          </>
                        ) : null}
                      </div>
                      {row.compliance_flags?.length ? (
                        <div className="labor-flag-list">
                          {row.compliance_flags.map((flag) => (
                            <span className="labor-flag-chip" key={`${row.driver_id}-${flag}`}>{flag}</span>
                          ))}
                        </div>
                      ) : null}
                      {row.adjustments?.length ? (
                        <div className="labor-audit-list">
                          {row.adjustments.map((adjustment) => (
                            <div className="labor-audit-card" key={adjustment.id}>
                              <strong>{formatDateTime(adjustment.created_at)}</strong>
                              <span>{adjustment.adjustment_reason}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="stats-grid compact">
                        <div className="stat-card">
                          <div className="stat-label">Last 7 Days Avg Stops/Hr</div>
                          <div className="stat-value small">{stats?.last_7_days_stops_per_hour ?? '--'}</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">Deliveries This Month</div>
                          <div className="stat-value small">{stats?.total_deliveries_this_month ?? 0}</div>
                        </div>
                        <div className="stat-card expansion-card">
                          <div className="stat-label">Exception Code Breakdown</div>
                          <div className="exception-list">
                            {groupedExceptions.length ? (
                              groupedExceptions.map((group) => (
                                <div className="exception-group" key={group.key}>
                                  <div className="exception-group-title">{group.title}</div>
                                  <div className="exception-chip-list">
                                    {group.items.map((item) => (
                                      <div className="exception-chip" key={item.code}>
                                        {item.code} — {item.label}: {item.count}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="driver-meta">No exceptions recorded</div>
                            )}
                          </div>
                        </div>
                      </div>
                      {(row.timecards || []).length ? (
                        (row.timecards || []).map((timecard) => (
                          <div className="labor-shift-card" key={timecard.id}>
                            <div className="labor-shift-topline">
                              <strong>{timecard.route_name ? `Route ${timecard.route_name}` : 'Unlabeled route'}</strong>
                              <span>{formatShiftWindow(timecard.clock_in, timecard.clock_out)}</span>
                            </div>
                            <div className="labor-shift-metrics">
                              <span>{formatHours(timecard.worked_hours)} worked</span>
                              <span>{formatMinutes(timecard.break_minutes)} breaks</span>
                              <span>{formatMinutes(timecard.lunch_minutes)} lunch</span>
                            </div>
                            {(timecard.breaks || []).length ? (
                              <div className="labor-break-list">
                                {timecard.breaks.map((breakRow) => (
                                  <span className="labor-break-chip" key={breakRow.id}>
                                    {`${String(breakRow.break_type || 'break').toUpperCase()} · ${formatMinutes(breakRow.minutes)}`}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="labor-empty-state">No shift detail recorded for this finalized day.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              )})}
            </div>
          </>
        ) : (
          <div className="info-banner">
            Live labor data is still in progress for this day. Once the last driver clocks out, ReadyRoute will finalize the day automatically here.
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Weekly Labor Summary</div>
            <div className="driver-meta">
              {weeklyTimecardsQuery.data
                ? `${weeklyTimecardsQuery.data.week_start} to ${weeklyTimecardsQuery.data.week_end}`
                : 'Current week'}
            </div>
          </div>
          <label className="weekly-date-picker">
            <span className="field-label">Week Of</span>
            <input
              className="date-field"
              onChange={(event) => {
                setSelectedWeekDate(event.target.value);
                saveStoredOperationsDate(event.target.value);
              }}
              type="date"
              value={selectedWeekDate}
            />
          </label>
        </div>

        {weeklyTimecardsQuery.isLoading ? (
          <div className="stats-grid">
            <div className="stat-card skeleton-card"><div className="skeleton-line" style={{ height: 18, width: '55%' }} /><div className="skeleton-line" style={{ height: 32, width: '80%' }} /></div>
            <div className="stat-card skeleton-card"><div className="skeleton-line" style={{ height: 18, width: '55%' }} /><div className="skeleton-line" style={{ height: 32, width: '80%' }} /></div>
            <div className="stat-card skeleton-card"><div className="skeleton-line" style={{ height: 18, width: '55%' }} /><div className="skeleton-line" style={{ height: 32, width: '80%' }} /></div>
            <div className="stat-card skeleton-card"><div className="skeleton-line" style={{ height: 18, width: '55%' }} /><div className="skeleton-line" style={{ height: 32, width: '80%' }} /></div>
          </div>
        ) : weeklyTimecardsQuery.isError ? (
          <ErrorState
            title="Unable to load weekly labor data"
            description="Weekly labor totals and timecards could not be loaded."
            onRetry={() => weeklyTimecardsQuery.refetch()}
          />
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Worked Hours</div>
                <div className="stat-value small">{formatHours(weeklyTimecardsQuery.data?.totals?.worked_hours)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Payable Hours</div>
                <div className="stat-value small">{formatHours(weeklyTimecardsQuery.data?.totals?.payable_hours)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Break Minutes</div>
                <div className="stat-value small">{formatMinutes(weeklyTimecardsQuery.data?.totals?.break_minutes)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Lunch Minutes</div>
                <div className="stat-value small">{formatMinutes(weeklyTimecardsQuery.data?.totals?.lunch_minutes)}</div>
              </div>
            </div>

            <div className="weekly-timecard-table">
              <div className="weekly-timecard-header">
                <span>Driver</span>
                <span>Shifts</span>
                <span>Worked</span>
                <span>Breaks</span>
                <span>Lunch</span>
                <span>Actions</span>
              </div>

              {(weeklyTimecardsQuery.data?.drivers || []).map((row) => {
                const driverRecord = drivers.find((driver) => driver.id === row.driver_id) || null;
                const isExpanded = expandedWeeklyLaborDriverId === row.driver_id;
                const stats = isExpanded ? driverStatsQuery.data : null;
                const groupedExceptions = groupExceptionBreakdown(stats?.exception_code_breakdown || {});

                return (
                <div className="weekly-timecard-group" key={row.driver_id}>
                  <div className="weekly-timecard-row">
                    <div className="driver-cell-stack">
                      <strong>{row.driver_name}</strong>
                      <div className="driver-cell-meta">
                        <small>{row.email}</small>
                        <small className="driver-cell-phone">{formatPhoneDisplay(driverRecord?.phone)}</small>
                      </div>
                    </div>
                    <span>{row.shift_count}</span>
                    <span>{formatHours(row.worked_hours)}</span>
                    <span>{formatMinutes(row.break_minutes)}</span>
                    <span>{formatMinutes(row.lunch_minutes)}</span>
                    <span>
                      <button className="secondary-inline-button" onClick={() => toggleWeeklyLaborDetail(row.driver_id)} type="button">
                        {isExpanded ? 'Hide' : 'View'}
                      </button>
                    </span>
                  </div>
                  {isExpanded ? (
                    <div className="labor-detail-panel">
                      <div className="driver-directory-actions">
                        {driverRecord ? (
                          <>
                            <button className="secondary-inline-button" onClick={() => openEditModal(driverRecord)} type="button">
                              Edit Driver
                            </button>
                            <button className="secondary-inline-button" onClick={() => handleStatusToggle(driverRecord)} type="button">
                              {driverRecord.is_active ? 'Deactivate Driver' : 'Activate Driver'}
                            </button>
                          </>
                        ) : null}
                      </div>
                      {row.compliance_flags?.length ? (
                        <div className="labor-flag-list">
                          {row.compliance_flags.map((flag) => (
                            <span className="labor-flag-chip" key={`${row.driver_id}-${flag}`}>{flag}</span>
                          ))}
                        </div>
                      ) : null}
                      <div className="stats-grid compact">
                        <div className="stat-card">
                          <div className="stat-label">Last 7 Days Avg Stops/Hr</div>
                          <div className="stat-value small">{stats?.last_7_days_stops_per_hour ?? '--'}</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">Deliveries This Month</div>
                          <div className="stat-value small">{stats?.total_deliveries_this_month ?? 0}</div>
                        </div>
                        <div className="stat-card expansion-card">
                          <div className="stat-label">Exception Code Breakdown</div>
                          <div className="exception-list">
                            {groupedExceptions.length ? (
                              groupedExceptions.map((group) => (
                                <div className="exception-group" key={group.key}>
                                  <div className="exception-group-title">{group.title}</div>
                                  <div className="exception-chip-list">
                                    {group.items.map((item) => (
                                      <div className="exception-chip" key={item.code}>
                                        {item.code} — {item.label}: {item.count}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="driver-meta">No exceptions recorded</div>
                            )}
                          </div>
                        </div>
                      </div>
                      {(row.timecards || []).length ? (
                        (row.timecards || []).map((timecard) => (
                          <div className="labor-shift-card" key={timecard.id}>
                            <div className="labor-shift-topline">
                              <strong>{timecard.route_name ? `Route ${timecard.route_name}` : 'Unlabeled route'}</strong>
                              <span>{formatShiftWindow(timecard.clock_in, timecard.clock_out)}</span>
                            </div>
                            <div className="labor-shift-metrics">
                              <span>{formatHours(timecard.worked_hours)} worked</span>
                              <span>{formatMinutes(timecard.break_minutes)} breaks</span>
                              <span>{formatMinutes(timecard.lunch_minutes)} lunch</span>
                            </div>
                            {(timecard.breaks || []).length ? (
                              <div className="labor-break-list">
                                {timecard.breaks.map((breakRow) => (
                                  <span className="labor-break-chip" key={breakRow.id}>
                                    {`${String(breakRow.break_type || 'break').toUpperCase()} · ${formatMinutes(breakRow.minutes)}`}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="labor-empty-state">No shift detail recorded for this week yet.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              )})}
            </div>
          </>
        )}
      </div>
        </>
      ) : null}

      {isModalOpen ? (
        <DriverModal
          documentDrafts={documentDrafts}
          documentError={documentError}
          errorMessage={errorMessage}
          fieldErrors={fieldErrors}
          form={form}
          isDocumentBusy={isDocumentBusy}
          isSubmitting={isSubmitting}
          mode={modalMode}
          onChange={updateField}
          onClose={() => setIsModalOpen(false)}
          onDocumentDraftChange={updateDocumentDraft}
          onDocumentRemove={handleDocumentRemove}
          onDocumentUpload={handleDocumentUpload}
          onSubmit={handleModalSubmit}
          selectedDriver={selectedDriver}
        />
      ) : null}

      {isManagerModalOpen ? (
        <ManagerModal
          errorMessage={managerInviteError}
          form={managerInviteForm}
          isRefreshingInvite={refreshManagerInvite.isPending}
          isSubmitting={inviteManagerUser.isPending}
          managerUsers={managerUsers}
          onChange={updateManagerInviteField}
          onClose={() => setIsManagerModalOpen(false)}
          onRefreshInvite={(managerUserId) => refreshManagerInvite.mutate(managerUserId)}
          onSubmit={handleManagerInviteSubmit}
          result={managerInviteResult}
        />
      ) : null}

      {isLaborModalOpen ? (
        <LaborAdjustmentModal
          errorMessage={laborErrorMessage}
          form={laborForm}
          isSubmitting={updateLabor.isPending}
          onChange={updateLaborField}
          onClose={() => setIsLaborModalOpen(false)}
          onSubmit={handleLaborSubmit}
        />
      ) : null}
    </section>
  );
}
