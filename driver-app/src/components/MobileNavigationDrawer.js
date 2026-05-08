import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDrawerMenuItems, getModeSwitchLabel } from '../services/shellNavigation';

const TOP_CONTROL_ROW_TOP = 58;
const TOP_CONTROL_ROW_HEIGHT = 42;
const TOP_CONTROL_ROW_GAP = 8;
const SAFE_AREA_TOP_GAP = 8;
const TABLET_PANEL_MAX_WIDTH = 520;
const TABLET_PANEL_MIN_SIDE_GUTTER = 24;
const TABLET_PANEL_BOTTOM_GAP = 24;

function getInitial(name) {
  const trimmedName = String(name || '').trim();
  return trimmedName ? trimmedName.charAt(0).toUpperCase() : 'R';
}

export function getMobileMenuLayout({ height, insets, width }) {
  const isTabletLayout = Math.min(height, width) >= 768;
  const topControlBottom = TOP_CONTROL_ROW_TOP + TOP_CONTROL_ROW_HEIGHT + TOP_CONTROL_ROW_GAP;
  const sheetTop = Math.max(insets.top + SAFE_AREA_TOP_GAP, topControlBottom);
  const panelWidth = Math.min(width - TABLET_PANEL_MIN_SIDE_GUTTER * 2, TABLET_PANEL_MAX_WIDTH);
  const tabletBottom = Math.max(insets.bottom + TABLET_PANEL_BOTTOM_GAP, TABLET_PANEL_BOTTOM_GAP);
  const sheetHeight = Math.max(0, height - sheetTop - (isTabletLayout ? tabletBottom : 0));
  const sheetFrameStyle = isTabletLayout
    ? {
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        height: sheetHeight,
        left: (width - panelWidth) / 2,
        top: sheetTop,
        width: panelWidth
      }
    : {
        height: sheetHeight,
        left: 0,
        right: 0,
        top: sheetTop
      };

  return {
    isTabletLayout,
    sheetFrameStyle,
    sheetHeight,
    sheetTop
  };
}

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
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { sheetFrameStyle } = getMobileMenuLayout({ height, insets, width });

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={isOpen}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close menu" accessibilityRole="button" onPress={onClose} style={styles.backdrop} />

        <View style={[styles.sheet, sheetFrameStyle]} testID="mobile-navigation-sheet">
          <View style={styles.sheetHandle} />

          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitial(identity?.fullName)}</Text>
            </View>
            <View style={styles.identityText}>
              <Text numberOfLines={1} style={styles.name}>
                {identity?.fullName || 'ReadyRoute User'}
              </Text>
              <Text numberOfLines={1} style={styles.company}>
                {identity?.companyName || 'ReadyRoute'}
              </Text>
              <Text style={styles.modeText}>{activeMode === 'manager' ? 'Manager mode' : 'Driver mode'}</Text>
            </View>
            <Pressable accessibilityLabel="Close menu" onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            bounces={false}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            style={styles.menuScroll}
          >
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

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable onPress={onLogout} style={({ pressed }) => [styles.logoutButton, pressed ? styles.pressed : null]}>
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(10, 22, 32, 0.38)',
    flex: 1
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    elevation: 18,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 10,
    position: 'absolute',
    shadowColor: '#0b1620',
    shadowOffset: { height: -8, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 22
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#d7e0e8',
    borderRadius: 999,
    height: 4,
    marginBottom: 12,
    width: 42
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#edf1f5',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 16
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#ff7a1a',
    borderRadius: 18,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900'
  },
  identityText: {
    flex: 1,
    minWidth: 0
  },
  name: {
    color: '#142635',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22
  },
  company: {
    color: '#657582',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2
  },
  modeText: {
    color: '#4d148c',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 4,
    textTransform: 'uppercase'
  },
  closeButton: {
    alignItems: 'center',
    borderColor: '#d9e2ea',
    borderRadius: 16,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  closeButtonText: {
    color: '#142635',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28
  },
  content: {
    paddingBottom: 20,
    paddingTop: 18
  },
  menuScroll: {
    flex: 1
  },
  switchButton: {
    backgroundColor: '#f7f0ff',
    borderColor: '#d8c1ff',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: 16,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  switchButtonText: {
    color: '#4d148c',
    fontSize: 15,
    fontWeight: '800'
  },
  menuSection: {
    gap: 6
  },
  menuItem: {
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  menuItemActive: {
    backgroundColor: '#fff1e7',
    borderColor: '#ff7a1a',
    borderWidth: 1
  },
  menuLabel: {
    color: '#142635',
    fontSize: 16,
    fontWeight: '700'
  },
  menuLabelActive: {
    color: '#f05a00',
    fontWeight: '900'
  },
  footer: {
    borderTopColor: '#edf1f5',
    borderTopWidth: 1,
    paddingTop: 12
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#fff7f7',
    borderColor: '#f3c5c1',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52
  },
  logoutText: {
    color: '#c0352b',
    fontSize: 15,
    fontWeight: '800'
  },
  pressed: {
    opacity: 0.9
  }
});
