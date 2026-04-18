export const VEDR_PROVIDERS = Object.freeze({
  GROUNDCLOUD: 'groundcloud',
  VELOCITOR: 'velocitor'
});

export const VEDR_CONNECTION_STATUSES = Object.freeze({
  NOT_STARTED: 'not_started',
  PROVIDER_SELECTED: 'provider_selected',
  WAITING_FOR_LOGIN: 'waiting_for_login',
  CONNECTED: 'connected'
});

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
  [VEDR_PROVIDERS.VELOCITOR]: {
    key: VEDR_PROVIDERS.VELOCITOR,
    brandName: 'Velocitor Solutions (V-Track)',
    shortName: 'Velocitor',
    description: 'AI camera system, telematics, and driver safety',
    connectLabel: 'Connect Velocitor',
    loginUrlWithRedirect: 'https://v-track.velocitorsolutions.com/',
    dashboardUrl: 'https://v-track.velocitorsolutions.com/'
  }
});
