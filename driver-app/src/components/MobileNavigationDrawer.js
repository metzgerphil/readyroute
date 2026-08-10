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
  currentManagerCsaId,
  driverHelpOnly = false,
  identity,
  isLoadingManagerCsas,
  isOpen,
  isSwitchingManagerCsa,
  hasNotificationAttention = false,
  managerCsas = [],
  onClose,
  onManagerCsaSelect,
  onLogout,
  onNavigate,
  onSupportPress,
  onSwitchMode,
  showModeSwitch
}) {
  const menuItems = getDrawerMenuItems(activeMode, { driverHelpOnly });
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
              <Text style={styles.modeText}>{activeMode === 'manager' ? 'Manager Mode' : 'Driver Mode'}</Text>
            </View>
            <Pressable accessibilityLabel="Close menu" onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}>
              <Text style={styles.closeButtonText}>X</Text>
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

            {activeMode === 'manager' && managerCsas.length > 1 ? (
              <View style={styles.workspaceSection}>
                <Text style={styles.workspaceSectionLabel}>CSA workspace</Text>
                <View style={styles.workspaceList}>
                  {managerCsas.map((csa) => {
                    const isCurrent = csa.id === currentManagerCsaId || csa.is_current;
                    const isDisabled = isLoadingManagerCsas || isSwitchingManagerCsa;

                    return (
                      <Pressable
                        disabled={isDisabled || isCurrent}
                        key={csa.id}
                        onPress={() => onManagerCsaSelect?.(csa.id)}
                        style={({ pressed }) => [
                          styles.workspaceItem,
                          isCurrent ? styles.workspaceItemCurrent : null,
                          pressed && !isDisabled && !isCurrent ? styles.pressed : null
                        ]}
                      >
                        <Text numberOfLines={1} style={[styles.workspaceName, isCurrent ? styles.workspaceNameCurrent : null]}>
                          {csa.company_name || 'CSA workspace'}
                        </Text>
                        <Text style={[styles.workspaceBadge, isCurrent ? styles.workspaceBadgeCurrent : null]}>
                          {isCurrent ? 'Current' : 'Switch'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.menuSection}>
              {menuItems.map((item) => {
                const isActive = currentRouteName === item.screen;
                const isNotificationItem = item.screen === 'ManagerNotifications' || item.screen === 'Notifications';
                const itemHasAttention = hasNotificationAttention && isNotificationItem;

                return (
                  <Pressable
                    key={item.key}
                    onPress={() => onNavigate(item.screen)}
                    style={({ pressed }) => [
                      styles.menuItem,
                      isActive ? styles.menuItemActive : null,
                      itemHasAttention ? styles.menuItemAttention : null,
                      pressed ? styles.pressed : null
                    ]}
                  >
                    {isActive ? <View style={styles.activeRail} /> : null}
                    <Text style={[
                      styles.menuLabel,
                      isActive ? styles.menuLabelActive : null,
                      itemHasAttention ? styles.menuLabelAttention : null
                    ]}
                    >
                      {item.label}
                    </Text>
                    {itemHasAttention ? <View style={styles.notificationAttentionDot} testID={`${item.key}-attention-dot`} /> : null}
                    {isActive ? (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Open</Text>
                      </View>
                    ) : null}
                    <Text style={[
                      styles.chevron,
                      isActive ? styles.chevronActive : null,
                      itemHasAttention ? styles.chevronAttention : null
                    ]}
                    >
                      &gt;
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable onPress={onSupportPress} style={({ pressed }) => [styles.supportButton, pressed ? styles.pressed : null]}>
              <Text style={styles.supportText}>Support</Text>
            </Pressable>
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
    gap: 10,
    paddingBottom: 14
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#ff7a1a',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46
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
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21
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
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    lineHeight: 16,
    marginTop: 4,
    textTransform: 'uppercase'
  },
  closeButton: {
    alignItems: 'center',
    borderColor: '#d9e2ea',
    borderRadius: 14,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38
  },
  closeButtonText: {
    color: '#142635',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18
  },
  content: {
    paddingBottom: 20,
    paddingTop: 16
  },
  menuScroll: {
    flex: 1
  },
  switchButton: {
    backgroundColor: '#f7f0ff',
    borderColor: '#d8c1ff',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: 14,
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  switchButtonText: {
    color: '#4d148c',
    fontSize: 15,
    fontWeight: '800'
  },
  workspaceSection: {
    borderColor: '#e3ebf2',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12
  },
  workspaceSectionLabel: {
    color: '#657582',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    lineHeight: 14,
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  workspaceList: {
    gap: 6
  },
  workspaceItem: {
    alignItems: 'center',
    borderColor: '#edf1f5',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  workspaceItemCurrent: {
    backgroundColor: '#f0faf4',
    borderColor: '#bfe8cb'
  },
  workspaceName: {
    color: '#142635',
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18
  },
  workspaceNameCurrent: {
    color: '#137333'
  },
  workspaceBadge: {
    color: '#657582',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14
  },
  workspaceBadgeCurrent: {
    color: '#137333'
  },
  menuSection: {
    gap: 4
  },
  menuItem: {
    alignItems: 'center',
    borderColor: '#eef2f5',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 50,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  menuItemActive: {
    backgroundColor: '#fff7f0',
    borderColor: '#ffd5b7'
  },
  menuItemAttention: {
    backgroundColor: '#fff3e8',
    borderColor: '#ff7a1a'
  },
  activeRail: {
    backgroundColor: '#ff7a1a',
    bottom: 8,
    left: 0,
    position: 'absolute',
    top: 8,
    width: 3
  },
  menuLabel: {
    color: '#142635',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  menuLabelActive: {
    color: '#142635',
    fontWeight: '800'
  },
  menuLabelAttention: {
    color: '#f05a00',
    fontWeight: '900'
  },
  notificationAttentionDot: {
    backgroundColor: '#ff7a1a',
    borderRadius: 999,
    height: 8,
    width: 8
  },
  currentBadge: {
    backgroundColor: '#fff0e5',
    borderColor: '#ffcba8',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  currentBadgeText: {
    color: '#f05a00',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14
  },
  chevron: {
    color: '#9aa6af',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20
  },
  chevronActive: {
    color: '#f05a00'
  },
  chevronAttention: {
    color: '#f05a00'
  },
  footer: {
    gap: 8,
    borderTopColor: '#edf1f5',
    borderTopWidth: 1,
    paddingTop: 12
  },
  supportButton: {
    alignItems: 'center',
    backgroundColor: '#f7fbff',
    borderColor: '#cfe0eb',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50
  },
  supportText: {
    color: '#173042',
    fontSize: 15,
    fontWeight: '800'
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#fff5f4',
    borderColor: '#f2bbb5',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50
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
