import { StyleSheet, Text, View } from 'react-native';

import ManagerSectionLayout from '../components/ManagerSectionLayout';

export default function ManagerNotificationsScreen() {
  return (
    <ManagerSectionLayout
      eyebrow="Manager Notifications"
      subtitle="Push alerts, route exceptions, and driver watch items will land here."
      title="Notification center"
    >
      <View style={styles.placeholderCard}>
        <Text style={styles.placeholderTitle}>Notifications are getting their own mobile pass.</Text>
        <Text style={styles.placeholderBody}>
          This section is reserved for route exceptions, sync issues, and dispatch follow-ups once the mobile alert stream is ready.
        </Text>
      </View>
    </ManagerSectionLayout>
  );
}

const styles = StyleSheet.create({
  placeholderCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 26,
    borderWidth: 1,
    padding: 20
  },
  placeholderTitle: {
    color: '#173042',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 10
  },
  placeholderBody: {
    color: '#667784',
    fontSize: 15,
    lineHeight: 23
  }
});
