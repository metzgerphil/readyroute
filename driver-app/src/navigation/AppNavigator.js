import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';

import MobileNavigationDrawer from '../components/MobileNavigationDrawer';
import { usePortalSession } from '../context/PortalSessionContext';
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import ManagerNotificationsScreen from '../screens/ManagerNotificationsScreen';
import ManagerOverviewScreen from '../screens/ManagerOverviewScreen';
import ManagerRoutesScreen from '../screens/ManagerRoutesScreen';
import ManagerSettingsScreen from '../screens/ManagerSettingsScreen';
import ManifestScreen from '../screens/ManifestScreen';
import MyDriveScreen from '../screens/MyDriveScreen';
import PortalEntryScreen from '../screens/PortalEntryScreen';
import StopDetailScreen from '../screens/StopDetailScreen';

const Stack = createStackNavigator();

function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator color="#1b6b73" size="large" />
    </View>
  );
}

function DrawerMenuButton({ onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuButton, pressed ? styles.menuButtonPressed : null]}>
      <Text style={styles.menuButtonText}>Menu</Text>
    </Pressable>
  );
}

function TrackedScreen({ children, navigation, onFocus, screenName }) {
  useFocusEffect(
    useCallback(() => {
      onFocus(screenName, navigation);
    }, [navigation, onFocus, screenName])
  );

  return children;
}

export default function AppNavigator() {
  const {
    activeMode,
    authenticate,
    availableModes,
    hasAnyAccess,
    identity,
    isBootstrapping,
    needsModeSelection,
    logout,
    selectMode
  } = usePortalSession();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState(null);
  const navigationRef = useRef(null);

  useEffect(() => {
    if (!hasAnyAccess) {
      setIsDrawerOpen(false);
    }
  }, [hasAnyAccess]);

  useEffect(() => {
    if (!hasAnyAccess || needsModeSelection) {
      return;
    }

    if (currentRouteName) {
      return;
    }

    setCurrentRouteName(activeMode === 'manager' ? 'ManagerOverview' : 'Home');
  }, [activeMode, currentRouteName, hasAnyAccess, needsModeSelection]);

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  function openDrawer() {
    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    setIsDrawerOpen(false);
  }

  function handleNavigate(screen) {
    if (screen === currentRouteName) {
      closeDrawer();
      return;
    }

    navigationRef.current?.navigate(screen);
    setCurrentRouteName(screen);
    closeDrawer();
  }

  async function handleSelectMode(mode) {
    await selectMode(mode);
    setCurrentRouteName(mode === 'manager' ? 'ManagerOverview' : 'Home');
    closeDrawer();
  }

  function attachNavigation(screenName, navigation) {
    navigationRef.current = navigation;
    setCurrentRouteName(screenName);
  }

  return (
    <View style={styles.appShell}>
      <Stack.Navigator screenOptions={{ headerShadowVisible: false }}>
        {!hasAnyAccess ? (
          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {() => <LoginScreen onAuthenticated={authenticate} />}
          </Stack.Screen>
        ) : needsModeSelection ? (
          <Stack.Screen name="PortalEntry" options={{ headerShown: false }}>
            {() => <PortalEntryScreen onSelectPortal={handleSelectMode} />}
          </Stack.Screen>
        ) : activeMode === 'manager' ? (
          <>
            <Stack.Screen name="ManagerOverview" options={{ headerShown: false }}>
              {(props) => {
                return (
                  <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerOverview">
                    <ManagerOverviewScreen {...props} onLogout={logout} />
                  </TrackedScreen>
                );
              }}
            </Stack.Screen>
            <Stack.Screen name="ManagerRoutes" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerRoutes">
                  <ManagerRoutesScreen {...props} />
                </TrackedScreen>
              )}
            </Stack.Screen>
            <Stack.Screen name="ManagerNotifications" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerNotifications">
                  <ManagerNotificationsScreen />
                </TrackedScreen>
              )}
            </Stack.Screen>
            <Stack.Screen name="ManagerSettings" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerSettings">
                  <ManagerSettingsScreen availableModes={availableModes} identity={identity} />
                </TrackedScreen>
              )}
            </Stack.Screen>
          </>
        ) : (
          <>
            <Stack.Screen name="Home" options={{ headerShown: false }}>
              {(props) => {
                return (
                  <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="Home">
                    <HomeScreen {...props} onLogout={logout} />
                  </TrackedScreen>
                );
              }}
            </Stack.Screen>
            <Stack.Screen
              name="MyDrive"
              options={{
                title: 'My Drive'
              }}
            >
              {(props) => {
                return (
                  <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="MyDrive">
                    <MyDriveScreen {...props} />
                  </TrackedScreen>
                );
              }}
            </Stack.Screen>
            <Stack.Screen
              name="Manifest"
              options={{
                title: 'Manifest'
              }}
            >
              {(props) => {
                return (
                  <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="Manifest">
                    <ManifestScreen {...props} />
                  </TrackedScreen>
                );
              }}
            </Stack.Screen>
            <Stack.Screen
              name="StopDetail"
              options={{
                title: 'Stop Detail'
              }}
            >
              {(props) => {
                return (
                  <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="StopDetail">
                    <StopDetailScreen {...props} />
                  </TrackedScreen>
                );
              }}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>

      {hasAnyAccess && !needsModeSelection ? (
        <>
          {currentRouteName === 'Home' || currentRouteName == null || String(currentRouteName || '').startsWith('Manager') ? (
            <View pointerEvents="box-none" style={styles.menuButtonWrap}>
              <DrawerMenuButton onPress={openDrawer} />
            </View>
          ) : null}

          <MobileNavigationDrawer
            activeMode={activeMode}
            currentRouteName={currentRouteName}
            identity={identity}
            isOpen={isDrawerOpen}
            onClose={closeDrawer}
            onLogout={logout}
            onNavigate={handleNavigate}
            onSwitchMode={() => handleSelectMode(activeMode === 'manager' ? 'driver' : 'manager')}
            showModeSwitch={availableModes.length > 1}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: '#f4efe6',
    flex: 1,
    justifyContent: 'center'
  },
  menuButtonWrap: {
    left: 20,
    position: 'absolute',
    top: 58
  },
  menuButton: {
    alignItems: 'center',
    backgroundColor: '#ff7a1a',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 72,
    paddingHorizontal: 14
  },
  menuButtonPressed: {
    opacity: 0.92
  },
  menuButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  }
});
