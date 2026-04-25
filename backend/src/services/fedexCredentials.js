const crypto = require('crypto');

function getCredentialKey() {
  const raw = String(process.env.FEDEX_SYNC_CREDENTIALS_KEY || '').trim();

  if (!raw) {
    return null;
  }

  return crypto.createHash('sha256').update(raw).digest();
}

function hasCredentialEncryptionKey() {
  return Boolean(getCredentialKey());
}

function encryptFedexSecret(value) {
  const normalized = String(value || '');

  if (!normalized) {
    return null;
  }

  const key = getCredentialKey();

  if (!key) {
    throw new Error('Missing FEDEX_SYNC_CREDENTIALS_KEY environment variable');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptFedexSecret(value) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return null;
  }

  const key = getCredentialKey();

  if (!key) {
    throw new Error('Missing FEDEX_SYNC_CREDENTIALS_KEY environment variable');
  }

  const [ivBase64, tagBase64, payloadBase64] = normalized.split('.');

  if (!ivBase64 || !tagBase64 || !payloadBase64) {
    throw new Error('Stored FedEx credential is malformed');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

module.exports = {
  decryptFedexSecret,
  encryptFedexSecret,
  hasCredentialEncryptionKey
};
