const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || undefined;
const bundleIdentifier = 'com.readyroute.driverapp';

if (process.env.EAS_BUILD === 'true' && !googleMapsApiKey) {
  throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY for EAS build. Add it to the EAS build environment before creating Android builds.');
}

module.exports = {
  expo: {
    name: 'ReadyRoute',
    slug: 'driver-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/readyroute-app-icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff'
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        LSApplicationQueriesSchemes: [
          'comgooglemaps',
          'maps'
        ],
        NSLocationWhenInUseUsageDescription:
          'ReadyRoute uses your location while you are on route so your manager can see route progress, support dispatch decisions, and locate drivers during the workday.'
      },
      config: {
        ...(googleMapsApiKey ? { googleMapsApiKey } : {})
      }
    },
    android: {
      package: bundleIdentifier,
      adaptiveIcon: {
        foregroundImage: './assets/readyroute-adaptive-icon.png',
        backgroundColor: '#ffffff'
      },
      edgeToEdgeEnabled: true,
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION'
      ],
      config: {
        ...(googleMapsApiKey
          ? {
              googleMaps: {
                apiKey: googleMapsApiKey
              }
            }
          : {})
      }
    },
    web: {
      favicon: './assets/favicon.png'
    },
    extra: {
      eas: {
        projectId: '3de49618-8973-4330-b335-f2901d75ac46'
      }
    }
  }
};
