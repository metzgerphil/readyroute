import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import api from '../services/api';

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
  '013': 'Residential Signature',
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
  phone: '',
  hourly_rate: '',
  pin: '',
  confirmPin: ''
};

const emptyManagerInviteForm = {
  full_name: '',
  email: ''
};

function DriverModal({ form, mode, errorMessage, isSubmitting, onChange, onClose, onSubmit }) {
  const isEdit = mode === 'edit';

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="card-title">{isEdit ? 'Edit Driver' : 'Add Driver'}</div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <input className="text-field" onChange={(event) => onChange('name', event.target.value)} placeholder="Full Name" value={form.name} />
          <input
            className="text-field"
            disabled={isEdit}
            onChange={(event) => onChange('email', event.target.value)}
            placeholder="Email"
            type="email"
            value={form.email}
          />
          <input className="text-field" onChange={(event) => onChange('phone', event.target.value)} placeholder="Phone" value={form.phone} />
          <label className="money-field">
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
          </label>

          {!isEdit ? (
            <>
              <input
                className="text-field"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => onChange('pin', event.target.value)}
                placeholder="4-digit PIN"
                type="password"
                value={form.pin}
              />
              <input
                className="text-field"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => onChange('confirmPin', event.target.value)}
                placeholder="Confirm PIN"
                type="password"
                value={form.confirmPin}
              />
            </>
          ) : null}

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Driver'}
            </button>
          </div>
        </form>
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

        <form className="form-card modal-form" onSubmit={onSubmit}>
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

function getTodayDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
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
  const queryClient = useQueryClient();
  const [selectedWeekDate, setSelectedWeekDate] = useState(getTodayDateString());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [form, setForm] = useState(emptyForm);
  const [errorMessage, setErrorMessage] = useState('');
  const [expandedDriverId, setExpandedDriverId] = useState(null);
  const [expandedWeeklyLaborDriverId, setExpandedWeeklyLaborDriverId] = useState(null);
  const [expandedDailyLaborDriverId, setExpandedDailyLaborDriverId] = useState(null);
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [managerInviteForm, setManagerInviteForm] = useState(emptyManagerInviteForm);
  const [managerInviteError, setManagerInviteError] = useState('');
  const [managerInviteResult, setManagerInviteResult] = useState(null);

  const driversQuery = useQuery({
    queryKey: ['manager-drivers'],
    queryFn: async () => {
      const response = await api.get('/manager/drivers');
      return response.data?.drivers || [];
    }
  });

  const driverStatsQuery = useQuery({
    queryKey: ['manager-driver-stats', expandedDriverId],
    queryFn: async () => {
      const response = await api.get(`/manager/drivers/${expandedDriverId}/stats`);
      return response.data?.stats || null;
    },
    enabled: Boolean(expandedDriverId)
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

  const managerUsersQuery = useQuery({
    queryKey: ['manager-users'],
    queryFn: async () => {
      const response = await api.get('/manager/manager-users');
      return response.data?.manager_users || [];
    }
  });

  const createDriver = useMutation({
    mutationFn: async () => {
      await api.post('/manager/drivers', {
        name: form.name,
        email: form.email,
        phone: form.phone,
        hourly_rate: Number(form.hourly_rate),
        pin: form.pin
      });
    },
    onSuccess: () => {
      setIsModalOpen(false);
      setForm(emptyForm);
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
        phone: form.phone,
        hourly_rate: Number(form.hourly_rate)
      });
    },
    onSuccess: () => {
      setIsModalOpen(false);
      setForm(emptyForm);
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
  const drivers = useMemo(() => driversQuery.data || [], [driversQuery.data]);
  const managerUsers = useMemo(() => managerUsersQuery.data || [], [managerUsersQuery.data]);

  function openAddModal() {
    setModalMode('add');
    setForm(emptyForm);
    setErrorMessage('');
    setIsModalOpen(true);
  }

  function openManagerModal() {
    setManagerInviteError('');
    setManagerInviteResult(null);
    setManagerInviteForm(emptyManagerInviteForm);
    setIsManagerModalOpen(true);
  }

  function openEditModal(driver) {
    setModalMode('edit');
    setForm({
      id: driver.id,
      name: driver.name || '',
      email: driver.email || '',
      phone: driver.phone || '',
      hourly_rate: String(driver.hourly_rate ?? ''),
      pin: '',
      confirmPin: ''
    });
    setErrorMessage('');
    setIsModalOpen(true);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleModalSubmit(event) {
    event.preventDefault();
    setErrorMessage('');

    if (modalMode === 'add') {
      if (form.pin !== form.confirmPin) {
        setErrorMessage('PINs must match.');
        return;
      }

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

  function toggleExpanded(driverId) {
    setExpandedDriverId((current) => (current === driverId ? null : driverId));
  }

  function toggleWeeklyLaborDetail(driverId) {
    setExpandedWeeklyLaborDriverId((current) => (current === driverId ? null : driverId));
  }

  function toggleDailyLaborDetail(driverId) {
    setExpandedDailyLaborDriverId((current) => (current === driverId ? null : driverId));
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

      <div className="card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Driver Directory</div>
            <div className="driver-meta">
              Every driver added to this CSA appears here, even before they have any labor activity.
            </div>
          </div>
          <div className="driver-meta">
            {drivers.length} driver{drivers.length === 1 ? '' : 's'}
          </div>
        </div>

        {driversQuery.isLoading ? (
          <div className="driver-meta">Loading drivers...</div>
        ) : driversQuery.isError ? (
          <div className="error-banner">Unable to load drivers.</div>
        ) : drivers.length ? (
          <div className="driver-directory-list">
            {drivers.map((driver) => (
              <div className="driver-directory-card" key={driver.id}>
                <div className="driver-directory-row">
                  <div className="driver-directory-identity">
                    <strong>{driver.name}</strong>
                    <span>{driver.email}</span>
                  </div>
                  <div className="driver-directory-meta">
                    <span>{formatPhoneDisplay(driver.phone)}</span>
                    <span>{driver.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="driver-directory-rate">
                    {formatCurrency(driver.hourly_rate || 0)}/hr
                  </div>
                </div>
                <div className="driver-directory-actions">
                  <button className="secondary-inline-button" onClick={() => openEditModal(driver)} type="button">
                    Edit Driver
                  </button>
                  <button className="secondary-inline-button" onClick={() => handleStatusToggle(driver)} type="button">
                    {driver.is_active ? 'Deactivate Driver' : 'Activate Driver'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="labor-empty-state">No drivers have been added to this CSA yet.</div>
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
          <div className="driver-meta">Loading finalized labor snapshot...</div>
        ) : dailyLaborQuery.isError ? (
          <div className="error-banner">Unable to load finalized day snapshot.</div>
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
                <span>Rate</span>
                <span>Shifts</span>
                <span>Worked</span>
                <span>Paid</span>
                <span>Breaks</span>
                <span>Lunch</span>
                <span>Est. Pay</span>
                <span>Details</span>
              </div>

              {(dailyLaborQuery.data.drivers || []).map((row) => (
                <div className="weekly-timecard-group" key={row.driver_id}>
                  <div className="weekly-timecard-row">
                    <span>
                      <strong>{row.driver_name}</strong>
                      <small>{row.email}</small>
                    </span>
                    <span>{formatCurrency(row.hourly_rate)}</span>
                    <span>{row.shift_count}</span>
                    <span>{formatHours(row.worked_hours)}</span>
                    <span>{formatHours(row.payable_hours)}</span>
                    <span>{formatMinutes(row.break_minutes)}</span>
                    <span>{formatMinutes(row.lunch_minutes)}</span>
                    <span>{formatCurrency(row.estimated_pay)}</span>
                    <span>
                      <button className="secondary-inline-button" onClick={() => toggleDailyLaborDetail(row.driver_id)} type="button">
                        {expandedDailyLaborDriverId === row.driver_id ? 'Hide' : 'View'}
                      </button>
                    </span>
                  </div>
                  {expandedDailyLaborDriverId === row.driver_id ? (
                    <div className="labor-detail-panel">
                      {row.compliance_flags?.length ? (
                        <div className="labor-flag-list">
                          {row.compliance_flags.map((flag) => (
                            <span className="labor-flag-chip" key={`${row.driver_id}-${flag}`}>{flag}</span>
                          ))}
                        </div>
                      ) : null}
                      {(row.timecards || []).length ? (
                        (row.timecards || []).map((timecard) => (
                          <div className="labor-shift-card" key={timecard.id}>
                            <div className="labor-shift-topline">
                              <strong>{timecard.route_name ? `Route ${timecard.route_name}` : 'Unlabeled route'}</strong>
                              <span>{formatShiftWindow(timecard.clock_in, timecard.clock_out)}</span>
                            </div>
                            <div className="labor-shift-metrics">
                              <span>{formatHours(timecard.worked_hours)} worked</span>
                              <span>{formatHours(timecard.payable_hours)} paid</span>
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
              ))}
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
              onChange={(event) => setSelectedWeekDate(event.target.value)}
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
          <div className="error-banner">Unable to load weekly labor data.</div>
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
                <span>Rate</span>
                <span>Shifts</span>
                <span>Worked</span>
                <span>Paid</span>
                <span>Breaks</span>
                <span>Lunch</span>
                <span>Est. Pay</span>
                <span>Details</span>
              </div>

              {(weeklyTimecardsQuery.data?.drivers || []).map((row) => (
                <div className="weekly-timecard-group" key={row.driver_id}>
                  <div className="weekly-timecard-row">
                    <span>
                      <strong>{row.driver_name}</strong>
                      <small>{row.email}</small>
                    </span>
                    <span>{formatCurrency(row.hourly_rate)}</span>
                    <span>{row.shift_count}</span>
                    <span>{formatHours(row.worked_hours)}</span>
                    <span>{formatHours(row.payable_hours)}</span>
                    <span>{formatMinutes(row.break_minutes)}</span>
                    <span>{formatMinutes(row.lunch_minutes)}</span>
                    <span>{formatCurrency(row.estimated_pay)}</span>
                    <span>
                      <button className="secondary-inline-button" onClick={() => toggleWeeklyLaborDetail(row.driver_id)} type="button">
                        {expandedWeeklyLaborDriverId === row.driver_id ? 'Hide' : 'View'}
                      </button>
                    </span>
                  </div>
                  {expandedWeeklyLaborDriverId === row.driver_id ? (
                    <div className="labor-detail-panel">
                      {row.compliance_flags?.length ? (
                        <div className="labor-flag-list">
                          {row.compliance_flags.map((flag) => (
                            <span className="labor-flag-chip" key={`${row.driver_id}-${flag}`}>{flag}</span>
                          ))}
                        </div>
                      ) : null}
                      {(row.timecards || []).length ? (
                        (row.timecards || []).map((timecard) => (
                          <div className="labor-shift-card" key={timecard.id}>
                            <div className="labor-shift-topline">
                              <strong>{timecard.route_name ? `Route ${timecard.route_name}` : 'Unlabeled route'}</strong>
                              <span>{formatShiftWindow(timecard.clock_in, timecard.clock_out)}</span>
                            </div>
                            <div className="labor-shift-metrics">
                              <span>{formatHours(timecard.worked_hours)} worked</span>
                              <span>{formatHours(timecard.payable_hours)} paid</span>
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
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="driver-admin-table">
          <div className="driver-admin-header">
            <span>Name</span>
            <span>Email</span>
            <span>Phone</span>
            <span>Hourly Rate</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {(drivers || []).map((driver) => {
            const isExpanded = expandedDriverId === driver.id;
            const stats = isExpanded ? driverStatsQuery.data : null;
            const groupedExceptions = groupExceptionBreakdown(stats?.exception_code_breakdown || {});

            return (
              <div className="driver-admin-group" key={driver.id}>
                <button className="driver-admin-row" onClick={() => toggleExpanded(driver.id)} type="button">
                  <span className="driver-name">{driver.name}</span>
                  <span>{driver.email}</span>
                  <span>{driver.phone}</span>
                  <span>{formatCurrency(driver.hourly_rate)}</span>
                  <span>
                    <span className={driver.is_active ? 'online-pill online' : 'online-pill offline'}>
                      {driver.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </span>
                  <span className="row-actions">
                    <button
                      className="icon-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditModal(driver);
                      }}
                      type="button"
                    >
                      ✎
                    </button>
                    <button
                      className="secondary-inline-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleStatusToggle(driver);
                      }}
                      type="button"
                    >
                      {driver.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </span>
                </button>

                {isExpanded ? (
                  <div className="driver-expansion">
                    {driverStatsQuery.isLoading ? (
                      <div className="driver-meta">Loading performance stats...</div>
                    ) : (
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
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {isModalOpen ? (
        <DriverModal
          errorMessage={errorMessage}
          form={form}
          isSubmitting={isSubmitting}
          mode={modalMode}
          onChange={updateField}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleModalSubmit}
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
    </section>
  );
}
