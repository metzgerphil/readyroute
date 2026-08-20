# RRA simple account-access implementation

Date: 2026-08-20

## Completed journey

1. An owner or authorized business contact signs up and must provide:
   - manager name;
   - manager phone number;
   - local CXPC phone number;
   - local CSA phone number;
   - company-level authorization for AI language interpretation.
2. The authorization applies to the company’s authorized RRA drivers. Each driver sees the current AI-processing notice once; the driver is not asked to authorize every question.
3. RRA may use AI to select approved ReadyRoute knowledge, but AI cannot create or change the operational answer.
4. Drivers can request their own password-reset email from the app and can change their password while signed in.
5. Managers and ReadyRoute staff retain their own public recovery and signed-in password-change paths.
6. Password-email provider acceptance and subsequent delivery events are recorded. ReadyRoute staff can see recent password-email status in the company detail view.
7. Managers can update company AI authorization and all required local contacts in Company settings.
8. Driver questions asking for a local CXPC, CSA, or manager phone number use the company’s stored contact directly without an AI call.

## Deployment order

1. Apply `supabase/migrations/20260820200000_rra_company_ai_and_email_recovery.sql`.
2. Configure `RESEND_WEBHOOK_SECRET` and register `POST /webhooks/resend` in Resend.
3. Deploy the backend.
4. Deploy the ReadyRoute website/company portal and staff portal.
5. Release the updated driver app.

The backend schema gate is intentionally raised to `20260820200000`, so the backend must not be deployed before the migration.

## Required live checks

- Complete a new signup and confirm none of the four local-contact fields can be omitted.
- Confirm the company portal email arrives and the password link opens.
- Sign in as the manager, edit all four local contacts, and save.
- Sign in as a driver and ask “What is my CXPC phone number?” and “What is my manager’s number?”
- Request a driver password reset from the app and complete it.
- Request manager and staff password resets and complete them.
- Confirm corresponding delivery rows move from `accepted` or `sent` to `delivered` after Resend webhooks arrive.
- Confirm the AI notice appears once for a driver and does not reappear after acknowledgment unless the policy version changes.
