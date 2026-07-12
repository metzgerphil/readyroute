const crypto = require('crypto');

const SESSION_SUBJECT_TYPES = Object.freeze({
  DRIVER: 'driver',
  MANAGER_USER: 'manager_user',
  ACCOUNT_MANAGER: 'account_manager',
  READYROUTE_STAFF: 'readyroute_staff'
});

function getCredentialVersion(credentialHash) {
  return crypto
    .createHash('sha256')
    .update(String(credentialHash || ''))
    .digest('hex')
    .slice(0, 16);
}

function buildCredentialSessionClaims({ subjectType, subjectId, credentialHash }) {
  if (!subjectType || !subjectId || !credentialHash) {
    throw new Error('Credential session subject and hash are required');
  }

  return {
    auth_subject_type: subjectType,
    auth_subject_id: subjectId,
    auth_version: getCredentialVersion(credentialHash)
  };
}

module.exports = {
  SESSION_SUBJECT_TYPES,
  buildCredentialSessionClaims,
  getCredentialVersion
};
