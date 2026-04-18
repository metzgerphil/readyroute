const appJson = require('./app.json');
const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || undefined;
const bundleIdentifier = 'com.readyroute.driverapp';
module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      eas: {
        projectId: "3de49618-8973-4330-b335-f2901d75ac46"
      }
    },
    ios: {
      ...appJson.expo.ios,
      bundleIdentifier: appJson.expo.ios?.bundleIdentifier || bundleIdentifier,
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist || {}),
        ITSAppUsesNonExemptEncryption: false
      },
      config: {
        ...(appJson.expo.ios?.config || {}),
        ...(googleMapsApiKey ? { googleMapsApiKey } : {})
      }
    },
    android: {
      ...appJson.expo.android,
      package: appJson.expo.android?.package || bundleIdentifier,
      config: {
        ...(appJson.expo.android?.config || {}),
        ...(googleMapsApiKey
          ? {
              googleMaps: {
                apiKey: googleMapsApiKey
              }
            }
          : {})
      }
    }
  }
};
