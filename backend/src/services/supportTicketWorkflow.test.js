const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildSupportAttachmentUpload,
  buildTicketMessage
} = require('./supportTicketWorkflow');

test('buildSupportAttachmentUpload validates and scopes a private support file', () => {
  const result = buildSupportAttachmentUpload({
    file_name: 'screen shot.png',
    mime_type: 'image/png',
    file_base64: Buffer.from('readyroute').toString('base64')
  }, {
    accountId: 'account-1',
    ticketId: 'ticket-1',
    now: new Date('2026-07-12T12:00:00.000Z')
  });

  assert.equal(result.buffer.toString(), 'readyroute');
  assert.equal(result.fileName, 'screen-shot.png');
  assert.match(result.storagePath, /^account-1\/ticket-1\//);
});

test('buildSupportAttachmentUpload rejects executable files', () => {
  const result = buildSupportAttachmentUpload({
    file_name: 'bad.js',
    mime_type: 'application/javascript',
    file_base64: Buffer.from('alert(1)').toString('base64')
  }, { ticketId: 'ticket-1' });

  assert.match(result.error, /image, PDF, or text/);
});

test('buildTicketMessage distinguishes internal notes from customer replies', () => {
  const result = buildTicketMessage({
    ticketId: 'ticket-1',
    authorType: 'staff',
    staffUserId: 'staff-1',
    body: 'Investigating route import logs.',
    isInternal: true,
    now: new Date('2026-07-12T12:00:00.000Z')
  });

  assert.equal(result.message.is_internal, true);
  assert.equal(result.message.author_type, 'staff');
});
