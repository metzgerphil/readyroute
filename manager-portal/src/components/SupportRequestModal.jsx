import { useEffect, useMemo, useState } from 'react';

import api from '../services/api';

const SUPPORT_CATEGORIES = [
  { value: 'login', label: 'Login or password' },
  { value: 'routes', label: 'Routes' },
  { value: 'manifest', label: 'Manifest upload' },
  { value: 'manager_portal', label: 'Manager portal' },
  { value: 'driver_app', label: 'Driver app' },
  { value: 'vehicle_inspection', label: 'Vehicle inspection' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'billing', label: 'Billing' },
  { value: 'maps_location', label: 'Maps or location' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'other', label: 'Something else' }
];

const SUPPORT_URGENCIES = [
  { value: 'blocking_today', label: 'Blocking today' },
  { value: 'needs_help_soon', label: 'Need help soon' },
  { value: 'question', label: 'Question' },
  { value: 'low', label: 'Low priority' }
];

function getInitialForm(managerIdentity = {}) {
  return {
    name: managerIdentity.name || '',
    email: managerIdentity.email || '',
    phone: '',
    category: 'other',
    urgency: 'question',
    subject: '',
    description: '',
    requestCall: false
  };
}

export default function SupportRequestModal({
  context = {},
  isOpen,
  managerIdentity = {},
  onClose
}) {
  const managerEmail = managerIdentity.email || '';
  const managerName = managerIdentity.name || '';
  const initialForm = useMemo(
    () => getInitialForm({ email: managerEmail, name: managerName }),
    [managerEmail, managerName]
  );
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedTicket, setSubmittedTicket] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setForm(initialForm);
      setIsSubmitting(false);
      setSubmitError('');
      setSubmittedTicket(null);
    }
  }, [initialForm, isOpen]);

  if (!isOpen) {
    return null;
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const response = await api.post('/support/tickets', {
        name: form.name,
        email: form.email,
        phone: form.phone,
        company: context.companyName,
        role: managerIdentity.role || 'manager',
        category: form.category,
        urgency: form.urgency,
        subject: form.subject,
        description: form.description,
        request_call: form.requestCall,
        source: 'manager_portal_support_modal',
        app_surface: 'manager_portal',
        page_url: `${context.pathname || '/'}${context.search || ''}${context.hash || ''}`,
        context: {
          surface: 'manager_portal',
          path: context.pathname || '/',
          search: context.search || '',
          hash: context.hash || '',
          pageTitle: document.title,
          selectedCsaId: context.selectedCsaId || null,
          selectedCsaName: context.selectedCsaName || null,
          tokenCsaId: context.tokenCsaId || null,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        }
      });

      setSubmittedTicket(response.data?.ticket || {});
    } catch (error) {
      setSubmitError(error.response?.data?.error || 'Support request could not be sent right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="support-modal-backdrop" role="presentation">
      <div
        aria-labelledby="support-modal-title"
        aria-modal="true"
        className="support-modal"
        role="dialog"
      >
        <div className="support-modal-header">
          <div>
            <p className="rr-eyebrow">ReadyRoute Support</p>
            <h2 id="support-modal-title">Tell us what is happening</h2>
            <p>
              This includes the page and workspace you are on so support has a head start.
            </p>
          </div>
          <button
            aria-label="Close support request"
            className="support-modal-close"
            onClick={onClose}
            type="button"
          >
            X
          </button>
        </div>

        {submittedTicket ? (
          <div className="support-success-panel" role="status">
            <h3>Support request sent</h3>
            <p>
              We received it as {submittedTicket.ticket_reference || 'a new support ticket'}.
              If you requested a call, we will use the number you provided.
            </p>
            <button className="primary-button" onClick={onClose} type="button">
              Done
            </button>
          </div>
        ) : (
          <form className="support-form" onSubmit={handleSubmit}>
            <div className="support-form-grid">
              <label>
                Name
                <input
                  onChange={(event) => updateField('name', event.target.value)}
                  required
                  type="text"
                  value={form.name}
                />
              </label>
              <label>
                Email
                <input
                  onChange={(event) => updateField('email', event.target.value)}
                  required
                  type="email"
                  value={form.email}
                />
              </label>
              <label>
                Phone
                <input
                  onChange={(event) => updateField('phone', event.target.value)}
                  placeholder="Optional"
                  type="tel"
                  value={form.phone}
                />
              </label>
              <label>
                What area?
                <select
                  onChange={(event) => updateField('category', event.target.value)}
                  value={form.category}
                >
                  {SUPPORT_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Urgency
                <select
                  onChange={(event) => updateField('urgency', event.target.value)}
                  value={form.urgency}
                >
                  {SUPPORT_URGENCIES.map((urgency) => (
                    <option key={urgency.value} value={urgency.value}>
                      {urgency.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subject
                <input
                  onChange={(event) => updateField('subject', event.target.value)}
                  placeholder="Short summary"
                  type="text"
                  value={form.subject}
                />
              </label>
            </div>

            <label className="support-description-field">
              Description
              <textarea
                minLength={10}
                onChange={(event) => updateField('description', event.target.value)}
                placeholder="What were you trying to do, and what went wrong?"
                required
                rows={6}
                value={form.description}
              />
            </label>

            <label className="support-checkbox-row">
              <input
                checked={form.requestCall}
                onChange={(event) => updateField('requestCall', event.target.checked)}
                type="checkbox"
              />
              Request a phone call
            </label>

            <div className="support-context-preview">
              <span>Attached context</span>
              <strong>{context.selectedCsaName || 'Current workspace'}</strong>
              <code>{context.pathname || '/'}</code>
            </div>

            {submitError ? <div className="support-error" role="alert">{submitError}</div> : null}

            <div className="support-modal-actions">
              <button className="secondary-button" onClick={onClose} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Sending...' : 'Send Support Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
