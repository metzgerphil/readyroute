import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import api from '../services/api';
import { getTodayString, loadStoredOperationsDate, saveStoredOperationsDate } from '../utils/operationsDate';

function formatHours(value) {
  return `${Number(value || 0).toFixed(2)} hrs`;
}

function formatMinutes(value) {
  return `${Number(value || 0)} min`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(value || 0));
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

export default function RecordsPage() {
  const [selectedDate, setSelectedDate] = useState(loadStoredOperationsDate() || getTodayString());

  function handleDateChange(nextDate) {
    setSelectedDate(nextDate);
    saveStoredOperationsDate(nextDate);
  }

  const recordsQuery = useQuery({
    queryKey: ['manager-records', selectedDate],
    queryFn: async () => {
      const response = await api.get('/manager/records', {
        params: {
          date: selectedDate
        }
      });
      return response.data || null;
    }
  });

  const recentDays = useMemo(() => recordsQuery.data?.recent_days || [], [recordsQuery.data?.recent_days]);
  const routes = useMemo(() => recordsQuery.data?.routes || [], [recordsQuery.data?.routes]);
  const adjustments = useMemo(() => recordsQuery.data?.adjustments || [], [recordsQuery.data?.adjustments]);
  const snapshot = recordsQuery.data?.snapshot || null;

  return (
    <section className="page-section">
      <div className="page-header">
        <div>
          <h1>Records</h1>
          <p>Browse the last 30 days of route history, labor summaries, and manager corrections for this CSA.</p>
        </div>
        <label className="weekly-date-picker">
          <span className="field-label">Selected Day</span>
          <input
            className="date-field"
            max={getTodayString()}
            min={recordsQuery.data?.range_start || ''}
            onChange={(event) => handleDateChange(event.target.value)}
            type="date"
            value={selectedDate}
          />
        </label>
      </div>

      <div className="records-layout">
        <div className="card records-sidebar">
          <div className="card-title">Last 30 Days</div>
          <div className="records-day-list">
            {recentDays.map((day) => (
              <button
                className={`records-day-button${selectedDate === day.date ? ' active' : ''}`}
                key={day.date}
                onClick={() => handleDateChange(day.date)}
                type="button"
              >
                <strong>{day.date}</strong>
                <span>{day.route_count} routes</span>
                <span>{day.adjustment_count} corrections</span>
              </button>
            ))}
          </div>
        </div>

        <div className="records-main">
          <div className="card">
            <div className="section-title-row">
              <div>
                <div className="card-title">Daily Labor Summary</div>
                <div className="driver-meta">
                  {snapshot ? `Finalized at ${formatDateTime(snapshot.finalized_at)}` : `No finalized labor snapshot for ${selectedDate}.`}
                </div>
              </div>
            </div>

            {recordsQuery.isLoading ? (
              <div className="driver-meta">Loading records...</div>
            ) : recordsQuery.isError ? (
              <div className="error-banner">Unable to load records.</div>
            ) : snapshot ? (
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Worked Hours</div>
                  <div className="stat-value small">{formatHours(snapshot.total_worked_hours)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Payable Hours</div>
                  <div className="stat-value small">{formatHours(snapshot.total_payable_hours)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Break Minutes</div>
                  <div className="stat-value small">{formatMinutes(snapshot.total_break_minutes)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Estimated Payroll</div>
                  <div className="stat-value small">{formatCurrency(snapshot.estimated_payroll)}</div>
                </div>
              </div>
            ) : (
              <div className="info-banner">No finalized labor snapshot exists for this day yet.</div>
            )}
          </div>

          <div className="card">
            <div className="section-title-row">
              <div>
                <div className="card-title">Route History</div>
                <div className="driver-meta">All routes recorded for {selectedDate}, including archived ones.</div>
              </div>
            </div>

            {routes.length ? (
              <div className="records-route-list">
                {routes.map((route) => (
                  <div className="records-route-card" key={route.id}>
                    <div className="records-route-topline">
                      <strong>Route {route.work_area_name}</strong>
                      <span>{route.archived_at ? 'Archived' : route.status}</span>
                    </div>
                    <div className="records-route-meta">
                      <span>{route.driver_name || 'No driver assigned'}</span>
                      <span>{route.vehicle_name || 'No vehicle assigned'}</span>
                      <span>{route.total_stops} stops</span>
                      <span>{route.completed_stops} completed</span>
                    </div>
                    <div className="records-route-meta">
                      <span>Source: {route.source || 'manual'}</span>
                      <span>SA#: {route.sa_number || '—'}</span>
                      <span>Contractor: {route.contractor_name || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="labor-empty-state">No routes recorded for this day.</div>
            )}
          </div>

          <div className="card">
            <div className="section-title-row">
              <div>
                <div className="card-title">Manager Corrections</div>
                <div className="driver-meta">Labor edits and reasons captured for {selectedDate}.</div>
              </div>
            </div>

            {adjustments.length ? (
              <div className="labor-audit-list">
                {adjustments.map((adjustment) => (
                  <div className="labor-audit-card" key={adjustment.id}>
                    <strong>{adjustment.driver_name} · {formatDateTime(adjustment.created_at)}</strong>
                    <span>{adjustment.adjustment_reason}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="labor-empty-state">No manager corrections recorded for this day.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
