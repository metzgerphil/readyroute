import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDrawerMenuItems } from '../services/shellNavigation';
import BottomSheetContainer from './ui/BottomSheetContainer';
import AppButton from './ui/AppButton';
import RouteMetricIcon from './RouteMetricIcon';
import api from '../services/api';
import appTheme from '../theme/appTheme';

function getMenuItemTone(item) {
  if (item.key === 'manager-csa') {
    return 'csa';
  }

  return 'default';
}

function getComingSoonCopy(item) {
  switch (item?.key) {
    case 'manager-manifest':
      return {
        title: 'Manifest upload',
        body: 'Manual XLS and GPX upload will open here when the mobile upload flow is ready.'
      };
    case 'manager-drivers':
      return {
        title: 'Driver management',
        body: 'Mobile driver management will open here when the manager tools are ready.'
      };
    case 'manager-vehicles':
      return {
        title: 'Vehicle management',
        body: 'Mobile vehicle management will open here when the fleet tools are ready.'
      };
    case 'manager-help':
      return {
        title: 'Help',
        body: 'Mobile help resources will open here when support content is ready.'
      };
    default:
      return {
        title: item?.label || 'Coming soon',
        body: 'This manager section is coming soon.'
      };
  }
}

function getCsaName(csa) {
  return csa?.company_name || csa?.name || 'CSA workspace';
}

function getCsaManagerLine(csa) {
  return csa?.manager_email || csa?.email || csa?.status || csa?.connection_status || 'Workspace access available';
}

function normalizeLinkCode(value) {
  return String(value || '').trim().toUpperCase();
}

export default function MobileNavigationDrawer({
  activeMode,
  currentRouteName,
  identity,
  isOpen,
  onClose,
  onLogout,
  onManagerWorkspaceSwitch,
  onNavigate,
  onSwitchMode,
  showModeSwitch
}) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [comingSoonItem, setComingSoonItem] = useState(null);
  const [activePanel, setActivePanel] = useState('menu');
  const [csaPayload, setCsaPayload] = useState(null);
  const [isLoadingCsas, setIsLoadingCsas] = useState(false);
  const [csaErrorMessage, setCsaErrorMessage] = useState('');
  const [switchingCsaId, setSwitchingCsaId] = useState(null);
  const [unlinkingCsaId, setUnlinkingCsaId] = useState(null);
  const [isGeneratingLinkCode, setIsGeneratingLinkCode] = useState(false);
  const [generatedLinkCode, setGeneratedLinkCode] = useState(null);
  const [linkCodeInput, setLinkCodeInput] = useState('');
  const [isLinkingCsa, setIsLinkingCsa] = useState(false);
  const [linkFlowMessage, setLinkFlowMessage] = useState('');
  const [linkFlowError, setLinkFlowError] = useState('');
  const menuItems = getDrawerMenuItems(activeMode);
  const fullName = identity?.fullName || 'ReadyRoute User';
  const topControlClearance = 58;
  const horizontalInset = width >= 768 ? 32 : 0;
  const sheetHeight = Math.max(320, height - insets.top - insets.bottom - topControlClearance);
  const sheetWidth = width >= 768 ? Math.min(560, width - horizontalInset * 2) : width;
  const comingSoonCopy = getComingSoonCopy(comingSoonItem);
  const csas = csaPayload?.csas || [];
  const currentCsa = csaPayload?.current_csa || csas.find((csa) => csa.is_current) || null;
  const companyName = currentCsa ? getCsaName(currentCsa) : identity?.companyName || 'Current CSA';
  const hasLinkCodeInput = normalizeLinkCode(linkCodeInput).length > 0;

  async function loadCsaWorkspaces() {
    setIsLoadingCsas(true);
    setCsaErrorMessage('');

    try {
      const response = await api.get('/manager/csas', {
        authMode: 'manager'
      });
      setCsaPayload(response.data || { current_csa: null, csas: [] });
    } catch (_error) {
      setCsaErrorMessage('CSA workspaces could not be loaded right now.');
    } finally {
      setIsLoadingCsas(false);
    }
  }

  function openCsaPanel() {
    setActivePanel('csa');
    setComingSoonItem(null);
    setLinkFlowError('');
    setLinkFlowMessage('');
    loadCsaWorkspaces();
  }

  function openLinkPanel() {
    setActivePanel('link-csa');
    setGeneratedLinkCode(null);
    setLinkCodeInput('');
    setLinkFlowError('');
    setLinkFlowMessage('');
  }

  function returnToCsaPanel() {
    setActivePanel('csa');
    setLinkFlowError('');
    setLinkFlowMessage('');
  }

  function handleMenuItemPress(item) {
    if (item.key === 'manager-csa') {
      openCsaPanel();
      return;
    }

    if (!item.screen) {
      setComingSoonItem(item);
      return;
    }

    onNavigate(item.screen);
  }

  async function handleSwitchCsa(csa) {
    if (!csa?.id || csa.is_current || switchingCsaId) {
      return;
    }

    setSwitchingCsaId(csa.id);
    setCsaErrorMessage('');

    try {
      const response = await api.post('/manager/csas/switch', {
        account_id: csa.id
      }, {
        authMode: 'manager'
      });
      const nextManagerToken = response.data?.token || '';

      if (!nextManagerToken) {
        setCsaErrorMessage('CSA switched, but the mobile session could not refresh.');
        return;
      }

      await onManagerWorkspaceSwitch?.(nextManagerToken);
    } catch (_error) {
      setCsaErrorMessage('CSA switch could not be completed right now.');
    } finally {
      setSwitchingCsaId(null);
    }
  }

  async function unlinkCsa(csa) {
    if (!csa?.id || csa.is_current || unlinkingCsaId) {
      return;
    }

    setUnlinkingCsaId(csa.id);
    setCsaErrorMessage('');

    try {
      const response = await api.delete(`/manager/csas/${csa.id}/access`, {
        authMode: 'manager'
      });
      setCsaPayload((current) => ({
        ...(current || {}),
        csas: response.data?.csas || (current?.csas || []).filter((item) => item.id !== csa.id)
      }));
    } catch (_error) {
      setCsaErrorMessage('CSA could not be unlinked right now.');
    } finally {
      setUnlinkingCsaId(null);
    }
  }

  function handleUnlinkCsa(csa) {
    if (!csa?.id || csa.is_current || unlinkingCsaId) {
      return;
    }

    Alert.alert(
      'Unlink CSA',
      `Unlink ${getCsaName(csa)} from your manager login? This will not delete the CSA or its routes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: () => unlinkCsa(csa)
        }
      ]
    );
  }

  async function handleGenerateLinkCode() {
    setIsGeneratingLinkCode(true);
    setGeneratedLinkCode(null);
    setLinkFlowError('');
    setLinkFlowMessage('');

    try {
      const response = await api.post('/manager/csas/link-code', {}, {
        authMode: 'manager'
      });
      setGeneratedLinkCode(response.data?.link_code || null);
      setLinkFlowMessage('Share this one time code securely with the other CSA workspace.');
    } catch (_error) {
      setLinkFlowError('A link code could not be generated right now.');
    } finally {
      setIsGeneratingLinkCode(false);
    }
  }

  async function handleCopyLinkCode() {
    if (!generatedLinkCode) {
      return;
    }

    try {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(generatedLinkCode);
        setLinkFlowMessage('Code copied.');
        return;
      }
    } catch (_error) {
      // Some native runtimes do not expose a clipboard API to JavaScript.
    }

    setLinkFlowMessage('Code ready. Select the code to copy if your device does not copy it automatically.');
  }

  async function handleLinkCsa() {
    const code = normalizeLinkCode(linkCodeInput);

    if (!code || isLinkingCsa) {
      return;
    }

    setIsLinkingCsa(true);
    setLinkFlowError('');
    setLinkFlowMessage('');

    try {
      await api.post('/manager/csas/link-existing', {
        code
      }, {
        authMode: 'manager'
      });
      setLinkCodeInput('');
      setLinkFlowMessage('CSA workspace linked.');
      await loadCsaWorkspaces();
      setActivePanel('csa');
    } catch (_error) {
      setLinkFlowError('That CSA link code could not be used. Check the code and try again.');
    } finally {
      setIsLinkingCsa(false);
    }
  }

  function renderModeSwitch() {
    const modeOptions = [
      {
        icon: 'route',
        key: 'driver',
        label: 'Driver'
      },
      {
        icon: 'building',
        key: 'manager',
        label: 'Manager'
      }
    ];

    return (
      <View style={styles.modeSegmentShell}>
        {modeOptions.map((option) => {
          const isSelected = activeMode === option.key;
          const isDisabled = isSelected || !showModeSwitch;

          return (
            <Pressable
              accessibilityRole="button"
              disabled={isDisabled}
              key={option.key}
              onPress={onSwitchMode}
              style={({ pressed }) => [
                styles.modeSegment,
                isSelected ? styles.modeSegmentActive : null,
                !showModeSwitch && !isSelected ? styles.modeSegmentDisabled : null,
                pressed ? styles.pressed : null
              ]}
            >
              <RouteMetricIcon
                color={isSelected ? appTheme.colors.orangeDeep : appTheme.colors.textSecondary}
                name={option.icon}
                size={appTheme.icons.sm}
              />
              <Text style={[styles.modeSegmentText, isSelected ? styles.modeSegmentTextActive : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderMenuPanel() {
    const unavailableModeLabel = activeMode === 'manager'
      ? 'Driver mode unavailable for this login'
      : 'Manager mode unavailable for this login';

    return (
      <>
        <View style={styles.headerRow}>
          <View style={styles.identityRow}>
            <View style={styles.identityCopy}>
              <Text numberOfLines={2} style={styles.company}>{companyName}</Text>
              <Text numberOfLines={1} style={styles.name}>{fullName}</Text>
            </View>
          </View>

          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}>
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
        </View>

        {showModeSwitch ? (
          renderModeSwitch()
        ) : (
          <>
            {renderModeSwitch()}
            <View style={styles.modeUnavailablePanel}>
              <Text style={styles.modeUnavailableLabel}>{unavailableModeLabel}</Text>
            </View>
          </>
        )}

        <ScrollView
          contentContainerStyle={styles.menuContent}
          showsVerticalScrollIndicator={false}
          style={styles.menuScroll}
        >
          {menuItems.map((item) => {
            const isActive = Boolean(item.screen && currentRouteName === item.screen);
            const iconColor = isActive
              ? appTheme.colors.orangeDeep
              : appTheme.colors.charcoalSoft;

            return (
              <Pressable
                key={item.key}
                onPress={() => handleMenuItemPress(item)}
                style={({ pressed }) => [
                  styles.menuItem,
                  isActive ? styles.menuItemActive : null,
                  pressed ? styles.pressed : null
                ]}
              >
                {isActive ? <View style={styles.activeAccent} /> : null}
                <View style={[
                  styles.menuIcon,
                  isActive ? styles.menuIconActive : null,
                  getMenuItemTone(item) === 'csa' ? styles.menuIconCsa : null
                ]}>
                  <RouteMetricIcon color={iconColor} name={item.icon || 'route'} size={appTheme.icons.md} />
                </View>
                <View style={styles.menuItemCopy}>
                  <Text
                    style={[
                      styles.menuLabel,
                      isActive ? styles.menuLabelActive : null
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.subtitle ? (
                    <Text numberOfLines={1} style={styles.menuSupportingText}>{item.subtitle}</Text>
                  ) : null}
                </View>
                <Text style={[styles.chevron, isActive ? styles.chevronActive : null]}>›</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={onLogout}
          style={({ pressed }) => [styles.menuItem, styles.logoutMenuItem, pressed ? styles.pressed : null]}
        >
          <View style={styles.logoutIcon}>
            <RouteMetricIcon color={appTheme.colors.dangerText} name="warning" size={appTheme.icons.md} />
          </View>
          <View style={styles.menuItemCopy}>
            <Text style={styles.logoutMenuLabel}>Logout</Text>
            <Text numberOfLines={1} style={styles.menuSupportingText}>Sign out of ReadyRoute</Text>
          </View>
          <Text style={styles.logoutChevron}>›</Text>
        </Pressable>
      </>
    );
  }

  function renderCsaPanel() {
    return (
      <>
        <View style={styles.nestedHeaderRow}>
          <Pressable onPress={() => setActivePanel('menu')} style={({ pressed }) => [styles.backPill, pressed ? styles.pressed : null]}>
            <Text style={styles.backPillText}>‹</Text>
          </Pressable>
          <View style={styles.nestedHeaderCopy}>
            <Text style={styles.nestedTitle}>CSA Workspaces</Text>
            <Text numberOfLines={1} style={styles.nestedSubtitle}>
              {currentCsa ? getCsaName(currentCsa) : 'Current CSA unavailable'}
            </Text>
          </View>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}>
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
        </View>

        {csaErrorMessage ? <Text style={styles.cleanError}>{csaErrorMessage}</Text> : null}

        {isLoadingCsas ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color={appTheme.colors.orange} />
            <Text style={styles.loadingText}>Loading CSA workspaces...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.workspaceList} showsVerticalScrollIndicator={false} style={styles.menuScroll}>
            {currentCsa ? (
              <View style={styles.currentWorkspaceCard}>
                <Text style={styles.currentWorkspaceLabel}>Current CSA</Text>
                <Text numberOfLines={2} style={styles.currentWorkspaceName}>{getCsaName(currentCsa)}</Text>
                <Text numberOfLines={1} style={styles.workspaceMeta}>{getCsaManagerLine(currentCsa)}</Text>
              </View>
            ) : null}

            {(csas.length ? csas : currentCsa ? [currentCsa] : []).map((csa) => {
              const isCurrent = Boolean(csa.is_current || csa.id === currentCsa?.id);
              const isSwitching = switchingCsaId === csa.id;
              const isUnlinking = unlinkingCsaId === csa.id;

              return (
                <View key={csa.id || getCsaName(csa)} style={[styles.workspaceRow, isCurrent ? styles.workspaceRowActive : null]}>
	                  <View style={styles.workspaceIcon}>
	                    <RouteMetricIcon
	                      color={isCurrent ? appTheme.colors.orangeDeep : appTheme.colors.charcoalSoft}
	                      name="building"
	                      size={appTheme.icons.md}
	                    />
	                  </View>
                  <View style={styles.workspaceCopy}>
                    <View style={styles.workspaceTitleRow}>
                      <Text numberOfLines={1} style={styles.workspaceName}>{getCsaName(csa)}</Text>
                      {isCurrent ? <Text style={styles.currentBadge}>Current</Text> : null}
                    </View>
                    <Text numberOfLines={1} style={styles.workspaceMeta}>{getCsaManagerLine(csa)}</Text>
                  </View>
                  {!isCurrent ? (
                    <View style={styles.workspaceActions}>
                      <Pressable
                        disabled={Boolean(switchingCsaId || unlinkingCsaId)}
                        onPress={() => handleSwitchCsa(csa)}
                        style={({ pressed }) => [
                          styles.switchCsaButton,
                          switchingCsaId || unlinkingCsaId ? styles.disabledAction : null,
                          pressed ? styles.pressed : null
                        ]}
                      >
                        <Text style={styles.switchCsaButtonText}>{isSwitching ? 'Switching...' : 'Switch'}</Text>
                      </Pressable>
                      <Pressable
                        disabled={Boolean(switchingCsaId || unlinkingCsaId)}
                        onPress={() => handleUnlinkCsa(csa)}
                        style={({ pressed }) => [
                          styles.unlinkCsaButton,
                          switchingCsaId || unlinkingCsaId ? styles.disabledAction : null,
                          pressed ? styles.pressed : null
                        ]}
                      >
                        <Text style={styles.unlinkCsaButtonText}>{isUnlinking ? '...' : 'Unlink'}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}

        <AppButton
          label="Link another CSA"
          onPress={openLinkPanel}
          style={styles.linkCsaButton}
          textStyle={styles.linkCsaButtonText}
          variant="outline"
        />
      </>
    );
  }

  function renderLinkCsaPanel() {
    return (
      <>
        <View style={styles.nestedHeaderRow}>
          <Pressable onPress={returnToCsaPanel} style={({ pressed }) => [styles.backPill, pressed ? styles.pressed : null]}>
            <Text style={styles.backPillText}>‹</Text>
          </Pressable>
          <View style={styles.nestedHeaderCopy}>
            <Text style={styles.nestedTitle}>Link another CSA</Text>
            <Text style={styles.nestedSubtitle}>Use a one time link code to connect another CSA workspace to this manager login.</Text>
          </View>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}>
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.linkPanelContent} showsVerticalScrollIndicator={false} style={styles.menuScroll}>
          <View style={styles.linkSection}>
            <Text style={styles.linkSectionTitle}>Generate link code</Text>
            <Text style={styles.linkSectionBody}>Create a one time code to share securely with the manager of another CSA workspace.</Text>
            <AppButton
              label={isGeneratingLinkCode ? 'Generating...' : 'Generate link code'}
              onPress={handleGenerateLinkCode}
              style={styles.generateCodeButton}
            />
            {generatedLinkCode ? (
              <View style={styles.generatedCodeCard}>
                <Text selectable style={styles.generatedCode}>{generatedLinkCode}</Text>
                <Pressable onPress={handleCopyLinkCode} style={({ pressed }) => [styles.copyButton, pressed ? styles.pressed : null]}>
                  <Text style={styles.copyButtonText}>Copy</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.linkSection}>
            <Text style={styles.linkSectionTitle}>Link code from another CSA</Text>
            <TextInput
              autoCapitalize="characters"
              onChangeText={(value) => setLinkCodeInput(normalizeLinkCode(value))}
              placeholder="CSA-XXXXXXX"
              placeholderTextColor={appTheme.colors.textTertiary}
              style={styles.linkCodeInput}
              value={linkCodeInput}
            />
            <Pressable
              disabled={!hasLinkCodeInput || isLinkingCsa}
              onPress={handleLinkCsa}
              style={({ pressed }) => [
                styles.linkWorkspaceButton,
                !hasLinkCodeInput || isLinkingCsa ? styles.disabledAction : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.linkWorkspaceButtonText}>{isLinkingCsa ? 'Linking...' : 'Link workspace'}</Text>
            </Pressable>
          </View>

          {linkFlowError ? <Text style={styles.cleanError}>{linkFlowError}</Text> : null}
          {linkFlowMessage ? <Text style={styles.cleanSuccess}>{linkFlowMessage}</Text> : null}
        </ScrollView>
      </>
    );
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={isOpen}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.backdrop} />

        <View
          pointerEvents="box-none"
          style={[
            styles.sheetFrame,
            {
              paddingBottom: insets.bottom,
              paddingHorizontal: horizontalInset,
              paddingTop: insets.top + topControlClearance
            }
          ]}
        >
          <BottomSheetContainer style={[styles.sheet, { height: sheetHeight, width: sheetWidth }]}>
            {activePanel === 'csa' ? renderCsaPanel() : activePanel === 'link-csa' ? renderLinkCsaPanel() : renderMenuPanel()}
          </BottomSheetContainer>
        </View>

        {comingSoonItem ? (
          <View style={styles.comingSoonOverlay}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setComingSoonItem(null)}
              style={styles.comingSoonBackdrop}
            />
            <View style={styles.comingSoonCard}>
              <Text style={styles.comingSoonTitle}>{comingSoonCopy.title}</Text>
              <Text style={styles.comingSoonBody}>{comingSoonCopy.body}</Text>
              <AppButton
                label="Got it"
                onPress={() => setComingSoonItem(null)}
                style={styles.comingSoonButton}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: appTheme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end'
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject
  },
  sheetFrame: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    width: '100%'
  },
  sheet: {
    backgroundColor: appTheme.colors.surface,
    maxWidth: '100%'
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: appTheme.spacing.md
  },
  identityRow: {
    flex: 1,
    paddingRight: appTheme.spacing.md
  },
  identityCopy: {
    flex: 1,
    gap: appTheme.spacing.xxs,
    minWidth: 0
  },
  name: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  company: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.titleMedium
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  closeButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: 24,
    fontWeight: appTheme.typography.weights.medium,
    lineHeight: 24,
    marginTop: -2
  },
  nestedHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.lg
  },
  backPill: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  backPillText: {
    color: appTheme.colors.textPrimary,
    fontSize: 26,
    fontWeight: appTheme.typography.weights.medium,
    lineHeight: 28,
    marginTop: -2
  },
  nestedHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  nestedTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.titleMedium
  },
  nestedSubtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginTop: appTheme.spacing.xxs
  },
  modeSegmentShell: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.lg,
    padding: appTheme.spacing.xs
  },
  modeSegment: {
    alignItems: 'center',
    borderRadius: appTheme.radius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: appTheme.spacing.md
  },
  modeSegmentActive: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderWidth: 1
  },
  modeSegmentDisabled: {
    opacity: 0.48
  },
  modeSegmentText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  modeSegmentTextActive: {
    color: appTheme.colors.orangeDeep
  },
  modeUnavailablePanel: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.buttons.radius,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: appTheme.spacing.lg,
    marginTop: -appTheme.spacing.sm,
    minHeight: appTheme.buttons.height,
    paddingHorizontal: appTheme.buttons.horizontalPadding
  },
  modeUnavailableLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  menuContent: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.lg
  },
  menuScroll: {
    flex: 1
  },
  loadingPanel: {
    alignItems: 'center',
    flex: 1,
    gap: appTheme.spacing.sm,
    justifyContent: 'center',
    minHeight: 220
  },
  loadingText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  menuItem: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
    overflow: 'hidden',
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  menuItemActive: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.orangeBorder
  },
  activeAccent: {
    backgroundColor: appTheme.colors.orange,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 4
  },
  menuIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    marginRight: appTheme.spacing.md,
    width: 38
  },
  menuIconActive: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder
  },
  menuIconCsa: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border
  },
  menuItemCopy: {
    flex: 1,
    paddingRight: appTheme.spacing.md
  },
  menuLabel: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.semibold
  },
  menuLabelActive: {
    color: appTheme.colors.orangeDeep
  },
  menuSupportingText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginTop: appTheme.spacing.xxs
  },
  chevron: {
    color: appTheme.colors.textTertiary,
    fontSize: 24,
    fontWeight: appTheme.typography.weights.regular
  },
  chevronActive: {
    color: appTheme.colors.orangeDeep
  },
  logoutMenuItem: {
    borderColor: appTheme.colors.dangerSoft,
    marginTop: appTheme.spacing.md
  },
  logoutIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: appTheme.colors.dangerSoft,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    marginRight: appTheme.spacing.md,
    width: 38
  },
  logoutMenuLabel: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.heavy
  },
  logoutChevron: {
    color: appTheme.colors.dangerText,
    fontSize: 24,
    fontWeight: appTheme.typography.weights.regular
  },
  workspaceList: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.lg
  },
  currentWorkspaceCard: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    padding: appTheme.spacing.md
  },
  currentWorkspaceLabel: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xxs,
    textTransform: 'uppercase'
  },
  currentWorkspaceName: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.titleSmall
  },
  workspaceRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 72,
    padding: appTheme.spacing.md
  },
  workspaceRowActive: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.orangeBorder
  },
  workspaceIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderWidth: 1,
    borderRadius: appTheme.radius.md,
    height: 38,
    justifyContent: 'center',
    marginRight: appTheme.spacing.md,
    width: 38
  },
  workspaceCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: appTheme.spacing.sm
  },
  workspaceTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  workspaceName: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  workspaceMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginTop: appTheme.spacing.xxs
  },
  currentBadge: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderRadius: appTheme.radius.pill,
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    overflow: 'hidden',
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: 3
  },
  workspaceActions: {
    alignItems: 'stretch',
    gap: appTheme.spacing.xs
  },
  switchCsaButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.charcoal,
    borderRadius: appTheme.buttons.radius,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 74,
    paddingHorizontal: appTheme.spacing.md
  },
  switchCsaButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  unlinkCsaButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.dangerBorder || '#fecaca',
    borderRadius: appTheme.buttons.radius,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 74,
    paddingHorizontal: appTheme.spacing.sm
  },
  unlinkCsaButtonText: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  linkCsaButton: {
    alignSelf: 'stretch',
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder,
    marginTop: appTheme.spacing.md
  },
  linkCsaButtonText: {
    color: appTheme.colors.orangeDeep
  },
  linkPanelContent: {
    gap: appTheme.spacing.md,
    paddingBottom: appTheme.spacing.lg
  },
  linkSection: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    padding: appTheme.spacing.md
  },
  linkSectionTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xs
  },
  linkSectionBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginBottom: appTheme.spacing.md
  },
  generateCodeButton: {
    alignSelf: 'stretch'
  },
  generatedCodeCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.md,
    padding: appTheme.spacing.sm
  },
  generatedCode: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 1
  },
  copyButton: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.buttons.radius,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: appTheme.spacing.md,
    justifyContent: 'center'
  },
  copyButtonText: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  linkCodeInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    minHeight: 46,
    paddingHorizontal: appTheme.spacing.md
  },
  linkWorkspaceButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.buttons.radius,
    justifyContent: 'center',
    marginTop: appTheme.spacing.md,
    minHeight: appTheme.buttons.height,
    paddingHorizontal: appTheme.spacing.md
  },
  linkWorkspaceButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  disabledAction: {
    opacity: 0.48
  },
  cleanError: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderRadius: appTheme.radius.md,
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginBottom: appTheme.spacing.md,
    padding: appTheme.spacing.md
  },
  cleanSuccess: {
    backgroundColor: appTheme.colors.greenSoft,
    borderRadius: appTheme.radius.md,
    color: appTheme.colors.greenText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    padding: appTheme.spacing.md
  },
  pressed: {
    opacity: 0.92
  },
  comingSoonOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: appTheme.spacing.lg
  },
  comingSoonBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 23, 32, 0.18)'
  },
  comingSoonCard: {
    ...appTheme.shadows.lifted,
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    maxWidth: 420,
    padding: appTheme.spacing.lg,
    width: '100%'
  },
  comingSoonTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.titleSmall,
    marginBottom: appTheme.spacing.xs
  },
  comingSoonBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body,
    marginBottom: appTheme.spacing.lg
  },
  comingSoonButton: {
    alignSelf: 'stretch'
  }
});
