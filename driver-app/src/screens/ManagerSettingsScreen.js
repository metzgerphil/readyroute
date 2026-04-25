import { StyleSheet, Text, View } from 'react-native';

import ManagerSectionLayout from '../components/ManagerSectionLayout';

export default function ManagerSettingsScreen({ availableModes = [], identity }) {
  return (
    <ManagerSectionLayout
      eyebrow="Manager Settings"
      subtitle="Workspace access and mobile shell details"
      title="Settings"
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current workspace</Text>
        <Text style={styles.primaryValue}>{identity?.companyName || 'ReadyRoute'}</Text>
        <Text style={styles.secondaryValue}>{identity?.fullName || 'ReadyRoute User'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Active mobile roles</Text>
        <Text style={styles.secondaryValue}>
          {availableModes.includes('manager') ? 'Manager enabled' : 'Manager unavailable'}
        </Text>
        <Text style={styles.secondaryValue}>
          {availableModes.includes('driver') ? 'Driver mode available from this session' : 'Driver mode unavailable'}
        </Text>
      </View>
    </ManagerSectionLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 26,
    borderWidth: 1,
    padding: 20
  },
  cardTitle: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12
  },
  primaryValue: {
    color: '#173042',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
    marginBottom: 8
  },
  secondaryValue: {
    color: '#667784',
    fontSize: 15,
    lineHeight: 22
  }
});
