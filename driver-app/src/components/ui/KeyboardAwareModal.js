import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View
} from 'react-native';

import appTheme from '../../theme/appTheme';

export default function KeyboardAwareModal({
  animationType = 'fade',
  cardStyle,
  children,
  onClose,
  visible
}) {
  return (
    <Modal animationType={animationType} onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={styles.keyboardRoot}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityLabel="Close modal"
            accessibilityRole="button"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.modalCard, cardStyle]}>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 23, 31, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: appTheme.spacing.lg
  },
  modalCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.lg,
    flexShrink: 1,
    maxHeight: '88%',
    maxWidth: 560,
    padding: appTheme.spacing.lg,
    width: '100%'
  }
});
