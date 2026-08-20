async function recordEmailDelivery({
  supabase,
  accountId = null,
  recipientEmail,
  recipientType,
  recipientId = null,
  messageType,
  delivery,
  failureReason = null,
  now = () => new Date()
}) {
  if (!supabase || !recipientEmail || !recipientType || !messageType) return null;
  const timestamp = now().toISOString();
  const status = delivery?.delivered
    ? 'accepted'
    : delivery?.skipped
      ? 'not_configured'
      : 'failed';
  const { data, error } = await supabase
    .from('rra_email_deliveries')
    .insert({
      account_id: accountId,
      recipient_email: String(recipientEmail).trim().toLowerCase(),
      recipient_type: recipientType,
      recipient_id: recipientId,
      message_type: messageType,
      provider_message_id: delivery?.provider_id || null,
      delivery_status: status,
      failure_reason: failureReason || delivery?.reason || null,
      requested_at: timestamp,
      accepted_at: delivery?.delivered ? timestamp : null,
      last_event_at: timestamp,
      updated_at: timestamp
    })
    .select('id, provider_message_id, delivery_status')
    .single();
  if (error) throw error;
  return data;
}

function mapResendEventStatus(eventType) {
  return {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.delivery_delayed': 'delayed',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.failed': 'failed',
    'email.suppressed': 'suppressed'
  }[eventType] || null;
}

module.exports = { mapResendEventStatus, recordEmailDelivery };
