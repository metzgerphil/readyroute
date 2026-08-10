const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || undefined;
const appVariant = String(process.env.EXPO_PUBLIC_APP_VARIANT || '').trim().toLowerCase();
const isStagingBuild = appVariant
  ? appVariant === 'staging'
  : process.env.EAS_BUILD_PROFILE === 'preview';
const bundleIdentifier = isStagingBuild
  ? 'com.readyroute.driverapp.staging'
  : 'com.readyroute.driverapp';

if (process.env.EAS_BUILD === 'true' && !googleMapsApiKey) {
  throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY for EAS build. Add it to the EAS build environment before creating Android builds.');
}

module.exports = {
  expo: {
    name: isStagingBuild ? 'ReadyRoute Solutions' : 'ReadyRoute',
    slug: 'driver-app',
    version: '1.0.3',
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
        NSPhotoLibraryUsageDescription:
          'ReadyRoute lets drivers and managers choose photos from their camera roll for inspections and driver documents.',
        NSLocationWhenInUseUsageDescription:
          'ReadyRoute uses your location while you are on route so your manager can see route progress, support dispatch decisions, and locate drivers during the workday.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'ReadyRoute shares your location with your company while you are actively running a route, including when the app is in the background or your phone is locked.',
        UIBackgroundModes: ['location', 'remote-notification']
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
    plugins: [
      'expo-secure-store',
      [
        'expo-speech-recognition',
        {
          microphonePermission: 'Allow ReadyRoute to hear your spoken driver question.',
          speechRecognitionPermission: 'Allow ReadyRoute to convert your spoken driver question into text.'
        }
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'ReadyRoute shares your location with your company while you are actively running a route, including when the app is in the background or your phone is locked.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true
        }
      ]
    ],
    extra: {
      eas: {
        projectId: '3de49618-8973-4330-b335-f2901d75ac46'
      }
    }
  }
};
