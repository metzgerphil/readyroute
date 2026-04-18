import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../services/api';

export function getStatusConfig(status) {
  switch (status) {
    case 'delivered':
      return { label: 'Delivered', dot: styles.statusDelivered };
    case 'attempted':
      return { label: 'Attempted', dot: styles.statusAttempted };
    case 'incomplete':
      return { label: 'Incomplete', dot: styles.statusIncomplete };
    default:
      return { label: 'Pending', dot: styles.statusPending };
  }
}

export function isPriorityStop(stop) {
  return Boolean(stop.priority || stop.is_priority || String(stop.notes || '').toLowerCase().includes('priority'));
}

export function isPickupStop(stop) {
  return stop.stop_type === 'pickup' || stop.is_pickup === true;
}

export function isHazmatStop(stop) {
  return (stop.packages || []).some((pkg) => pkg.hazmat);
}

export default function ManifestScreen({ navigation, route }) {
  const [routeData, setRouteData] = useState(null);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const selectedStopId = route?.params?.selectedStopId;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Today's Route"
    });
  }, [navigation]);

  useEffect(() => {
    let isMounted = true;

    async function loadRoute() {
      try {
        const response = await api.get('/routes/today');

        if (isMounted) {
          setRouteData(response.data?.route || null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadRoute();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredStops = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const stops = routeData?.stops || [];

    if (!normalizedSearch) {
      return stops;
    }

    return stops.filter((stop) =>
      `${stop.address} ${stop.sequence_order} ${stop.address_line2 || ''}`.toLowerCase().includes(normalizedSearch)
    );
  }, [routeData?.stops, search]);

  const deliveryStops = filteredStops.filter((stop) => !isPickupStop(stop));
  const pickupStops = filteredStops.filter((stop) => isPickupStop(stop));

  function renderStopRow({ item }) {
    const statusConfig = getStatusConfig(item.status);

    return (
      <Pressable
        onPress={() => navigation.navigate('MyDrive', { selectedStopId: item.id })}
        style={[styles.row, isPriorityStop(item) ? styles.priorityRow : null, selectedStopId === item.id ? styles.selectedRow : null]}
      >
        <View style={styles.rowTop}>
          <Text style={styles.stopNumber}>ST#{item.sequence_order}</Text>
          <View style={styles.statusWrap}>
            {isHazmatStop(item) ? (
              <View style={styles.hazmatBadge}>
                <Text style={styles.hazmatText}>HZ</Text>
              </View>
            ) : null}
            <View style={[styles.statusDot, statusConfig.dot]} />
            <Text style={styles.statusLabel}>{statusConfig.label}</Text>
          </View>
        </View>
        <Text style={styles.address}>{item.address}</Text>
        <View style={styles.metaRow}>
          {item.is_apartment_unit ? (
            <View style={[styles.metaBadge, styles.metaBadgeApartment]}>
              <Text style={[styles.metaBadgeText, styles.metaBadgeTextApartment]}>Apartment</Text>
            </View>
          ) : null}
          {item.is_business ? (
            <View style={[styles.metaBadge, styles.metaBadgeBusiness]}>
              <Text style={[styles.metaBadgeText, styles.metaBadgeTextBusiness]}>Business</Text>
            </View>
          ) : null}
          {item.has_note ? (
            <View style={[styles.metaBadge, styles.metaBadgeNote]}>
              <Text style={[styles.metaBadgeText, styles.metaBadgeTextNote]}>Has note</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.packageCount}>
          {(item.packages || []).length} {(item.packages || []).length === 1 ? 'package' : 'packages'}
        </Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Today&apos;s Route</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearch}
          placeholder="Search by ST# or address"
          placeholderTextColor="#8b8b8b"
          style={styles.searchInput}
          value={search}
        />

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#FF6200" size="large" />
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={deliveryStops}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.emptyText}>No stops match that search.</Text>}
            ListFooterComponent={
              pickupStops.length ? (
                <View style={styles.pickupsSection}>
                  <Text style={styles.pickupsTitle}>Pickups</Text>
                  {pickupStops.map((stop) => (
                    <View key={stop.id}>{renderStopRow({ item: stop })}</View>
                  ))}
                </View>
              ) : null
            }
            renderItem={renderStopRow}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  container: {
    flex: 1,
    backgroundColor: '#fff9f4',
    paddingHorizontal: 16,
    paddingTop: 16
  },
  title: {
    color: '#173042',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 14
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderColor: '#dfdfdf',
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 18,
    marginBottom: 16,
    minHeight: 56,
    paddingHorizontal: 16
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  listContent: {
    paddingBottom: 32
  },
  row: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16
  },
  selectedRow: {
    borderColor: '#173042',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3
  },
  priorityRow: {
    borderLeftColor: '#FF6200',
    borderLeftWidth: 5
  },
  rowTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  stopNumber: {
    color: '#6f7d87',
    fontSize: 16,
    fontWeight: '700'
  },
  statusWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  statusDot: {
    borderRadius: 6,
    height: 12,
    width: 12
  },
  statusDelivered: {
    backgroundColor: '#2db55d'
  },
  statusAttempted: {
    backgroundColor: '#f3a534'
  },
  statusIncomplete: {
    backgroundColor: '#CC0000'
  },
  statusPending: {
    backgroundColor: '#ffffff',
    borderColor: '#cfd4d8',
    borderWidth: 1
  },
  statusLabel: {
    color: '#56656f',
    fontSize: 14,
    fontWeight: '700'
  },
  address: {
    color: '#173042',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    marginBottom: 6
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6
  },
  metaBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  metaBadgeApartment: {
    backgroundColor: '#f5f3ff'
  },
  metaBadgeBusiness: {
    backgroundColor: '#111111'
  },
  metaBadgeNote: {
    backgroundColor: '#fff1e7'
  },
  metaBadgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  metaBadgeTextApartment: {
    color: '#6d28d9'
  },
  metaBadgeTextBusiness: {
    color: '#ffffff'
  },
  metaBadgeTextNote: {
    color: '#FF6200'
  },
  packageCount: {
    color: '#6f7d87',
    fontSize: 16
  },
  hazmatBadge: {
    backgroundColor: '#c92a2a',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  hazmatText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  pickupsSection: {
    marginTop: 10
  },
  pickupsTitle: {
    color: '#173042',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12
  },
  emptyText: {
    color: '#6f7d87',
    fontSize: 18,
    paddingVertical: 24,
    textAlign: 'center'
  }
});
