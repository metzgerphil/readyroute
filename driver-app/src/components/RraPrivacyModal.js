import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const POLICY_VERSION = '2026-08-20';

export default function RraPrivacyModal({
  companyAuthorized = false,
  isSaving = false,
  onAcknowledge,
  onClose,
  required = false,
  visible
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={required ? undefined : onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.handle} />
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scrollArea}
          >
            <Text style={styles.eyebrow}>COMPANY AUTHORIZATION</Text>
            <Text accessibilityRole="header" style={styles.title}>AI language interpretation</Text>
            {companyAuthorized ? (
              <>
                <Text style={styles.body}>
                  Your company owner has authorized Ready Route Answers to use OpenAI when needed to understand how a driver phrased a question. This company approval applies to every authorized RRA driver.
                </Text>
                <Text style={styles.body}>
                  OpenAI may interpret the wording, but it cannot create or change the approved operational answer. ReadyRoute removes common contact, address, link, and package identifiers before AI processing.
                </Text>
                <Text style={styles.body}>
                  By continuing, you acknowledge your company’s authorization and this notice. You are not being asked to make a separate individual authorization choice.
                </Text>
              </>
            ) : (
              <View style={styles.statusCard}>
                <Text style={styles.statusText}>AI language interpretation is currently off for this company. Your company owner controls this setting.</Text>
              </View>
            )}
            <View style={styles.links}>
              <Pressable onPress={() => Linking.openURL('https://readyroute.org/privacy.html')}>
                <Text style={styles.link}>Privacy Policy</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL('https://readyroute.org/terms.html')}>
                <Text style={styles.link}>Terms</Text>
              </Pressable>
            </View>
          </ScrollView>
          <View style={styles.actions}>
            {companyAuthorized ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: isSaving, disabled: isSaving }}
                disabled={isSaving}
                onPress={() => onAcknowledge(POLICY_VERSION)}
                style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null, isSaving ? styles.buttonDisabled : null]}
                testID="acknowledge-company-ai-button"
              >
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>I understand</Text>}
              </Pressable>
            ) : null}
            {!required || !companyAuthorized ? (
              <Pressable disabled={isSaving} onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(7, 29, 43, 0.52)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', paddingHorizontal: 24, paddingTop: 12 },
  handle: { alignSelf: 'center', backgroundColor: '#d7e0e8', borderRadius: 3, height: 5, marginBottom: 20, width: 46 },
  scrollArea: { flexShrink: 1 },
  content: { paddingBottom: 4 },
  eyebrow: { color: '#c84c00', fontSize: 13, fontWeight: '900', letterSpacing: 2.2, marginBottom: 8 },
  title: { color: '#173042', fontSize: 27, fontWeight: '900', marginBottom: 12 },
  body: { color: '#425563', fontSize: 16, lineHeight: 24, marginBottom: 12 },
  links: { flexDirection: 'row', gap: 24, marginBottom: 12, marginTop: 2 },
  link: { color: '#e85a00', fontSize: 15, fontWeight: '800' },
  actions: { backgroundColor: '#fff', borderTopColor: '#edf1f4', borderTopWidth: 1, paddingTop: 12 },
  primaryButton: { alignItems: 'center', backgroundColor: '#ff6200', borderRadius: 14, minHeight: 50, justifyContent: 'center', marginBottom: 10, padding: 12 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  statusCard: { backgroundColor: '#eaf0f4', borderRadius: 14, marginBottom: 12, padding: 16 },
  statusText: { color: '#173042', fontSize: 16, fontWeight: '800', lineHeight: 22 },
  buttonPressed: { opacity: 0.78 },
  buttonDisabled: { opacity: 0.65 },
  closeButton: { alignItems: 'center', padding: 12 },
  closeButtonText: { color: '#5f6b76', fontWeight: '800' }
});
