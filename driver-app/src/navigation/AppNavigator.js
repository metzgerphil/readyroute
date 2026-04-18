import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';

import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import ManifestScreen from '../screens/ManifestScreen';
import MyDriveScreen from '../screens/MyDriveScreen';
import StopDetailScreen from '../screens/StopDetailScreen';
import { setUnauthorizedHandler } from '../services/api';
import { getToken, removeToken } from '../services/auth';

const Stack = createStackNavigator();

function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator color="#1b6b73" size="large" />
    </View>
  );
}

export default function AppNavigator() {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [token, setToken] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        const storedToken = await getToken();

        if (isMounted) {
          setToken(storedToken);
        }
      } catch (_error) {
        if (isMounted) {
          setToken(null);
        }
      } finally {
        if (isMounted) {
          setIsBootstrapping(false);
        }
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await removeToken();
      setToken(null);
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShadowVisible: false }}>
      {!token ? (
        <Stack.Screen name="Login" options={{ headerShown: false }}>
          {() => <LoginScreen onAuthenticated={setToken} />}
        </Stack.Screen>
      ) : (
        <>
          <Stack.Screen name="Home" options={{ headerShown: false }}>
            {(props) => <HomeScreen {...props} onLogout={() => setToken(null)} />}
          </Stack.Screen>
          <Stack.Screen component={MyDriveScreen} name="MyDrive" options={{ title: 'My Drive' }} />
          <Stack.Screen component={ManifestScreen} name="Manifest" options={{ title: 'Manifest' }} />
          <Stack.Screen component={StopDetailScreen} name="StopDetail" options={{ title: 'Stop Detail' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: '#f4efe6',
    flex: 1,
    justifyContent: 'center'
  }
});
