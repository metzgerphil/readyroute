# send-waitlist-thank-you-email

Supabase Edge Function that sends the ReadyRoute early access thank-you email through Resend after a new waitlist signup is inserted.

## Current ReadyRoute Table

The `/mvp` form currently writes to:

```text
public.early_access_signups
```

The prompt called this `waitlist_signups`, but that table does not exist in this repo right now. Use `public.early_access_signups` for the Database Webhook unless the table is renamed later.

The function defaults to `early_access_signups`. If the table is renamed, set this secret:

```bash
supabase secrets set WAITLIST_TABLE=waitlist_signups
```

## Required Secrets

Set these in Supabase before deployment:

```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Do not put `RESEND_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in browser code or public frontend environment files.

## Database Webhook

Create a Supabase Database Webhook:

```text
Name: send-waitlist-thank-you-email
Table: public.early_access_signups
Event: INSERT
Type: Supabase Edge Function
Function: send-waitlist-thank-you-email
Payload: include inserted row
Headers:
  Content-Type: application/json
  Authorization: Bearer <your Supabase anon key>
```

If the table is later renamed to `waitlist_signups`, point the webhook at `public.waitlist_signups` and set `WAITLIST_TABLE=waitlist_signups`.

Keep JWT verification enabled for this function. The Database Webhook should provide the `Authorization` header above.

## Behavior

For each inserted row, the function:

1. Validates that the row contains a valid email address.
2. Looks up the current row in Supabase using the service role key.
3. Skips sending if `email_sent = true`.
4. Skips sending if `thank_you_email_attempts >= 3`.
5. Sends the email through Resend from `ReadyRoute <info@readyroute.org>`.
6. On success, updates:
   - `email_sent = true`
   - `email_sent_at = now`
   - `resend_email_id = Resend message id`
   - `email_error = null`
   - `thank_you_email_attempts = previous attempts + 1`
   - `last_email_attempt_at = now`
7. On failure, updates:
   - `email_sent = false`
   - `email_error = error message`
   - `thank_you_email_attempts = previous attempts + 1`
   - `last_email_attempt_at = now`

## Local Testing

Serve the function locally:

```bash
supabase functions serve send-waitlist-thank-you-email --env-file ./supabase/.env.local
```

Example `supabase/.env.local`:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=your_local_service_role_key
RESEND_API_KEY=your_resend_api_key
WAITLIST_TABLE=early_access_signups
```

Call the local function with a sample webhook payload:

```bash
curl -i \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "INSERT",
    "table": "early_access_signups",
    "schema": "public",
    "record": {
      "id": "replace-with-an-existing-row-id",
      "name": "Phillip Metzger",
      "email": "phillip@example.com"
    }
  }' \
  http://127.0.0.1:54321/functions/v1/send-waitlist-thank-you-email
```

For a full local test, insert a row into `public.early_access_signups`, copy that row id into the curl payload, and confirm the row tracking columns update after the function runs.

## Deployment

Deploy the function:

```bash
supabase functions deploy send-waitlist-thank-you-email
```

Set or confirm production secrets:

```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Then create the Database Webhook in the Supabase dashboard.

Before turning on the webhook, make sure the email tracking migration has been applied:

```bash
supabase db push
```
