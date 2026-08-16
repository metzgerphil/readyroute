import 'react-native-gesture-handler';

import { Component } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PortalSessionProvider } from './src/context/PortalSessionContext';
import AppNavigator from './src/navigation/AppNavigator';

class AppRecoveryBoundary extends Component {
  state = { failed: false, resetKey: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Ready Route screen failed:', error);
  }

  retry = () => {
    this.setState((current) => ({ failed: false, resetKey: current.resetKey + 1 }));
  };

  render() {
    if (this.state.failed) {
      return (
        <View style={styles.recoveryScreen}>
          <Text style={styles.recoveryTitle}>Ready Route needs to reload this screen.</Text>
          <Text style={styles.recoveryText}>Your app can recover without being closed.</Text>
          <Pressable accessibilityRole="button" onPress={this.retry} style={styles.recoveryButton}>
            <Text style={styles.recoveryButtonText}>Reload Ready Route</Text>
          </Pressable>
        </View>
      );
    }

    return <View key={this.state.resetKey} style={styles.app}>{this.props.children}</View>;
  }
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppRecoveryBoundary>
        <SafeAreaProvider>
          <PortalSessionProvider>
            <NavigationContainer>
              <StatusBar style="dark" />
              <AppNavigator />
            </NavigationContainer>
          </PortalSessionProvider>
        </SafeAreaProvider>
      </AppRecoveryBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  recoveryScreen: {
    alignItems: 'center',
    backgroundColor: '#f7f5f1',
    flex: 1,
    justifyContent: 'center',
    padding: 28
  },
  recoveryTitle: {
    color: '#173042',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center'
  },
  recoveryText: {
    color: '#4b5d69',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center'
  },
  recoveryButton: {
    backgroundColor: '#ff6200',
    borderRadius: 16,
    marginTop: 24,
    paddingHorizontal: 22,
    paddingVertical: 14
  },
  recoveryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '900' }
});
