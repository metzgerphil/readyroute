# ReadyRoute Operational Tools

## Support Desk

- Customer and driver support requests preserve the app/page context where the request began.
- A requester may attach one image, PDF, or text file up to 8 MB when opening a ticket.
- Attachments are stored in the private `support-attachments` Supabase Storage bucket. The API returns short-lived signed URLs only to authenticated ReadyRoute staff.
- Staff can assign tickets, change priority/status, add internal notes, send customer replies, and attach files to replies.
- Customer replies are sent through Resend. Internal notes never generate customer email.
- Ticket events record creation, workflow changes, replies, and internal notes.

## Audited Support View

- Start from ReadyRoute Staff > Companies > Open Support View.
- Staff must provide a reason and may link a support ticket.
- Access is read-only, lasts 30 minutes, and never creates a customer manager token.
- Start, view, and exit events are written to `readyroute_staff_audit_log`.
- Session details, including staff user, account, reason, expiration, request IP, and user agent, are stored in `readyroute_staff_company_access_sessions`.
- Only ReadyRoute owner, admin, and support roles may open Support View. Customer users cannot access it.

## Operating Costs

- The ledger tracks ReadyRoute-wide expenses, not estimated costs allocated to individual customers.
- Recurring templates store predictable vendor, category, amount, and billing day values.
- Applying templates to a month skips templates already present for that month.
- CSV import accepts up to 500 rows. Required headers are `vendor` and `amount` (or `amount_cents`). Optional headers include `category`, `period_month`, `billing_date`, `is_recurring`, `notes`, and `receipt_url`.
- Imports and template application write ReadyRoute staff audit entries.

## Deployment Notes

- Migration: `20260712150000_operational_enhancements.sql`
- Required schema contract: `20260712150000`
- API and staff/manager portal deployment is independent of TestFlight.
- App attachment controls require the next TestFlight build before drivers and mobile managers receive them.
