import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const POLICY_VERSION = '2026-08-20';

export default function RraPrivacyModal({ onAcknowledge, onClose, required = false, visible }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={required ? undefined : onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={styles.title}>How RRA uses AI</Text>
            <Text style={styles.body}>
              Your company has authorized Ready Route Answers to use OpenAI when needed to understand how a driver phrased a question.
            </Text>
            <Text style={styles.body}>
              OpenAI does not decide the procedure or create the operational answer, and it does not receive your password. RRA answers only from ReadyRoute-approved information. ReadyRoute removes common contact, address, link, and package identifiers before AI processing.
            </Text>
            <Text style={styles.body}>
              Please do not enter names, phone numbers, addresses, tracking numbers, or other personal information. You can read the full policy or contact ReadyRoute if you have a privacy question.
            </Text>
            <View style={styles.links}>
              <Pressable onPress={() => Linking.openURL('https://readyroute.org/privacy.html')}>
                <Text style={styles.link}>Privacy Policy</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL('https://readyroute.org/terms.html')}>
                <Text style={styles.link}>Terms</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => onAcknowledge(POLICY_VERSION)} style={styles.primaryButton} testID="acknowledge-ai-notice-button">
              <Text style={styles.primaryButtonText}>Continue to RRA</Text>
            </Pressable>
            {!required ? (
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(7, 29, 43, 0.52)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', paddingHorizontal: 24, paddingTop: 12 },
  handle: { alignSelf: 'center', backgroundColor: '#d7e0e8', borderRadius: 3, height: 5, marginBottom: 20, width: 46 },
  title: { color: '#173042', fontSize: 27, fontWeight: '900', marginBottom: 12 },
  body: { color: '#425563', fontSize: 16, lineHeight: 24, marginBottom: 12 },
  links: { flexDirection: 'row', gap: 24, marginBottom: 20, marginTop: 2 },
  link: { color: '#e85a00', fontSize: 15, fontWeight: '800' },
  primaryButton: { alignItems: 'center', backgroundColor: '#ff6200', borderRadius: 14, minHeight: 50, justifyContent: 'center', marginBottom: 10, padding: 12 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderColor: '#cbd6de', borderRadius: 14, borderWidth: 1, minHeight: 50, justifyContent: 'center', marginBottom: 8, padding: 12 },
  secondaryButtonText: { color: '#173042', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  closeButton: { alignItems: 'center', padding: 12 },
  closeButtonText: { color: '#5f6b76', fontWeight: '800' }
});
