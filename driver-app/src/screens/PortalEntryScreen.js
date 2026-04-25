import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PortalEntryScreen({ onSelectPortal }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.logoRow}>
          <Text style={styles.logoReady}>ready</Text>
          <Text style={styles.logoRoute}>Route</Text>
        </View>
        <Text style={styles.eyebrow}>Choose your workspace</Text>
        <Text style={styles.title}>Pick the portal you want to open right now.</Text>
        <Text style={styles.subtitle}>
          You can switch later without signing out, and ReadyRoute will remember your usual choice on this device.
        </Text>

        <View style={styles.cardStack}>
          <Pressable
            onPress={() => onSelectPortal('manager')}
            style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
          >
            <Text style={styles.cardTitle}>Manager Portal</Text>
            <Text style={styles.cardBody}>Dispatch, route planning, staffing, and live operational visibility.</Text>
          </Pressable>

          <Pressable
            onPress={() => onSelectPortal('driver')}
            style={({ pressed }) => [styles.card, styles.cardDriver, pressed ? styles.cardPressed : null]}
          >
            <Text style={styles.cardTitle}>Driver Portal</Text>
            <Text style={styles.cardBody}>Start the route, manage stops, clock in, and stay moving in the field.</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff8f2'
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32
  },
  logoRow: {
    flexDirection: 'row',
    marginBottom: 18
  },
  logoReady: {
    color: '#2f2f2f',
    fontSize: 34,
    fontWeight: '800'
  },
  logoRoute: {
    color: '#FF6200',
    fontSize: 34,
    fontWeight: '800'
  },
  eyebrow: {
    color: '#1b6b73',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: 'uppercase'
  },
  title: {
    color: '#173042',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 12
  },
  subtitle: {
    color: '#59656f',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 28
  },
  cardStack: {
    gap: 14
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#efe2d1',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: '#c46d34',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18
  },
  cardDriver: {
    borderColor: '#ffd1b0'
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }]
  },
  cardTitle: {
    color: '#173042',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8
  },
  cardBody: {
    color: '#59656f',
    fontSize: 16,
    lineHeight: 23
  }
});
