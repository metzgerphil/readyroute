export const VEDR_CONNECTION_STATUSES = Object.freeze({
  NOT_STARTED: 'not_started',
  PROVIDER_SELECTED: 'provider_selected',
  WAITING_FOR_LOGIN: 'waiting_for_login',
  CONNECTED: 'connected'
});

export const VEDR_PROVIDER_CONFIG = Object.freeze({
  groundcloud: {
    brandName: 'GroundCloud by Descartes',
    shortName: 'GroundCloud',
    description: 'AI-powered driver safety cameras and scoring',
    dashboardUrl: 'https://groundcloud.io/dashboard/vedr/ki_dashboard_2024/'
  },
  lytx: {
    brandName: 'Lytx',
    shortName: 'Lytx',
    description: 'Video safety, telematics, and fleet risk management',
    dashboardUrl: 'https://login.lytx.com/'
  },
  samsara: {
    brandName: 'Samsara',
    shortName: 'Samsara',
    description: 'Fleet cameras, telematics, and driver safety tools',
    dashboardUrl: 'https://cloud.samsara.com/signin'
  },
  netradyne: {
    brandName: 'Netradyne',
    shortName: 'Netradyne',
    description: 'Driver-facing AI cameras and safety analytics',
    dashboardUrl: 'https://idms.netradyne.com/console/#/login?redirectUrl=%2F'
  },
  motive: {
    brandName: 'Motive',
    shortName: 'Motive',
    description: 'Dash cams, fleet management, and safety coaching',
    dashboardUrl: 'https://account.gomotive.com/log-in'
  },
  surfsight: {
    brandName: 'Surfsight',
    shortName: 'Surfsight',
    description: 'Connected vehicle cameras and video telematics',
    dashboardUrl: 'https://support.surfsight.net/login?locale=us'
  },
  verizon_connect: {
    brandName: 'Verizon Connect',
    shortName: 'Verizon Connect',
    description: 'Fleet visibility, cameras, and telematics operations',
    dashboardUrl: 'https://www.verizonconnect.com/login/'
  },
  geotab: {
    brandName: 'Geotab',
    shortName: 'Geotab',
    description: 'Vehicle telematics, compliance, and driver safety data',
    dashboardUrl: 'https://my.geotab.com/login.html'
  },
  omnitracs: {
    brandName: 'Omnitracs',
    shortName: 'Omnitracs',
    description: 'Fleet safety, compliance, and video telematics',
    dashboardUrl: 'https://login.omnitracs.com/'
  },
  teletrac_navman: {
    brandName: 'Teletrac Navman',
    shortName: 'Teletrac Navman',
    description: 'Fleet tracking, cameras, and driver safety management',
    dashboardUrl: 'https://www.teletracnavman.com/customer-login'
  },
  azuga: {
    brandName: 'Azuga',
    shortName: 'Azuga',
    description: 'Driver behavior monitoring and fleet telematics',
    dashboardUrl: 'https://fleet.azuga.com/login'
  },
  cameramatics: {
    brandName: 'CameraMatics',
    shortName: 'CameraMatics',
    description: 'Fleet cameras, risk events, and safety operations',
    dashboardUrl: 'https://go.cameramatics.com/'
  },
  nextbase: {
    brandName: 'Nextbase',
    shortName: 'Nextbase',
    description: 'Vehicle camera footage and connected fleet video access',
    dashboardUrl: 'https://global.nextbase.com/nz/login.php'
  },
  velocitor: {
    brandName: 'Velocitor Solutions (V-Track)',
    shortName: 'Velocitor',
    description: 'AI camera system, telematics, and driver safety',
    dashboardUrl: 'https://vtrack.velsol.com/Account/Login'
  },
  smartdrive: {
    brandName: 'SmartDrive Systems',
    shortName: 'SmartDrive',
    description: 'Video-based safety events and coaching workflows',
    dashboardUrl: 'https://secure.smartdrive.net/login'
  }
});

export const VEDR_PROVIDER_KEYS = Object.freeze(Object.keys(VEDR_PROVIDER_CONFIG));

export function createEmptyVedrSettings() {
  return {
    provider: null,
    provider_login_url: null,
    provider_username_hint: null,
    connection_status: VEDR_CONNECTION_STATUSES.NOT_STARTED
  };
}

export function getVedrProviderUrl(settings, providerKey) {
  return settings?.provider_login_url || VEDR_PROVIDER_CONFIG[providerKey]?.dashboardUrl || '';
}
