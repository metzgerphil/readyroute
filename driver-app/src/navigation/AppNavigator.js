import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MobileNavigationDrawer from '../components/MobileNavigationDrawer';
import SupportRequestModal from '../components/SupportRequestModal';
import { usePortalSession } from '../context/PortalSessionContext';
import api from '../services/api';
import { saveLastPortalMode, saveSessionTokens } from '../services/auth';
import HomeScreen from '../screens/HomeScreen';
import DriverHelpScreen from '../screens/DriverHelpScreen';
import LoginScreen from '../screens/LoginScreen';
import ManagerAccessCodesScreen from '../screens/ManagerAccessCodesScreen';
import ManagerDashboardScreen from '../screens/ManagerDashboardScreen';
import ManagerDriversScreen from '../screens/ManagerDriversScreen';
import ManagerManifestScreen from '../screens/ManagerManifestScreen';
import ManagerMapScreen from '../screens/ManagerMapScreen';
import ManagerRoutesScreen from '../screens/ManagerRoutesScreen';
import ManagerSettingsScreen from '../screens/ManagerSettingsScreen';
import ManagerVedrScreen from '../screens/ManagerVedrScreen';
import ManagerVehiclesScreen from '../screens/ManagerVehiclesScreen';
import ManifestScreen from '../screens/ManifestScreen';
import MyDriveScreen from '../screens/MyDriveScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import PortalEntryScreen from '../screens/PortalEntryScreen';
import StopDetailScreen from '../screens/StopDetailScreen';
import appTheme from '../theme/appTheme';

const Stack = createStackNavigator();
const DRIVER_HELP_ONLY = String(process.env.EXPO_PUBLIC_DRIVER_HELP_ONLY || '').trim().toLowerCase() === 'true';
const SHELL_NAVIGATION_SCREENS = new Set([
  'Home',
  'RouteTools',
  'Manifest',
  'ManagerDashboard',
  'ManagerAccessCodes',
  'ManagerDrivers',
  'ManagerManifest',
  'ManagerMap',
  'ManagerNotifications',
  'ManagerRoutes',
  'ManagerSettings',
  'ManagerVedr',
  'ManagerVehicles',
  'Notifications',
  'MyDrive'
]);

function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator color={appTheme.colors.orange} size="large" />
    </View>
  );
}

function DrawerMenuButton({ label = 'Menu', onPress }) {
  return (
    <Pressable
      accessibilityLabel={`Open ${label.toLowerCase()}`}
      onPress={onPress}
      style={({ pressed }) => [styles.menuButton, pressed ? styles.menuButtonPressed : null]}
    >
      <Text style={styles.menuButtonText}>{label}</Text>
    </Pressable>
  );
}

function BackButton({ onPress, testID }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.backButton, pressed ? styles.menuButtonPressed : null]}
      testID={testID}
    >
      <Text style={styles.backButtonText}>←</Text>
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
  const insets = useSafeAreaInsets();
  const {
    activeMode,
    authenticate,
    availableModes,
    hasAnyAccess,
    identity,
    isBootstrapping,
    needsModeSelection,
    logout,
    selectMode,
    sessionTokens
  } = usePortalSession();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState(null);
  const [isLoadingManagerCsas, setIsLoadingManagerCsas] = useState(false);
  const [isSwitchingManagerCsa, setIsSwitchingManagerCsa] = useState(false);
  const [managerCsaPayload, setManagerCsaPayload] = useState({ current_csa: null, csas: [] });
  const [managerDataVersion, setManagerDataVersion] = useState(0);
  const [managerWorkspaceVersion, setManagerWorkspaceVersion] = useState(0);
  const [hasManagerNotificationAttention, setHasManagerNotificationAttention] = useState(false);
  const navigationRef = useRef(null);
  const managerCsas = managerCsaPayload?.csas || [];
  const currentManagerCsaId = managerCsaPayload?.current_csa?.id || managerCsas.find((csa) => csa?.is_current)?.id || null;

  const loadManagerCsas = useCallback(async () => {
    setIsLoadingManagerCsas(true);

    try {
      const response = await api.get('/manager/csas', {
        authMode: 'manager'
      });
      setManagerCsaPayload(response.data || { current_csa: null, csas: [] });
    } catch (_error) {
      setManagerCsaPayload({ current_csa: null, csas: [] });
    } finally {
      setIsLoadingManagerCsas(false);
    }
  }, []);

  const loadManagerNotificationAttention = useCallback(async () => {
    if (activeMode !== 'manager' || !sessionTokens?.managerToken) {
      setHasManagerNotificationAttention(false);
      return;
    }

    try {
      const response = await api.get('/manager/notifications', {
        authMode: 'manager'
      });
      const notifications = Array.isArray(response.data?.notifications) ? response.data.notifications : [];
      setHasManagerNotificationAttention(notifications.some((notification) => (
        notification.status !== 'read'
      )));
    } catch (_error) {
      setHasManagerNotificationAttention(false);
    }
  }, [activeMode, sessionTokens?.managerToken]);

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

    setCurrentRouteName(activeMode === 'manager' ? 'ManagerDashboard' : 'Home');
  }, [activeMode, currentRouteName, hasAnyAccess, needsModeSelection]);

  useEffect(() => {
    if (activeMode !== 'manager' || !sessionTokens?.managerToken) {
      setManagerCsaPayload({ current_csa: null, csas: [] });
      return;
    }

    loadManagerCsas();
  }, [activeMode, loadManagerCsas, managerWorkspaceVersion, sessionTokens?.managerToken]);

  useEffect(() => {
    loadManagerNotificationAttention();
  }, [loadManagerNotificationAttention, managerDataVersion, managerWorkspaceVersion]);

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  function openDrawer() {
    setIsDrawerOpen(true);
    if (activeMode === 'manager' && sessionTokens?.managerToken) {
      loadManagerCsas();
      loadManagerNotificationAttention();
    }
  }

  function closeDrawer() {
    setIsDrawerOpen(false);
  }

  function openSupport() {
    setIsDrawerOpen(false);
    setIsSupportOpen(true);
  }

  function handleNavigate(screen) {
    if (!SHELL_NAVIGATION_SCREENS.has(screen)) {
      closeDrawer();
      return;
    }

    if (screen === currentRouteName) {
      closeDrawer();
      return;
    }

    navigationRef.current?.navigate(screen);
    setCurrentRouteName(screen);
    closeDrawer();
  }

  function handleManagerBack() {
    const navigation = navigationRef.current;

    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    navigation?.navigate?.('ManagerDashboard');
    setCurrentRouteName('ManagerDashboard');
    closeDrawer();
  }

  async function handleSelectMode(mode) {
    if (mode === 'driver' && !availableModes.includes('driver') && sessionTokens?.managerToken) {
      const response = await api.post('/auth/mobile/manager-driver-session', {}, {
        authMode: 'manager'
      });
      const driverToken = response.data?.driver_token;

      if (driverToken) {
        const nextTokens = {
          ...sessionTokens,
          driverToken
        };

        await saveSessionTokens(nextTokens);
        await saveLastPortalMode('driver', nextTokens);
        await authenticate(nextTokens);
        setCurrentRouteName('Home');
        closeDrawer();
        return;
      }
    }

    await selectMode(mode);
    setCurrentRouteName(mode === 'manager' ? 'ManagerDashboard' : 'Home');
    closeDrawer();
  }

  async function handleManagerWorkspaceSwitch(managerToken) {
    let driverToken = null;

    try {
      const response = await api.post('/auth/mobile/manager-driver-session', {}, {
        authMode: 'manager',
        authToken: managerToken
      });
      driverToken = response.data?.driver_token || null;
    } catch (_error) {
      // Driver token refresh failed; manager mode still switches, driver mode may be limited.
    }

    const nextTokens = {
      driverToken,
      managerToken
    };

    await saveSessionTokens(nextTokens);
    await saveLastPortalMode('manager', nextTokens);
    await authenticate(nextTokens);

    setManagerWorkspaceVersion((current) => current + 1);
    if (!String(currentRouteName || '').startsWith('Manager')) {
      navigationRef.current?.navigate?.('ManagerDashboard', {
        csaSwitchAt: Date.now()
      });
      setCurrentRouteName('ManagerDashboard');
    }
    closeDrawer();
  }

  async function handleManagerCsaSelect(accountId) {
    if (!accountId || accountId === currentManagerCsaId || isSwitchingManagerCsa) {
      return;
    }

    setIsSwitchingManagerCsa(true);

    try {
      const response = await api.post('/manager/csas/switch', {
        account_id: accountId
      }, {
        authMode: 'manager'
      });
      const nextManagerToken = response.data?.token;

      if (!nextManagerToken) {
        throw new Error('CSA switch did not return a manager token.');
      }

      await handleManagerWorkspaceSwitch(nextManagerToken);
    } catch (_error) {
      Alert.alert('CSA Switch Failed', 'Could not switch to the selected CSA. Please try again.');
    } finally {
      setIsSwitchingManagerCsa(false);
    }
  }

  function handleManagerDataRefresh() {
    setManagerDataVersion((current) => current + 1);
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
            <Stack.Screen name="ManagerDashboard" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerDashboard">
                  <ManagerDashboardScreen
                    {...props}
                    csaWorkspaceVersion={managerWorkspaceVersion + managerDataVersion}
                    identity={identity}
                  />
                </TrackedScreen>
              )}
            </Stack.Screen>
            <Stack.Screen name="ManagerRoutes" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerRoutes">
                  <ManagerRoutesScreen
                    {...props}
                    csaWorkspaceVersion={managerWorkspaceVersion + managerDataVersion}
                    identity={identity}
                    onManagerDataRefresh={handleManagerDataRefresh}
                  />
                </TrackedScreen>
              )}
            </Stack.Screen>
            <Stack.Screen name="ManagerManifest" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerManifest">
                  <ManagerManifestScreen
                    {...props}
                    csaWorkspaceVersion={managerWorkspaceVersion + managerDataVersion}
                    identity={identity}
                    onManagerDataRefresh={handleManagerDataRefresh}
                  />
                </TrackedScreen>
              )}
            </Stack.Screen>
            <Stack.Screen name="ManagerDrivers" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerDrivers">
                  <ManagerDriversScreen
                    {...props}
                    csaWorkspaceVersion={managerWorkspaceVersion + managerDataVersion}
                    identity={identity}
                  />
                </TrackedScreen>
              )}
            </Stack.Screen>
            <Stack.Screen name="ManagerAccessCodes" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerAccessCodes">
                  <ManagerAccessCodesScreen
                    {...props}
                    csaWorkspaceVersion={managerWorkspaceVersion + managerDataVersion}
                    identity={identity}
                  />
                </TrackedScreen>
              )}
            </Stack.Screen>
            <Stack.Screen name="ManagerVehicles" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerVehicles">
                  <ManagerVehiclesScreen
                    {...props}
                    csaWorkspaceVersion={managerWorkspaceVersion + managerDataVersion}
                    identity={identity}
                  />
                </TrackedScreen>
              )}
            </Stack.Screen>
            <Stack.Screen name="ManagerNotifications" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerNotifications">
                  <NotificationsScreen {...props} mode="manager" />
                </TrackedScreen>
              )}
            </Stack.Screen>
            <Stack.Screen name="ManagerVedr" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerVedr">
                  <ManagerVedrScreen
                    {...props}
                    csaWorkspaceVersion={managerWorkspaceVersion + managerDataVersion}
                    identity={identity}
                  />
                </TrackedScreen>
              )}
            </Stack.Screen>
            <Stack.Screen name="ManagerMap" options={{ headerShown: false }}>
              {(props) => {
                return (
                  <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerMap">
                    <ManagerMapScreen
                      {...props}
                      csaWorkspaceVersion={managerWorkspaceVersion + managerDataVersion}
                      identity={identity}
                      onLogout={logout}
                    />
                  </TrackedScreen>
                );
              }}
            </Stack.Screen>
            <Stack.Screen name="ManagerSettings" options={{ headerShown: false }}>
              {(props) => (
                <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="ManagerSettings">
                  <ManagerSettingsScreen availableModes={availableModes} identity={identity} />
                </TrackedScreen>
              )}
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
        ) : (
          <>
            <Stack.Screen name="Home" options={{ headerShown: false }}>
              {(props) => {
                return (
                  <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="Home">
                    <DriverHelpScreen {...props} />
                  </TrackedScreen>
                );
              }}
            </Stack.Screen>
            {!DRIVER_HELP_ONLY ? (
              <>
            <Stack.Screen name="RouteTools" options={{ headerShown: false }}>
              {(props) => {
                return (
                  <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="RouteTools">
                    <HomeScreen {...props} onLogout={logout} />
                  </TrackedScreen>
                );
              }}
            </Stack.Screen>
            <Stack.Screen
              name="Notifications"
              options={{
                title: 'Notifications'
              }}
            >
              {(props) => {
                return (
                  <TrackedScreen navigation={props.navigation} onFocus={attachNavigation} screenName="Notifications">
                    <NotificationsScreen {...props} mode="driver" />
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
            ) : null}
          </>
        )}
      </Stack.Navigator>

      {hasAnyAccess && !needsModeSelection ? (
        <>
          {currentRouteName === 'Home' || currentRouteName === 'RouteTools' || currentRouteName == null || String(currentRouteName || '').startsWith('Manager') ? (
            <View pointerEvents="box-none" style={[styles.topLeftControlsWrap, { top: insets.top + 10 }]}>
              <DrawerMenuButton
                label={DRIVER_HELP_ONLY && activeMode === 'driver' ? 'Account' : 'Menu'}
                onPress={openDrawer}
              />
              {activeMode === 'manager' && currentRouteName === 'ManagerMap' ? (
                <BackButton
                  onPress={handleManagerBack}
                  testID="manager-map-back-button"
                />
              ) : null}
            </View>
          ) : null}

          <MobileNavigationDrawer
            activeMode={activeMode}
            currentRouteName={currentRouteName}
            currentManagerCsaId={currentManagerCsaId}
            driverHelpOnly={DRIVER_HELP_ONLY}
            identity={identity}
            hasNotificationAttention={activeMode === 'manager' ? hasManagerNotificationAttention : false}
            isLoadingManagerCsas={isLoadingManagerCsas}
            isOpen={isDrawerOpen}
            isSwitchingManagerCsa={isSwitchingManagerCsa}
            managerCsas={managerCsas}
            onClose={closeDrawer}
            onManagerCsaSelect={handleManagerCsaSelect}
            onManagerWorkspaceSwitch={handleManagerWorkspaceSwitch}
            onLogout={logout}
            onNavigate={handleNavigate}
            onSupportPress={openSupport}
            onSwitchMode={() => handleSelectMode(activeMode === 'manager' ? 'driver' : 'manager')}
            showModeSwitch={!DRIVER_HELP_ONLY && (availableModes.length > 1 || (activeMode === 'manager' && Boolean(sessionTokens?.managerToken)))}
          />
          <SupportRequestModal
            activeMode={activeMode}
            currentRouteName={currentRouteName}
            identity={identity}
            onClose={() => setIsSupportOpen(false)}
            visible={isSupportOpen}
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
    backgroundColor: appTheme.colors.surfaceTint,
    flex: 1,
    justifyContent: 'center'
  },
  topLeftControlsWrap: {
    alignItems: 'center',
    columnGap: 10,
    flexDirection: 'row',
    left: 20,
    position: 'absolute'
  },
  menuButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.buttons.radius,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 64,
    paddingHorizontal: 14,
    ...appTheme.shadows.card
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.buttons.radius,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
    ...appTheme.shadows.card
  },
  backButtonText: {
    color: appTheme.colors.orangeDeep,
    fontSize: 18,
    fontWeight: '800'
  },
  menuButtonPressed: {
    opacity: 0.92
  },
  menuButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800'
  },
});
