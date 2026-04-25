export const VEDR_PROVIDERS = Object.freeze({
  GROUNDCLOUD: 'groundcloud',
  LYTX: 'lytx',
  SAMSARA: 'samsara',
  NETRADYNE: 'netradyne',
  MOTIVE: 'motive',
  SURFSIGHT: 'surfsight',
  VERIZON_CONNECT: 'verizon_connect',
  GEOTAB: 'geotab',
  OMNITRACS: 'omnitracs',
  TELETRAC_NAVMAN: 'teletrac_navman',
  AZUGA: 'azuga',
  CAMERAMATICS: 'cameramatics',
  NEXTBASE: 'nextbase',
  VELOCITOR: 'velocitor',
  SMARTDRIVE: 'smartdrive'
});

export const VEDR_CONNECTION_STATUSES = Object.freeze({
  NOT_STARTED: 'not_started',
  PROVIDER_SELECTED: 'provider_selected',
  WAITING_FOR_LOGIN: 'waiting_for_login',
  CONNECTED: 'connected'
});

export const ROUTE_SYNC_TIMEZONES = Object.freeze([
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu'
]);

export const ROUTE_SYNC_INTERVAL_OPTIONS = Object.freeze([5, 10, 15, 20, 30, 60]);

export const VEDR_PROVIDER_CONFIG = Object.freeze({
  [VEDR_PROVIDERS.GROUNDCLOUD]: {
    key: VEDR_PROVIDERS.GROUNDCLOUD,
    brandName: 'GroundCloud by Descartes',
    shortName: 'GroundCloud',
    description: 'AI-powered driver safety cameras and scoring',
    connectLabel: 'Connect GroundCloud',
    loginUrlWithRedirect: 'https://groundcloud.io/',
    dashboardUrl: 'https://groundcloud.io/dashboard/vedr/ki_dashboard_2024/'
  },
  [VEDR_PROVIDERS.LYTX]: {
    key: VEDR_PROVIDERS.LYTX,
    brandName: 'Lytx',
    shortName: 'Lytx',
    description: 'Video safety, telematics, and fleet risk management',
    connectLabel: 'Connect Lytx',
    loginUrlWithRedirect: 'https://login.lytx.com/',
    dashboardUrl: 'https://login.lytx.com/'
  },
  [VEDR_PROVIDERS.SAMSARA]: {
    key: VEDR_PROVIDERS.SAMSARA,
    brandName: 'Samsara',
    shortName: 'Samsara',
    description: 'Fleet cameras, telematics, and driver safety tools',
    connectLabel: 'Connect Samsara',
    loginUrlWithRedirect: 'https://cloud.samsara.com/signin',
    dashboardUrl: 'https://cloud.samsara.com/signin'
  },
  [VEDR_PROVIDERS.NETRADYNE]: {
    key: VEDR_PROVIDERS.NETRADYNE,
    brandName: 'Netradyne',
    shortName: 'Netradyne',
    description: 'Driver-facing AI cameras and safety analytics',
    connectLabel: 'Connect Netradyne',
    loginUrlWithRedirect: 'https://idms.netradyne.com/console/#/login?redirectUrl=%2F',
    dashboardUrl: 'https://idms.netradyne.com/console/#/login?redirectUrl=%2F'
  },
  [VEDR_PROVIDERS.MOTIVE]: {
    key: VEDR_PROVIDERS.MOTIVE,
    brandName: 'Motive',
    shortName: 'Motive',
    description: 'Dash cams, fleet management, and safety coaching',
    connectLabel: 'Connect Motive',
    loginUrlWithRedirect: 'https://account.gomotive.com/log-in',
    dashboardUrl: 'https://account.gomotive.com/log-in'
  },
  [VEDR_PROVIDERS.SURFSIGHT]: {
    key: VEDR_PROVIDERS.SURFSIGHT,
    brandName: 'Surfsight',
    shortName: 'Surfsight',
    description: 'Connected vehicle cameras and video telematics',
    connectLabel: 'Connect Surfsight',
    loginUrlWithRedirect: 'https://support.surfsight.net/login?locale=us',
    dashboardUrl: 'https://support.surfsight.net/login?locale=us'
  },
  [VEDR_PROVIDERS.VERIZON_CONNECT]: {
    key: VEDR_PROVIDERS.VERIZON_CONNECT,
    brandName: 'Verizon Connect',
    shortName: 'Verizon Connect',
    description: 'Fleet visibility, cameras, and telematics operations',
    connectLabel: 'Connect Verizon Connect',
    loginUrlWithRedirect: 'https://my.geotab.com/login.html',
    dashboardUrl: 'https://my.geotab.com/login.html'
  },
  [VEDR_PROVIDERS.GEOTAB]: {
    key: VEDR_PROVIDERS.GEOTAB,
    brandName: 'Geotab',
    shortName: 'Geotab',
    description: 'Vehicle telematics, compliance, and driver safety data',
    connectLabel: 'Connect Geotab',
    loginUrlWithRedirect: 'https://my.geotab.com/login.html',
    dashboardUrl: 'https://my.geotab.com/login.html'
  },
  [VEDR_PROVIDERS.OMNITRACS]: {
    key: VEDR_PROVIDERS.OMNITRACS,
    brandName: 'Omnitracs',
    shortName: 'Omnitracs',
    description: 'Fleet safety, compliance, and video telematics',
    connectLabel: 'Connect Omnitracs',
    loginUrlWithRedirect: 'https://login.omnitracs.com/',
    dashboardUrl: 'https://login.omnitracs.com/'
  },
  [VEDR_PROVIDERS.TELETRAC_NAVMAN]: {
    key: VEDR_PROVIDERS.TELETRAC_NAVMAN,
    brandName: 'Teletrac Navman',
    shortName: 'Teletrac Navman',
    description: 'Fleet tracking, cameras, and driver safety management',
    connectLabel: 'Connect Teletrac Navman',
    loginUrlWithRedirect: 'https://www.teletracnavman.com/customer-login',
    dashboardUrl: 'https://www.teletracnavman.com/customer-login'
  },
  [VEDR_PROVIDERS.AZUGA]: {
    key: VEDR_PROVIDERS.AZUGA,
    brandName: 'Azuga',
    shortName: 'Azuga',
    description: 'Driver behavior monitoring and fleet telematics',
    connectLabel: 'Connect Azuga',
    loginUrlWithRedirect: 'https://fleet.azuga.com/login',
    dashboardUrl: 'https://fleet.azuga.com/login'
  },
  [VEDR_PROVIDERS.CAMERAMATICS]: {
    key: VEDR_PROVIDERS.CAMERAMATICS,
    brandName: 'CameraMatics',
    shortName: 'CameraMatics',
    description: 'Fleet cameras, risk events, and safety operations',
    connectLabel: 'Connect CameraMatics',
    loginUrlWithRedirect: 'https://go.cameramatics.com/',
    dashboardUrl: 'https://go.cameramatics.com/'
  },
  [VEDR_PROVIDERS.NEXTBASE]: {
    key: VEDR_PROVIDERS.NEXTBASE,
    brandName: 'Nextbase',
    shortName: 'Nextbase',
    description: 'Vehicle camera footage and connected fleet video access',
    connectLabel: 'Connect Nextbase',
    loginUrlWithRedirect: 'https://global.nextbase.com/nz/login.php',
    dashboardUrl: 'https://global.nextbase.com/nz/login.php'
  },
  [VEDR_PROVIDERS.VELOCITOR]: {
    key: VEDR_PROVIDERS.VELOCITOR,
    brandName: 'Velocitor Solutions (V-Track)',
    shortName: 'Velocitor',
    description: 'AI camera system, telematics, and driver safety',
    connectLabel: 'Connect Velocitor',
    loginUrlWithRedirect: 'https://vtrack.velsol.com/Account/Login',
    dashboardUrl: 'https://vtrack.velsol.com/Account/Login'
  },
  [VEDR_PROVIDERS.SMARTDRIVE]: {
    key: VEDR_PROVIDERS.SMARTDRIVE,
    brandName: 'SmartDrive Systems',
    shortName: 'SmartDrive',
    description: 'Video-based safety events and coaching workflows',
    connectLabel: 'Connect SmartDrive',
    loginUrlWithRedirect: 'https://secure.smartdrive.net/login',
    dashboardUrl: 'https://secure.smartdrive.net/login'
  }
});
