import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../services/api';
import { saveToken } from '../services/auth';

export default function LoginScreen({ onAuthenticated }) {
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const formWidth = Math.min(width - 32, 460);

  async function handleLogin() {
    if (!email.trim() || !pin.trim()) {
      setErrorMessage('Incorrect email or PIN. Try again.');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    setErrorMessage('');

    try {
      const response = await api.post('/auth/driver/login', {
        email: email.trim(),
        pin: pin.trim()
      });

      const token = response.data?.token;

      if (!token) {
        throw new Error('Missing token in login response');
      }

      await saveToken(token);
      onAuthenticated(token);
    } catch (_error) {
      setErrorMessage('Incorrect email or PIN. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Pressable onPress={Keyboard.dismiss} style={styles.flex} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.container, { width: formWidth }]}>
              <View style={styles.logoRow}>
                <Text style={styles.logoReady}>ready</Text>
                <Text style={styles.logoRoute}>Route</Text>
              </View>
              <Text style={styles.subtitle}>Last-mile routing</Text>

              <View style={styles.form}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={(value) => {
                    setEmail(value);
                    if (errorMessage) {
                      setErrorMessage('');
                    }
                  }}
                  placeholder="Email"
                  placeholderTextColor="#8b8b8b"
                  returnKeyType="next"
                  style={styles.input}
                  value={email}
                />
                <TextInput
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={(value) => {
                    setPin(value.replace(/[^\d]/g, ''));
                    if (errorMessage) {
                      setErrorMessage('');
                    }
                  }}
                  placeholder="4-digit PIN"
                  placeholderTextColor="#8b8b8b"
                  secureTextEntry
                  style={styles.input}
                  value={pin}
                />
                <Pressable
                  disabled={loading}
                  onPress={handleLogin}
                  style={({ pressed }) => [
                    styles.button,
                    loading && styles.buttonDisabled,
                    pressed && !loading ? styles.buttonPressed : null
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.buttonText}>Start My Day</Text>
                  )}
                </Pressable>
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  flex: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24
  },
  container: {
    alignSelf: 'center'
  },
  logoRow: {
    flexDirection: 'row',
    marginBottom: 10
  },
  logoReady: {
    color: '#2f2f2f',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38
  },
  logoRoute: {
    color: '#FF6200',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38
  },
  subtitle: {
    color: '#7a7a7a',
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 32
  },
  form: {
    gap: 14
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d2d2d2',
    borderRadius: 14,
    borderWidth: 1,
    color: '#222222',
    fontSize: 18,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#FF6200',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 56,
    paddingHorizontal: 16
  },
  buttonDisabled: {
    opacity: 0.8
  },
  buttonPressed: {
    opacity: 0.92
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700'
  },
  errorText: {
    color: '#d92d20',
    fontSize: 18,
    lineHeight: 24,
    marginTop: 4
  }
});
