const crypto = require('crypto');

const SUPPORT_ATTACHMENT_BUCKET = process.env.SUPPORT_ATTACHMENT_BUCKET || 'support-attachments';
const MAX_SUPPORT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_SUPPORT_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain'
]);

function normalizeText(value, maxLength = 500) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function sanitizeFileName(value) {
  const name = String(value || 'attachment')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
  return name || 'attachment';
}

function decodeBase64Attachment(value) {
  const raw = String(value || '').trim();
  const encoded = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  return Buffer.from(encoded, 'base64');
}

function buildSupportAttachmentUpload(body = {}, { accountId, ticketId, now = new Date() } = {}) {
  const fileName = sanitizeFileName(body.file_name || body.fileName);
  const mimeType = String(body.mime_type || body.mimeType || '').trim().toLowerCase();
  const buffer = decodeBase64Attachment(body.file_base64 || body.fileBase64);

  if (!ALLOWED_SUPPORT_ATTACHMENT_TYPES.has(mimeType)) {
    return { error: 'Attach an image, PDF, or text file.' };
  }

  if (!buffer.length || buffer.length > MAX_SUPPORT_ATTACHMENT_BYTES) {
    return { error: 'Attachment must be between 1 byte and 8 MB.' };
  }

  const storagePath = [
    accountId || 'public',
    ticketId,
    `${now.getTime()}-${crypto.randomBytes(5).toString('hex')}-${fileName}`
  ].join('/');

  return {
    buffer,
    fileName,
    mimeType,
    storagePath
  };
}

function buildTicketEvent({ ticketId, staffUserId = null, eventType, metadata = {}, now = new Date() }) {
  return {
    ticket_id: ticketId,
    staff_user_id: staffUserId,
    event_type: eventType,
    metadata,
    created_at: now.toISOString()
  };
}

function buildTicketMessage({
  ticketId,
  authorType,
  staffUserId = null,
  requesterEmail = null,
  body,
  isInternal = false,
  now = new Date()
}) {
  const normalizedBody = normalizeText(body, 12000);

  if (!normalizedBody) {
    return { error: 'Reply text is required.' };
  }

  return {
    message: {
      ticket_id: ticketId,
      author_type: authorType,
      staff_user_id: staffUserId,
      requester_email: normalizeText(requesterEmail, 320),
      body: normalizedBody,
      is_internal: Boolean(isInternal),
      created_at: now.toISOString()
    }
  };
}

module.exports = {
  ALLOWED_SUPPORT_ATTACHMENT_TYPES,
  MAX_SUPPORT_ATTACHMENT_BYTES,
  SUPPORT_ATTACHMENT_BUCKET,
  buildSupportAttachmentUpload,
  buildTicketEvent,
  buildTicketMessage,
  sanitizeFileName
};
