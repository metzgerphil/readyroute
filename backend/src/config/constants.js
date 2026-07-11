const VEDR_PROVIDERS = Object.freeze({
  AZUGA: 'azuga',
  CAMERAMATICS: 'cameramatics',
  GEOTAB: 'geotab',
  GROUNDCLOUD: 'groundcloud',
  LYTX: 'lytx',
  MOTIVE: 'motive',
  NETRADYNE: 'netradyne',
  NEXTBASE: 'nextbase',
  OMNITRACS: 'omnitracs',
  SAMSARA: 'samsara',
  SMARTDRIVE: 'smartdrive',
  SURFSIGHT: 'surfsight',
  TELETRAC_NAVMAN: 'teletrac_navman',
  VERIZON_CONNECT: 'verizon_connect',
  VELOCITOR: 'velocitor'
});

const VEDR_PROVIDER_VALUES = Object.freeze(Object.values(VEDR_PROVIDERS));
const VEDR_CONNECTION_STATUSES = Object.freeze({
  NOT_STARTED: 'not_started',
  PROVIDER_SELECTED: 'provider_selected',
  WAITING_FOR_LOGIN: 'waiting_for_login',
  CONNECTED: 'connected'
});
const VEDR_CONNECTION_STATUS_VALUES = Object.freeze(Object.values(VEDR_CONNECTION_STATUSES));
const PRIVILEGED_MANAGER_ROLES = Object.freeze(['admin', 'owner']);

module.exports = {
  PRIVILEGED_MANAGER_ROLES,
  VEDR_CONNECTION_STATUSES,
  VEDR_CONNECTION_STATUS_VALUES,
  VEDR_PROVIDERS,
  VEDR_PROVIDER_VALUES
};
