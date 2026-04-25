import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDrawerMenuItems, getModeSwitchLabel } from '../services/shellNavigation';

export default function MobileNavigationDrawer({
  activeMode,
  currentRouteName,
  identity,
  isOpen,
  onClose,
  onLogout,
  onNavigate,
  onSwitchMode,
  showModeSwitch
}) {
  const menuItems = getDrawerMenuItems(activeMode);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={isOpen}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.drawer}>
            <View style={styles.header}>
              <Text style={styles.name}>{identity?.fullName || 'ReadyRoute User'}</Text>
              <Text style={styles.company}>{identity?.companyName || 'ReadyRoute'}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
              {showModeSwitch ? (
                <Pressable onPress={onSwitchMode} style={({ pressed }) => [styles.switchButton, pressed ? styles.pressed : null]}>
                  <Text style={styles.switchButtonText}>{getModeSwitchLabel(activeMode)}</Text>
                </Pressable>
              ) : null}

              <View style={styles.menuSection}>
                {menuItems.map((item) => {
                  const isActive = currentRouteName === item.screen;

                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => onNavigate(item.screen)}
                      style={({ pressed }) => [
                        styles.menuItem,
                        isActive ? styles.menuItemActive : null,
                        pressed ? styles.pressed : null
                      ]}
                    >
                      <Text style={[styles.menuLabel, isActive ? styles.menuLabelActive : null]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Pressable onPress={onLogout} style={({ pressed }) => [styles.logoutButton, pressed ? styles.pressed : null]}>
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </View>
        </SafeAreaView>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.backdrop} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(23, 48, 66, 0.12)',
    flex: 1,
    flexDirection: 'row'
  },
  backdrop: {
    flex: 1
  },
  safeArea: {
    alignSelf: 'stretch',
    width: 320
  },
  drawer: {
    backgroundColor: 'rgba(255, 250, 245, 0.84)',
    borderRightColor: 'rgba(255, 173, 102, 0.34)',
    borderRightWidth: 1,
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  header: {
    backgroundColor: '#ff7a1a',
    borderRadius: 24,
    marginBottom: 18,
    paddingHorizontal: 18,
    paddingVertical: 18
  },
  name: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 6
  },
  company: {
    color: '#fff4eb',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22
  },
  content: {
    paddingBottom: 18
  },
  switchButton: {
    backgroundColor: '#f5edff',
    borderColor: '#c6a4ff',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 18,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  switchButtonText: {
    color: '#4d148c',
    fontSize: 15,
    fontWeight: '800'
  },
  menuSection: {
    gap: 8
  },
  menuItem: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  menuItemActive: {
    backgroundColor: '#f0e4d8'
  },
  menuLabel: {
    color: '#2d3841',
    fontSize: 16,
    fontWeight: '700'
  },
  menuLabelActive: {
    color: '#173042'
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 250, 245, 0.72)',
    borderColor: '#ead9c9',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 'auto'
  },
  logoutText: {
    color: '#173042',
    fontSize: 15,
    fontWeight: '800'
  },
  pressed: {
    opacity: 0.9
  }
});
