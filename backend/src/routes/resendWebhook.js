const express = require('express');
const { Webhook } = require('svix');

const defaultSupabase = require('../lib/supabase');
const { mapResendEventStatus } = require('../services/emailDeliveryTracking');

function createResendWebhookRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const webhookSecret = options.webhookSecret || process.env.RESEND_WEBHOOK_SECRET;
  const verifyWebhook = options.verifyWebhook || ((payload, headers) => (
    new Webhook(webhookSecret).verify(payload, headers)
  ));

  router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!webhookSecret) return res.status(503).json({ error: 'Resend webhook verification is not configured.' });

    let event;
    try {
      event = verifyWebhook(req.body.toString('utf8'), {
        'svix-id': req.headers['svix-id'],
        'svix-timestamp': req.headers['svix-timestamp'],
        'svix-signature': req.headers['svix-signature']
      });
    } catch (_error) {
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }

    const webhookEventId = String(req.headers['svix-id'] || '').trim();
    const providerMessageId = String(event?.data?.email_id || '').trim() || null;
    const eventType = String(event?.type || '').trim();
    const eventCreatedAt = event?.created_at || new Date().toISOString();

    try {
      const eventInsert = await supabase.from('rra_email_webhook_events').insert({
        webhook_event_id: webhookEventId,
        provider: 'resend',
        event_type: eventType,
        provider_message_id: providerMessageId,
        event_created_at: eventCreatedAt
      });
      if (eventInsert.error?.code === '23505') return res.status(200).json({ received: true, duplicate: true });
      if (eventInsert.error) throw eventInsert.error;

      const deliveryStatus = mapResendEventStatus(eventType);
      if (providerMessageId && deliveryStatus) {
        const { data: current, error: currentError } = await supabase
          .from('rra_email_deliveries')
          .select('id, last_event_at')
          .eq('provider', 'resend')
          .eq('provider_message_id', providerMessageId)
          .maybeSingle();
        if (currentError) throw currentError;
        const incomingEventTime = Date.parse(eventCreatedAt);
        const currentEventTime = current?.last_event_at ? Date.parse(current.last_event_at) : 0;
        if (current && Number.isFinite(incomingEventTime) && incomingEventTime >= currentEventTime) {
          const failureReason = event?.data?.bounce?.message
            || event?.data?.failed?.message
            || event?.data?.suppressed?.message
            || null;
          const update = {
            delivery_status: deliveryStatus,
            failure_reason: failureReason,
            last_event_at: eventCreatedAt,
            updated_at: new Date().toISOString(),
            ...(deliveryStatus === 'delivered' ? { delivered_at: eventCreatedAt } : {})
          };
          const { error: updateError } = await supabase.from('rra_email_deliveries').update(update).eq('id', current.id);
          if (updateError) throw updateError;
        }
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('Resend webhook processing failed:', error);
      return res.status(500).json({ error: 'Webhook could not be processed.' });
    }
  });

  return router;
}

module.exports = { createResendWebhookRouter };
