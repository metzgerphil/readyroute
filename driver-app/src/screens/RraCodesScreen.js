import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRraReferenceCodes } from '../services/rraQuickActions';
import appTheme from '../theme/appTheme';

export default function RraCodesScreen() {
  const [type, setType] = useState('delivery');
  const [codes, setCodes] = useState({ delivery: [], pickup: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getRraReferenceCodes()
      .then((result) => setCodes(result || { delivery: [], pickup: [] }))
      .catch(() => setError('Ready Route codes could not be loaded right now.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>List of Codes</Text>
        <View style={styles.tabs}>
          {['delivery', 'pickup'].map((item) => (
            <Pressable key={item} onPress={() => setType(item)} style={[styles.tab, type === item ? styles.tabSelected : null]}>
              <Text style={[styles.tabText, type === item ? styles.tabTextSelected : null]}>{item === 'delivery' ? 'Delivery' : 'Pickup'}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={appTheme.colors.orange} style={styles.loader} /> : null}
        {!loading && !error ? (
          <FlatList
            data={codes[type] || []}
            keyExtractor={(item) => `${type}-${item.code}`}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.code}>{item.code}</Text>
                <Text style={styles.label}>{item.label}</Text>
              </View>
            )}
            showsVerticalScrollIndicator={false}
            style={styles.list}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f7f5f1', flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 18 },
  title: { color: '#173042', fontSize: 30, fontWeight: '900', textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 12, marginBottom: 14, marginTop: 20 },
  tab: { alignItems: 'center', borderColor: '#173042', borderRadius: 24, borderWidth: 1.5, flex: 1, minHeight: 48, justifyContent: 'center' },
  tabSelected: { backgroundColor: '#ff6200', borderColor: '#ff6200' },
  tabText: { color: '#173042', fontSize: 17, fontWeight: '800' },
  tabTextSelected: { color: '#ffffff' },
  list: { backgroundColor: '#ffffff', borderColor: '#dde5eb', borderRadius: 18, borderWidth: 1 },
  row: { alignItems: 'center', borderBottomColor: '#e7ecef', borderBottomWidth: 1, flexDirection: 'row', minHeight: 58, paddingHorizontal: 16 },
  code: { color: '#ff6200', fontSize: 21, fontWeight: '900', width: 72 },
  label: { color: '#173042', flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 19 },
  loader: { marginTop: 40 },
  error: { color: appTheme.colors.dangerText, fontSize: 15, marginTop: 28, textAlign: 'center' }
});
