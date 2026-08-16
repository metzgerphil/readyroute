import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const POLICY_VERSION = '2026-08-16';

export default function RraPrivacyModal({ onChoose, onClose, required = false, visible }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={required ? undefined : onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={styles.title}>Privacy and AI processing</Text>
            <Text style={styles.body}>
              Ready Route Answers checks approved ReadyRoute procedures. When needed to understand how you phrased a question, ReadyRoute may send the question and recent conversation context to OpenAI for language processing.
            </Text>
            <Text style={styles.body}>
              OpenAI does not decide the procedure and does not receive your password. ReadyRoute removes common contact, address, link, and package identifiers before AI processing. Please do not enter names, phone numbers, addresses, tracking numbers, or other personal information.
            </Text>
            <Text style={styles.body}>
              If you decline, ReadyRoute will not send your questions to OpenAI. You can still use answers that ReadyRoute can match without new AI processing, and you can change this choice later.
            </Text>
            <View style={styles.links}>
              <Pressable onPress={() => Linking.openURL('https://readyroute.org/privacy.html')}>
                <Text style={styles.link}>Privacy Policy</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL('https://readyroute.org/terms.html')}>
                <Text style={styles.link}>Terms</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => onChoose(true, POLICY_VERSION)} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Allow AI processing</Text>
            </Pressable>
            <Pressable onPress={() => onChoose(false, POLICY_VERSION)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Continue without AI processing</Text>
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
