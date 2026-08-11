import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../services/api';
import appTheme from '../theme/appTheme';

function percent(value) {
  return value == null ? 'No ratings yet' : `${Math.round(Number(value) * 100)}%`;
}

function Metric({ label, value }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export default function ManagerHelpDashboardScreen({ csaWorkspaceVersion = 0, identity, navigation }) {
  const [payload, setPayload] = useState(null);
  const [driverCount, setDriverCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [activityResponse, driversResponse] = await Promise.all([
        api.get('/manager/driver-help/overview', { authMode: 'manager', params: { limit: 100 } }),
        api.get('/manager/drivers', { authMode: 'manager' })
      ]);
      setPayload(activityResponse.data || {});
      setDriverCount((driversResponse.data?.drivers || []).filter((driver) => driver.is_active !== false).length);
      setError('');
    } catch (_requestError) {
      setError('Company activity could not be loaded right now.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [csaWorkspaceVersion]);

  if (loading) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.center}><ActivityIndicator color={appTheme.colors.orange} size="large" /></View></SafeAreaView>;
  }

  const metrics = payload?.metrics || {};
  const unanswered = payload?.unanswered_questions || [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.brand}><Text style={styles.brandReady}>ready</Text>Route</Text>
        <Text style={styles.company}>{identity?.companyName || 'Company overview'}</Text>
        <Text style={styles.title}>Driver help activity</Text>
        <Text style={styles.subtitle}>See how drivers are using Ready Route and where they still need help.</Text>

        {error ? (
          <View style={styles.notice}><Text style={styles.noticeText}>{error}</Text><Pressable onPress={load}><Text style={styles.retry}>Try again</Text></Pressable></View>
        ) : (
          <>
            <View style={styles.metricGrid}>
              <Metric label="Questions asked" value={metrics.total_questions || 0} />
              <Metric label="Verified answers" value={metrics.approved_answers || 0} />
              <Metric label="Helpful ratings" value={metrics.helpful_feedback || 0} />
              <Metric label="Helpful among rated" value={percent(metrics.helpful_rate)} />
            </View>

            <View style={styles.valueCard}>
              <Text style={styles.cardEyebrow}>MANAGER TIME</Text>
              <Text style={styles.valueNumber}>{metrics.approved_answers || 0}</Text>
              <Text style={styles.valueTitle}>potential routine interruptions handled</Text>
              <Text style={styles.valueNote}>This is a usage count—not yet a time-saved claim. Monthly reports will show the calculation and its assumption clearly.</Text>
            </View>

            <View style={styles.actionCard}>
              <View style={styles.actionCopy}>
                <Text style={styles.actionTitle}>Drivers and invitations</Text>
                <Text style={styles.actionText}>{driverCount} active driver{driverCount === 1 ? '' : 's'}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => navigation?.navigate('ManagerDrivers')} style={styles.actionButton}>
                <Text style={styles.actionButtonText}>Manage</Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Needs attention</Text>
              <Text style={styles.sectionMeta}>{metrics.escalations || 0} questions had no verified answer</Text>
              {unanswered.slice(0, 3).map((item) => (
                <View key={item.id} style={styles.questionRow}>
                  <Text style={styles.questionText}>{item.question}</Text>
                  <Text style={styles.questionDate}>{item.status || 'open'}</Text>
                </View>
              ))}
              {!unanswered.length ? <Text style={styles.empty}>No unresolved questions in this activity window.</Text> : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f7f5f1', flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', maxWidth: 720, paddingBottom: 48, paddingHorizontal: 20, paddingTop: 54, width: '100%' },
  brand: { color: '#ff6200', fontSize: 30, fontWeight: '500', letterSpacing: -1 },
  brandReady: { color: '#173042', fontWeight: '900' },
  company: { color: '#657582', fontSize: 14, fontWeight: '700', marginTop: 4 },
  title: { color: '#173042', fontSize: 30, fontWeight: '900', lineHeight: 36, marginTop: 28 },
  subtitle: { color: '#657582', fontSize: 16, lineHeight: 23, marginTop: 8 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 22 },
  metricCard: { backgroundColor: '#fff', borderColor: '#dde5eb', borderRadius: 18, borderWidth: 1, minHeight: 116, padding: 16, width: '48%' },
  metricValue: { color: '#173042', fontSize: 27, fontWeight: '900' },
  metricLabel: { color: '#657582', fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 8 },
  valueCard: { backgroundColor: '#173042', borderRadius: 20, marginTop: 16, padding: 20 },
  cardEyebrow: { color: '#ffb080', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  valueNumber: { color: '#fff', fontSize: 42, fontWeight: '900', marginTop: 8 },
  valueTitle: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 24 },
  valueNote: { color: '#c9d5dd', fontSize: 13, lineHeight: 19, marginTop: 10 },
  actionCard: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#dde5eb', borderRadius: 18, borderWidth: 1, flexDirection: 'row', marginTop: 16, padding: 18 },
  actionCopy: { flex: 1 },
  actionTitle: { color: '#173042', fontSize: 17, fontWeight: '900' },
  actionText: { color: '#657582', fontSize: 14, marginTop: 5 },
  actionButton: { backgroundColor: '#ff6200', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  actionButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  section: { backgroundColor: '#fff', borderColor: '#dde5eb', borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 18 },
  sectionTitle: { color: '#173042', fontSize: 19, fontWeight: '900' },
  sectionMeta: { color: '#657582', fontSize: 14, marginTop: 5 },
  questionRow: { borderTopColor: '#edf1f4', borderTopWidth: 1, marginTop: 14, paddingTop: 14 },
  questionText: { color: '#173042', fontSize: 15, fontWeight: '700', lineHeight: 21 },
  questionDate: { color: '#a34c00', fontSize: 12, fontWeight: '800', marginTop: 5, textTransform: 'uppercase' },
  empty: { color: '#657582', fontSize: 14, marginTop: 16 },
  notice: { backgroundColor: '#fff3e8', borderRadius: 16, marginTop: 24, padding: 18 },
  noticeText: { color: '#7b3d00', fontSize: 15, fontWeight: '700' },
  retry: { color: '#d65300', fontSize: 15, fontWeight: '900', marginTop: 12 }
});
