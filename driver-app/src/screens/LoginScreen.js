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

import { getApiErrorMessage } from '../utils/apiError';
import api from '../services/api';
import { saveSessionTokens } from '../services/auth';
import { getOrCreateDeviceIdentity } from '../services/deviceIdentity';

export default function LoginScreen({ onAuthenticated }) {
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetErrorMessage, setResetErrorMessage] = useState('');

  const formWidth = Math.min(width - 32, 460);

  async function handleLogin() {
    if (!email.trim() || !secret.trim()) {
      setErrorMessage('Incorrect email or password. Try again.');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    setErrorMessage('');

    try {
      const deviceIdentity = await getOrCreateDeviceIdentity();
      const mobileResponse = await api.post('/auth/mobile/login', {
        email: email.trim(),
        secret: secret.trim(),
        ...deviceIdentity
      }, {
        skipAuth: true
      });

      const driverToken = mobileResponse.data?.driver_token || null;
      const managerToken = mobileResponse.data?.manager_token || null;

      if (!driverToken && !managerToken) {
        throw new Error('Missing mobile session tokens');
      }

      await saveSessionTokens({ driverToken, managerToken });
      onAuthenticated({ driverToken, managerToken });
    } catch (_mobileError) {
      try {
        const response = await api.post('/auth/driver/login', {
          email: email.trim(),
          pin: secret.trim(),
          ...deviceIdentity
        }, {
          skipAuth: true
        });
        const legacyDriverToken = response.data?.token;

        if (!legacyDriverToken) {
          throw new Error('Missing driver token');
        }

        await saveSessionTokens({ driverToken: legacyDriverToken });
        onAuthenticated({ driverToken: legacyDriverToken, managerToken: null });
      } catch (legacyError) {
        const networkUnavailable = !(_mobileError?.response || legacyError?.response);
        setErrorMessage(networkUnavailable
          ? 'Could not reach ReadyRoute. Check your connection and try again.'
          : 'Incorrect email or password. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  function openPasswordReset() {
    setShowPasswordReset(true);
    setResetEmail((current) => current || email.trim());
    setResetMessage('');
    setResetErrorMessage('');
  }

  async function handlePasswordReset() {
    const requestedEmail = resetEmail.trim() || email.trim();

    if (!requestedEmail) {
      setResetErrorMessage('Enter your manager email first.');
      return;
    }

    Keyboard.dismiss();
    setResetLoading(true);
    setResetMessage('');
    setResetErrorMessage('');

    try {
      const response = await api.post('/auth/manager/request-password-reset', {
        email: requestedEmail
      }, {
        skipAuth: true
      });
      setResetEmail(requestedEmail);
      setResetMessage(response.data?.message || 'Check your email for reset instructions.');
    } catch (error) {
      setResetErrorMessage(getApiErrorMessage(error, 'Could not send reset instructions.'));
    } finally {
      setResetLoading(false);
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
                <Text style={styles.helperText}>
                  Sign in with your ReadyRoute email and password.
                </Text>
                <Text style={styles.helperText}>
                  First time here? Use the secure link in your driver invitation email to create your password first.
                </Text>
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
                  onChangeText={(value) => {
                    setSecret(value);
                    if (errorMessage) {
                      setErrorMessage('');
                    }
                  }}
                  placeholder="Password"
                  placeholderTextColor="#8b8b8b"
                  secureTextEntry
                  style={styles.input}
                  value={secret}
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
                    <Text style={styles.buttonText}>Sign In</Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={resetLoading}
                  onPress={openPasswordReset}
                  style={({ pressed }) => [
                    styles.forgotPasswordLink,
                    pressed && !resetLoading ? styles.forgotPasswordLinkPressed : null
                  ]}
                >
                  <Text style={styles.forgotPasswordText}>Forgot manager password?</Text>
                </Pressable>
                {showPasswordReset ? (
                  <View style={styles.resetPanel}>
                    <Text style={styles.resetHelperText}>
                      Enter your manager email and we&apos;ll send reset instructions.
                    </Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      onChangeText={(value) => {
                        setResetEmail(value);
                        if (resetErrorMessage) {
                          setResetErrorMessage('');
                        }
                      }}
                      placeholder="Manager email"
                      placeholderTextColor="#8b8b8b"
                      returnKeyType="send"
                      onSubmitEditing={handlePasswordReset}
                      style={styles.resetInput}
                      value={resetEmail}
                    />
                    <Pressable
                      disabled={resetLoading}
                      onPress={handlePasswordReset}
                      style={({ pressed }) => [
                        styles.resetButton,
                        resetLoading && styles.buttonDisabled,
                        pressed && !resetLoading ? styles.buttonPressed : null
                      ]}
                    >
                      {resetLoading ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.resetButtonText}>Send reset link</Text>
                      )}
                    </Pressable>
                    {resetMessage ? <Text style={styles.resetSuccessText}>{resetMessage}</Text> : null}
                    {resetErrorMessage ? <Text style={styles.resetErrorText}>{resetErrorMessage}</Text> : null}
                  </View>
                ) : null}
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
  helperText: {
    color: '#5f6f7c',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 2
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
  forgotPasswordLink: {
    alignSelf: 'center',
    marginTop: -2,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  forgotPasswordLinkPressed: {
    opacity: 0.7
  },
  forgotPasswordText: {
    color: '#5f6f7c',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center'
  },
  resetPanel: {
    gap: 10,
    marginTop: 2
  },
  resetHelperText: {
    color: '#5f6f7c',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  resetInput: {
    backgroundColor: '#ffffff',
    borderColor: '#d2d2d2',
    borderRadius: 12,
    borderWidth: 1,
    color: '#222222',
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  resetButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FF6200',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 170,
    paddingHorizontal: 16
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  resetSuccessText: {
    color: '#166534',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  resetErrorText: {
    color: '#d92d20',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  errorText: {
    color: '#d92d20',
    fontSize: 18,
    lineHeight: 24,
    marginTop: 4
  }
});
