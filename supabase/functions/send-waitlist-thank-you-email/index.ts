import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEFAULT_WAITLIST_TABLE = 'early_access_signups';
const FROM_EMAIL = 'ReadyRoute <info@readyroute.org>';
const REPLY_TO_EMAIL = 'info@readyroute.org';
const SUBJECT = 'Thanks for joining the ReadyRoute early access list';
const MAX_EMAIL_ATTEMPTS = 3;

type WaitlistRow = {
  id?: string;
  name?: string | null;
  email?: string | null;
  email_sent?: boolean | null;
  thank_you_email_attempts?: number | null;
};

type WebhookPayload = {
  record?: WaitlistRow;
  new?: WaitlistRow;
  row?: WaitlistRow;
  [key: string]: unknown;
};

function getSecret(name: string): string {
  const denoValue = (globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno?.env.get(name);
  const processValue = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
  return denoValue || processValue || '';
}

function parseJsonResponse(text: string): Record<string, unknown> {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extractWaitlistRow(payload: WebhookPayload): WaitlistRow {
  if (payload?.record && typeof payload.record === 'object') {
    return payload.record;
  }

  if (payload?.new && typeof payload.new === 'object') {
    return payload.new;
  }

  if (payload?.row && typeof payload.row === 'object') {
    return payload.row;
  }

  return payload as WaitlistRow;
}

function escapeHtml(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFirstName(name: unknown): string | null {
  const trimmed = String(name || '').trim();
  return trimmed ? trimmed.split(/\s+/)[0] || null : null;
}

function buildGreeting(name: unknown): string {
  const firstName = getFirstName(name);
  return firstName ? `Hi ${firstName},` : 'Hi,';
}

function buildEmailBody(row: WaitlistRow): { text: string; html: string } {
  const greeting = buildGreeting(row.name);

  const text = `${greeting}

Thanks for joining the ReadyRoute early access list.

We're building ReadyRoute because we understand the daily pressure contractors carry. Routes need to be organized, drivers need clear information, managers need better visibility, and the tools contractors rely on should not add more strain to already tight margins.

ReadyRoute is being built by people who know those realities firsthand. Our goal is simple: create a practical, affordable routing platform that helps contractors stay organized, support their drivers, and run smoother daily operations.

As we continue building the MVP, early access members will receive product updates, preview opportunities, and the chance to help shape the features that matter most to real operators.

We're glad you're here, and we'll keep you posted as ReadyRoute gets closer to launch.

Thanks again,

The ReadyRoute Team
info@readyroute.org`;

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(SUBJECT)}</title>
      </head>
      <body style="margin:0;background:#ffffff;color:#10293d;font-family:Arial,Helvetica,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;color:transparent;">
          Thanks for joining the ReadyRoute early access list.
        </div>
        <main style="max-width:640px;margin:0 auto;padding:32px 22px 28px;">
          <header style="border-bottom:3px solid #f97316;padding-bottom:18px;margin-bottom:26px;">
            <p style="margin:0;color:#f97316;font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">ReadyRoute</p>
            <h1 style="margin:8px 0 0;color:#10293d;font-size:26px;line-height:1.2;">Thanks for joining early access</h1>
          </header>

          <section style="font-size:16px;line-height:1.65;color:#173042;">
            <p style="margin:0 0 18px;">${escapeHtml(greeting)}</p>
            <p style="margin:0 0 18px;">Thanks for joining the ReadyRoute early access list.</p>
            <p style="margin:0 0 18px;">We're building ReadyRoute because we understand the daily pressure contractors carry. Routes need to be organized, drivers need clear information, managers need better visibility, and the tools contractors rely on should not add more strain to already tight margins.</p>
            <p style="margin:0 0 18px;">ReadyRoute is being built by people who know those realities firsthand. Our goal is simple: create a practical, affordable routing platform that helps contractors stay organized, support their drivers, and run smoother daily operations.</p>
            <p style="margin:0 0 18px;">As we continue building the MVP, early access members will receive product updates, preview opportunities, and the chance to help shape the features that matter most to real operators.</p>
            <p style="margin:0 0 22px;">We're glad you're here, and we'll keep you posted as ReadyRoute gets closer to launch.</p>
            <p style="margin:0;">Thanks again,</p>
            <p style="margin:0;font-weight:700;">The ReadyRoute Team</p>
          </section>

          <footer style="margin-top:34px;padding-top:18px;border-top:1px solid #e3ebf2;color:#6b7a89;font-size:14px;line-height:1.5;">
            <p style="margin:0;">ReadyRoute</p>
            <p style="margin:4px 0 0;"><a href="mailto:info@readyroute.org" style="color:#f97316;text-decoration:none;">info@readyroute.org</a></p>
          </footer>
        </main>
      </body>
    </html>
  `;

  return { text, html };
}

function getAttemptCount(row: WaitlistRow): number {
  const attempts = Number(row.thank_you_email_attempts || 0);
  return Number.isFinite(attempts) && attempts > 0 ? attempts : 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = getSecret('SUPABASE_URL');
  const serviceRoleKey = getSecret('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = getSecret('RESEND_API_KEY');
  const waitlistTable = getSecret('WAITLIST_TABLE') || DEFAULT_WAITLIST_TABLE;

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return jsonResponse({ error: 'Email automation is not configured' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  let row = extractWaitlistRow((await req.json()) as WebhookPayload);
  const email = normalizeEmail(row.email);

  if (!isValidEmail(email)) {
    return jsonResponse({ error: 'Valid waitlist email is required' }, 400);
  }

  const rowQuery = supabase
    .from(waitlistTable)
    .select('id,name,email,email_sent,thank_you_email_attempts')
    .eq(row.id ? 'id' : 'email', row.id || email)
    .limit(1)
    .single();

  const { data: currentRow, error: rowError } = await rowQuery;

  if (rowError || !currentRow) {
    return jsonResponse({ error: 'Waitlist row was not found' }, 404);
  }

  row = currentRow as WaitlistRow;

  if (row.email_sent === true) {
    return jsonResponse({ ok: true, skipped: true, reason: 'Email already sent' });
  }

  const previousAttempts = getAttemptCount(row);

  if (previousAttempts >= MAX_EMAIL_ATTEMPTS) {
    return jsonResponse({ ok: true, skipped: true, reason: 'Maximum email attempts reached' });
  }

  const now = new Date().toISOString();
  const nextAttempts = previousAttempts + 1;

  try {
    const message = buildEmailBody(row);
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        reply_to: REPLY_TO_EMAIL,
        subject: SUBJECT,
        text: message.text,
        html: message.html
      })
    });

    const responseText = await resendResponse.text();
    const resendPayload = parseJsonResponse(responseText);

    if (!resendResponse.ok) {
      throw new Error(
        String(
          resendPayload?.message ||
            resendPayload?.error ||
          `Resend failed with status ${resendResponse.status}`
        )
      );
    }

    const resendEmailId = resendPayload?.id || null;
    const { error: updateError } = await supabase
      .from(waitlistTable)
      .update({
        email_sent: true,
        email_sent_at: now,
        resend_email_id: resendEmailId,
        email_error: null,
        thank_you_email_attempts: nextAttempts,
        last_email_attempt_at: now
      })
      .eq('id', row.id);

    if (updateError) {
      throw new Error(`Email sent but tracking update failed: ${updateError.message}`);
    }

    return jsonResponse({
      ok: true,
      delivered: true,
      resend_email_id: resendEmailId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await supabase
      .from(waitlistTable)
      .update({
        email_sent: false,
        email_error: message,
        thank_you_email_attempts: nextAttempts,
        last_email_attempt_at: now
      })
      .eq('id', row.id);

    return jsonResponse({ ok: false, error: message }, 502);
  }
});
