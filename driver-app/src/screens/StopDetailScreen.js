import { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../services/api';

const FLAG_OPTIONS = ['Impassable', 'Seasonal', 'Low clearance', 'Private/no access'];

export function getStatusConfig(status) {
  switch (status) {
    case 'delivered':
      return { label: 'Delivered', style: styles.statusDelivered };
    case 'attempted':
      return { label: 'Attempted', style: styles.statusAttempted };
    case 'incomplete':
      return { label: 'Incomplete', style: styles.statusIncomplete };
    case 'complete':
      return { label: 'Complete', style: styles.statusDelivered };
    default:
      return { label: 'Pending', style: styles.statusPending };
  }
}

export function getStopTypeMeta(stopType) {
  switch (stopType) {
    case 'pickup':
      return { label: 'Pickup', style: styles.stopTypePickupBadge };
    case 'combined':
      return { label: 'Delivery + Pickup', style: styles.stopTypeCombinedBadge };
    default:
      return { label: 'Delivery', style: styles.stopTypeDeliveryBadge };
  }
}

export function getTypeBadges(stop) {
  const badges = [];
  const stopType = stop?.stop_type;

  if (stop?.is_business) {
    badges.push({ key: 'business', label: 'BUSINESS', style: styles.stopTypeBusinessBadge, textStyle: styles.stopTypeBusinessBadgeText });
  }

  if (stopType === 'pickup' || stopType === 'combined') {
    badges.push({ key: 'pickup', label: 'PICKUP', style: styles.stopTypePickupBadge, textStyle: styles.stopTypePickupBadgeText });
  }

  if (stopType === 'delivery' || stopType === 'combined' || !stopType) {
    badges.push({ key: 'delivery', label: 'DELIVERY', style: styles.stopTypeDeliveryBadge, textStyle: styles.stopTypeDeliveryBadgeText });
  }

  return badges;
}

export function getPrimaryAddressLine(stop) {
  const fullAddress = String(stop?.address || '').trim();
  const addressLine2 = String(stop?.address_line2 || '').trim();

  if (!fullAddress) {
    return '';
  }

  const parts = fullAddress.split(',').map((part) => part.trim()).filter(Boolean);

  if (addressLine2 && parts.length > 1 && parts[1] === addressLine2) {
    return parts[0];
  }

  return parts[0] || fullAddress;
}

export function formatWarningFlag(flag) {
  switch (flag) {
    case 'dog':
      return 'Dog alert';
    case 'gate':
      return 'Gate / callbox';
    case 'stairs':
      return 'Stairs';
    case 'lobby':
      return 'Locked lobby';
    case 'reception':
      return 'Reception desk';
    case 'loading_dock':
      return 'Loading dock';
    case 'parking':
      return 'Parking note';
    case 'elevator':
      return 'Elevator';
    default:
      return String(flag || '')
        .replace(/_/g, ' ')
        .replace(/\b([a-z])/g, (_match, letter) => letter.toUpperCase());
  }
}

export function formatSecondaryAddressDetails(stop) {
  const parts = [];

  if (stop?.secondary_address_type) {
    parts.push(`Type ${String(stop.secondary_address_type).toUpperCase()}`);
  }

  if (stop?.unit_label) {
    parts.push(`Unit ${stop.unit_label}`);
  }

  if (stop?.suite_label) {
    parts.push(`Suite ${stop.suite_label}`);
  }

  if (stop?.building_label) {
    parts.push(stop.building_label);
  }

  if (stop?.floor_label) {
    parts.push(stop.floor_label);
  }

  return parts.join(' · ');
}

export function buildGoogleNavigationUrls(address) {
  const destination = encodeURIComponent(address || '');

  return {
    nativeGoogleMapsUrl: `comgooglemaps://?daddr=${destination}&directionsmode=driving`,
    webGoogleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`
  };
}

export default function StopDetailScreen({ navigation, route }) {
  const stopId = route.params?.stopId;
  const [stop, setStop] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [floorDraft, setFloorDraft] = useState('');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingFloor, setIsSavingFloor] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isFlagModalVisible, setIsFlagModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadStop() {
      try {
        const response = await api.get(`/routes/stops/${stopId}`);

        if (isMounted) {
          setStop(response.data?.stop || null);
          setNoteDraft(response.data?.stop?.note_text || '');
          setFloorDraft(
            response.data?.stop?.apartment_intelligence?.floor != null
              ? String(response.data.stop.apartment_intelligence.floor)
              : ''
          );
        }
      } catch (error) {
        if (isMounted) {
          const message = error.response?.data?.error || 'Unable to load stop details.';
          Alert.alert('Stop unavailable', message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadStop();

    return () => {
      isMounted = false;
    };
  }, [stopId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: stop?.sequence_order ? `ST#${stop.sequence_order}` : 'Stop Detail'
    });
  }, [navigation, stop?.sequence_order]);

  async function refreshStop({ silent = false } = {}) {
    try {
      const response = await api.get(`/routes/stops/${stopId}`);
      setStop(response.data?.stop || null);
      setNoteDraft(response.data?.stop?.note_text || '');
      setFloorDraft(
        response.data?.stop?.apartment_intelligence?.floor != null
          ? String(response.data.stop.apartment_intelligence.floor)
          : ''
      );
      return true;
    } catch (error) {
      if (!silent) {
        const message = error.response?.data?.error || 'Unable to refresh stop details right now.';
        Alert.alert('Refresh failed', message);
      }

      return false;
    }
  }

  async function handleConfirmFloor() {
    const actualFloor = Number(floorDraft);

    if (!Number.isInteger(actualFloor) || actualFloor <= 0) {
      Alert.alert('Invalid floor', 'Enter a whole floor number like 1, 2, or 10.');
      return;
    }

    setIsSavingFloor(true);

    try {
      await api.patch(`/routes/stops/${stopId}/confirm-floor`, {
        actual_floor: actualFloor
      });
      const refreshed = await refreshStop({ silent: true });
      Alert.alert(
        'Floor saved',
        refreshed
          ? 'Thanks. Future deliveries to this unit will use the verified floor.'
          : 'Floor saved. Stop details may take a moment to refresh.'
      );
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to save floor confirmation right now.';
      Alert.alert('Save failed', message);
    } finally {
      setIsSavingFloor(false);
    }
  }

  async function handleSaveNote() {
    if (!noteDraft.trim()) {
      Alert.alert('Note required', 'Enter a note before saving.');
      return;
    }

    setIsSavingNote(true);

    try {
      await api.patch(`/routes/stops/${stopId}/note`, {
        note_text: noteDraft.trim()
      });

      const refreshed = await refreshStop({ silent: true });
      setIsEditingNote(false);
      if (!refreshed) {
        Alert.alert('Note saved', 'Your note was saved. The refreshed stop view may take a moment.');
      }
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to save note right now.';
      Alert.alert('Save failed', message);
    } finally {
      setIsSavingNote(false);
    }
  }

  async function handleFlagRoad(flagType) {
    try {
      if (stop?.lat == null || stop?.lng == null) {
        Alert.alert('Stop pin unavailable', 'This stop does not have a usable pin yet, so the road cannot be flagged from here.');
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Location needed', 'Allow location access to flag this road from your current position.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      await api.post(`/routes/stops/${stopId}/flag-road`, {
        lat_start: location.coords.latitude,
        lng_start: location.coords.longitude,
        lat_end: stop.lat,
        lng_end: stop.lng,
        flag_type: flagType.toLowerCase(),
        notes: `${flagType} flagged from stop detail`
      });
      setIsFlagModalVisible(false);
      Alert.alert('Road flagged', 'Thanks. Your route team will see this update.');
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to flag this road right now.';
      Alert.alert('Flag failed', message);
    }
  }

  async function handleNavigate() {
    if (!stop?.address) {
      return;
    }

    const { nativeGoogleMapsUrl, webGoogleMapsUrl } = buildGoogleNavigationUrls(stop.address);

    try {
      const canOpenNative = await Linking.canOpenURL(nativeGoogleMapsUrl);
      await Linking.openURL(canOpenNative ? nativeGoogleMapsUrl : webGoogleMapsUrl);
    } catch (_error) {
      Alert.alert('Navigation unavailable', 'Unable to open Google Maps right now.');
    }
  }

  async function handleSaveCurrentLocation() {
    setIsSavingLocation(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Location needed', 'Allow location access so ReadyRoute can save the corrected stop pin.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      await api.patch(`/routes/stops/${stopId}/correct-location`, {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        label: 'Driver verified pin'
      });

      const refreshed = await refreshStop({ silent: true });
      Alert.alert(
        'Location saved',
        refreshed
          ? 'This corrected pin will be reused for future deliveries to this address.'
          : 'The corrected pin was saved. The refreshed stop view may take a moment.'
      );
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to save the corrected stop location right now.';
      Alert.alert('Save failed', message);
    } finally {
      setIsSavingLocation(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#FF6200" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!stop) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Stop details are unavailable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = getStatusConfig(stop.status);
  const typeBadges = getTypeBadges(stop);
  const primaryAddressLine = getPrimaryAddressLine(stop);
  const addressLine2 = String(stop.address_line2 || '').trim();
  const hasSignatureRequired = (stop.packages || []).some((pkg) => pkg.requires_signature);
  const hasHazmat = (stop.packages || []).some((pkg) => pkg.hazmat);
  const hasVisibleNote = Boolean(stop.has_note && stop.note_text);
  const apartmentIntel = stop.apartment_intelligence;
  const propertyIntel = stop.property_intel;
  const displayLocationType = propertyIntel?.location_type || stop.location_type || null;
  const secondaryAddressDetails = formatSecondaryAddressDetails(stop);
  const hasApartmentInfo = Boolean(stop.is_apartment_unit || apartmentIntel);
  const isFloorDraftValid = Number.isInteger(Number(floorDraft)) && Number(floorDraft) > 0;
  const hasNoteDraft = Boolean(noteDraft.trim());
  const groupedStops = propertyIntel?.grouped_stops || [];
  const warningFlags = propertyIntel?.warning_flags || [];
  const hasPropertyIntel = Boolean(
    propertyIntel?.location_type ||
      propertyIntel?.building ||
      propertyIntel?.access_note ||
      propertyIntel?.parking_note ||
      warningFlags.length ||
      groupedStops.length
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          {stop.sequence_order ? (
            <View style={styles.stopNumberBadge}>
              <Text style={styles.stopNumberBadgeText}>ST#{stop.sequence_order}</Text>
            </View>
          ) : null}
          <Text style={styles.title}>{primaryAddressLine || stop.address}</Text>
          {addressLine2 ? <Text style={styles.addressLineTwo}>{addressLine2}</Text> : null}
          <View style={styles.badgeRow}>
            <View style={[styles.statusBadge, statusConfig.style]}>
              <Text style={styles.statusText}>{statusConfig.label}</Text>
            </View>
            {typeBadges.map((badge) => (
              <View key={badge.key} style={[styles.stopTypeBadge, badge.style]}>
                <Text style={[styles.stopTypeBadgeText, badge.textStyle]}>{badge.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {stop.has_time_commit && (stop.ready_time || stop.close_time) ? (
          <View style={styles.timeCommitBox}>
            <Text style={styles.timeCommitLabel}>TIME COMMIT WINDOW</Text>
            {stop.stop_type === 'pickup' ? (
              <>
                {stop.ready_time ? <Text style={styles.timeCommitText}>Ready for pickup: {stop.ready_time}</Text> : null}
                {stop.close_time ? <Text style={styles.timeCommitSubtext}>Business closes: {stop.close_time}</Text> : null}
                <Text style={styles.timeCommitSubtext}>You must arrive within this pickup window</Text>
              </>
            ) : stop.ready_time && stop.close_time ? (
              <Text style={styles.timeCommitText}>Deliver between {stop.ready_time} and {stop.close_time}</Text>
            ) : stop.close_time ? (
              <>
                <Text style={styles.timeCommitText}>Deliver before {stop.close_time}</Text>
                <Text style={styles.timeCommitSubtext}>This stop has a close-time requirement</Text>
              </>
            ) : (
              <>
                <Text style={styles.timeCommitText}>Ready at {stop.ready_time}</Text>
                <Text style={styles.timeCommitSubtext}>This stop has a ready-time requirement</Text>
              </>
            )}
          </View>
        ) : null}

        {stop.contact_name ? (
          <View style={styles.contactBlock}>
            <Text style={styles.contactLabel}>CONTACT</Text>
            <Text style={styles.contactValue}>{stop.contact_name}</Text>
          </View>
        ) : null}

        {secondaryAddressDetails ? (
          <View style={styles.contactBlock}>
            <Text style={styles.contactLabel}>ADDRESS INTEL</Text>
            <Text style={styles.contactValue}>{secondaryAddressDetails}</Text>
            {displayLocationType && displayLocationType !== 'house' ? (
              <Text style={styles.contactSubvalue}>{`Location profile: ${String(displayLocationType).toUpperCase()}`}</Text>
            ) : null}
          </View>
        ) : null}

        {hasApartmentInfo ? (
          <View style={styles.apartmentBox}>
            <Text style={styles.apartmentLabel}>APARTMENT / UNIT</Text>
            <Text style={styles.apartmentText}>
              {apartmentIntel?.unit_number ? `Unit ${apartmentIntel.unit_number}` : addressLine2 || 'Unit details unavailable'}
            </Text>
            {apartmentIntel?.floor != null ? (
              <Text style={styles.apartmentFloorText}>
                {`Floor ${apartmentIntel.floor} · ${apartmentIntel.verified ? 'Verified' : `${apartmentIntel.confidence} confidence ${apartmentIntel.source}`}`}
              </Text>
            ) : (
              <Text style={styles.apartmentFloorText}>Floor not known yet</Text>
            )}
            <TextInput
              keyboardType="number-pad"
              onChangeText={setFloorDraft}
              placeholder="Confirm actual floor"
              placeholderTextColor="#8b8b8b"
              style={styles.floorInput}
              value={floorDraft}
            />
            <Pressable
              disabled={isSavingFloor || !isFloorDraftValid}
              onPress={handleConfirmFloor}
              style={[styles.secondaryButton, (isSavingFloor || !isFloorDraftValid) && styles.buttonDisabled]}
            >
              {isSavingFloor ? <ActivityIndicator color="#173042" /> : <Text style={styles.secondaryButtonText}>Confirm floor</Text>}
            </Pressable>
          </View>
        ) : null}

        {hasPropertyIntel ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Intel</Text>
            <View style={styles.intelCard}>
              <View style={styles.intelBadgeRow}>
              {displayLocationType ? (
                  <View style={styles.intelBadge}>
                    <Text style={styles.intelBadgeText}>{String(displayLocationType).toUpperCase()}</Text>
                  </View>
                ) : null}
                {stop.suite_label ? (
                  <View style={styles.intelBadge}>
                    <Text style={styles.intelBadgeText}>{`SUITE ${stop.suite_label}`}</Text>
                  </View>
                ) : null}
                {stop.unit_label && !apartmentIntel?.unit_number ? (
                  <View style={styles.intelBadge}>
                    <Text style={styles.intelBadgeText}>{`UNIT ${stop.unit_label}`}</Text>
                  </View>
                ) : null}
                {propertyIntel?.building ? (
                  <View style={styles.intelBadge}>
                    <Text style={styles.intelBadgeText}>{propertyIntel.building}</Text>
                  </View>
                ) : null}
                {stop.floor_label && !apartmentIntel?.floor ? (
                  <View style={styles.intelBadge}>
                    <Text style={styles.intelBadgeText}>{stop.floor_label}</Text>
                  </View>
                ) : null}
                {warningFlags.map((flag) => (
                  <View key={flag} style={styles.warningPill}>
                    <Text style={styles.warningPillText}>{formatWarningFlag(flag)}</Text>
                  </View>
                ))}
              </View>

              {propertyIntel?.access_note ? (
                <View style={styles.intelRow}>
                  <Text style={styles.intelLabel}>Access</Text>
                  <Text style={styles.intelText}>{propertyIntel.access_note}</Text>
                </View>
              ) : null}

              {propertyIntel?.parking_note ? (
                <View style={styles.intelRow}>
                  <Text style={styles.intelLabel}>Parking</Text>
                  <Text style={styles.intelText}>{propertyIntel.parking_note}</Text>
                </View>
              ) : null}

              {propertyIntel?.estimated_floor != null && !apartmentIntel?.floor ? (
                <View style={styles.intelRow}>
                  <Text style={styles.intelLabel}>Estimated floor</Text>
                  <Text style={styles.intelText}>{propertyIntel.estimated_floor}</Text>
                </View>
              ) : null}

              {groupedStops.length ? (
                <View style={styles.intelRow}>
                  <Text style={styles.intelLabel}>Grouped stops</Text>
                  <View style={styles.groupedStopList}>
                    {groupedStops.map((groupedStop) => (
                      <View key={groupedStop.id} style={styles.groupedStopChip}>
                        <Text style={styles.groupedStopChipText}>
                          {`ST#${groupedStop.sequence_order}${groupedStop.unit ? ` · Unit ${groupedStop.unit}` : ''}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {stop.location_correction ? (
          <View style={styles.locationBox}>
            <Text style={styles.locationLabel}>PIN LOCATION</Text>
            <Text style={styles.locationText}>
              {stop.location_correction.applies_to_unit ? 'Verified for this unit' : 'Verified for this address'}
            </Text>
            <Text style={styles.locationSubtext}>
              {stop.location_correction.label || 'Driver confirmed location'}
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Packages</Text>
          <View style={styles.packageAlertRow}>
            {hasSignatureRequired ? (
              <View style={styles.packageAlertBadge}>
                <Text style={styles.packageAlertText}>SIGNATURE REQUIRED</Text>
              </View>
            ) : null}
            {hasHazmat ? (
              <View style={styles.packageAlertBadge}>
                <Text style={styles.packageAlertText}>HAZMAT</Text>
              </View>
            ) : null}
          </View>
          {(stop.packages || []).map((pkg) => (
            <View key={pkg.id} style={styles.packageRow}>
              <View>
                <Text style={styles.packageTracking}>{pkg.tracking_number}</Text>
                <Text style={styles.packageMeta}>
                  {pkg.requires_signature ? 'Signature required' : 'Standard delivery'}
                </Text>
              </View>
              {pkg.hazmat ? (
                <View style={styles.hazmatBadge}>
                  <Text style={styles.hazmatText}>HZ</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stop Notes</Text>
          {hasVisibleNote ? (
            <View style={styles.savedNoteBox}>
              <Text style={styles.savedNoteLabel}>NOTE</Text>
              <Text style={styles.savedNoteText}>{stop.note_text}</Text>
            </View>
          ) : null}
          {isEditingNote ? (
            <>
              <TextInput
                multiline
                onChangeText={setNoteDraft}
                placeholder="Add a delivery note"
                placeholderTextColor="#8b8b8b"
                style={styles.noteInput}
                value={noteDraft}
              />
              <Pressable
                disabled={isSavingNote || !hasNoteDraft}
                onPress={handleSaveNote}
                style={[styles.primaryButton, (isSavingNote || !hasNoteDraft) && styles.buttonDisabled]}
              >
                {isSavingNote ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Save</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.noteText}>{stop.note_text || 'No note saved yet.'}</Text>
            </>
          )}
        </View>

        <View style={styles.actionSection}>
          <Pressable onPress={handleNavigate} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Navigate</Text>
          </Pressable>

          <Pressable disabled={isSavingLocation} onPress={handleSaveCurrentLocation} style={styles.secondaryButton}>
            {isSavingLocation ? (
              <ActivityIndicator color="#173042" />
            ) : (
              <Text style={styles.secondaryButtonText}>Save current GPS as correct pin</Text>
            )}
          </Pressable>

          <Pressable onPress={() => setIsFlagModalVisible(true)} style={styles.warningButton}>
            <Text style={styles.warningButtonText}>Flag this road as problematic</Text>
          </Pressable>

          {!isEditingNote ? (
            <Pressable onPress={() => setIsEditingNote(true)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{stop.note_text ? 'Edit note' : 'Add note'}</Text>
            </Pressable>
          ) : null}
        </View>

        {stop.sid !== null && stop.sid !== undefined && String(stop.sid).trim() !== '' ? (
          <Text style={styles.sidText}>SID: {stop.sid}</Text>
        ) : null}

      </ScrollView>

      <Modal animationType="slide" onRequestClose={() => setIsFlagModalVisible(false)} presentationStyle="pageSheet" visible={isFlagModalVisible}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.sheetContent}>
            <Text style={styles.sectionTitle}>Flag this road</Text>
            {FLAG_OPTIONS.map((option) => (
              <Pressable key={option} onPress={() => handleFlagRoad(option)} style={styles.sheetOption}>
                <Text style={styles.sheetOptionText}>{option}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setIsFlagModalVisible(false)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  content: {
    padding: 18,
    paddingBottom: 28
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  emptyText: {
    color: '#66737c',
    fontSize: 16
  },
  headerRow: {
    marginBottom: 14
  },
  stopNumberBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#173042',
    borderRadius: 999,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  stopNumberBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  title: {
    color: '#173042',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 8
  },
  addressLineTwo: {
    color: '#173042',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 8,
    marginTop: -4
  },
  badgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  statusDelivered: {
    backgroundColor: '#e2f7e8'
  },
  statusAttempted: {
    backgroundColor: '#ffe6d6'
  },
  statusIncomplete: {
    backgroundColor: '#fde8e8'
  },
  statusPending: {
    backgroundColor: '#f1f3f5'
  },
  statusText: {
    color: '#173042',
    fontSize: 14,
    fontWeight: '800'
  },
  stopTypeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  stopTypeDeliveryBadge: {
    backgroundColor: '#f1f3f5'
  },
  stopTypePickupBadge: {
    backgroundColor: '#dbeafe'
  },
  stopTypeCombinedBadge: {
    backgroundColor: '#e9d5ff'
  },
  stopTypeBusinessBadge: {
    backgroundColor: '#111111'
  },
  stopTypeBadgeText: {
    fontSize: 14,
    fontWeight: '800'
  },
  stopTypeDeliveryBadgeText: {
    color: '#4b5563'
  },
  stopTypePickupBadgeText: {
    color: '#1d4ed8'
  },
  stopTypeCombinedBadgeText: {
    color: '#6d28d9'
  },
  stopTypeBusinessBadgeText: {
    color: '#ffffff'
  },
  contactBlock: {
    marginBottom: 14
  },
  contactLabel: {
    color: '#7a848d',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2
  },
  contactValue: {
    color: '#173042',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4
  },
  contactSubvalue: {
    color: '#51606e',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4
  },
  apartmentBox: {
    backgroundColor: '#f5f3ff',
    borderLeftColor: '#7c3aed',
    borderLeftWidth: 4,
    borderRadius: 16,
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  apartmentLabel: {
    color: '#6d28d9',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 6
  },
  apartmentText: {
    color: '#4c1d95',
    fontSize: 15,
    fontWeight: '800'
  },
  apartmentFloorText: {
    color: '#6d28d9',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 10
  },
  intelCard: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  intelBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  intelBadge: {
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  intelBadgeText: {
    color: '#173042',
    fontSize: 12,
    fontWeight: '800'
  },
  warningPill: {
    backgroundColor: '#fff7ed',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  warningPillText: {
    color: '#c2410c',
    fontSize: 12,
    fontWeight: '800'
  },
  intelRow: {
    gap: 6
  },
  intelLabel: {
    color: '#7a848d',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  intelText: {
    color: '#173042',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21
  },
  groupedStopList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  groupedStopChip: {
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  groupedStopChipText: {
    color: '#0f4c81',
    fontSize: 12,
    fontWeight: '800'
  },
  floorInput: {
    minHeight: 48,
    borderColor: '#d8dfe3',
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    color: '#173042',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 14,
    marginBottom: 10
  },
  locationBox: {
    backgroundColor: '#ecfeff',
    borderLeftColor: '#0891b2',
    borderLeftWidth: 4,
    borderRadius: 16,
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  locationLabel: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 6
  },
  locationText: {
    color: '#155e75',
    fontSize: 15,
    fontWeight: '800'
  },
  locationSubtext: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4
  },
  timeCommitBox: {
    backgroundColor: '#fff3cd',
    borderLeftColor: '#FF6200',
    borderLeftWidth: 4,
    borderRadius: 16,
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  timeCommitLabel: {
    color: '#8a4b08',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 6
  },
  timeCommitText: {
    color: '#6f4d00',
    fontSize: 15,
    fontWeight: '800'
  },
  timeCommitSubtext: {
    color: '#8a4b08',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4
  },
  mapThumbnail: {
    borderRadius: 18,
    height: 200,
    marginBottom: 18,
    width: '100%'
  },
  mapPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#f3f5f7',
    borderRadius: 18,
    height: 200,
    justifyContent: 'center',
    marginBottom: 18
  },
  mapPlaceholderText: {
    color: '#66737c',
    fontSize: 15
  },
  section: {
    marginBottom: 20
  },
  actionSection: {
    gap: 12,
    marginBottom: 20
  },
  sectionTitle: {
    color: '#173042',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10
  },
  packageAlertRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10
  },
  packageAlertBadge: {
    backgroundColor: '#c92a2a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  packageAlertText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900'
  },
  packageRow: {
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    padding: 13
  },
  packageTracking: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '700'
  },
  packageMeta: {
    color: '#66737c',
    fontSize: 14,
    marginTop: 4
  },
  hazmatBadge: {
    backgroundColor: '#c92a2a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  hazmatText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  noteText: {
    color: '#495862',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12
  },
  savedNoteBox: {
    backgroundColor: '#fff7f0',
    borderLeftColor: '#FF6200',
    borderLeftWidth: 4,
    borderRadius: 14,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  savedNoteLabel: {
    color: '#b45309',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4
  },
  savedNoteText: {
    color: '#173042',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21
  },
  noteInput: {
    borderColor: '#d7dce0',
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 12,
    minHeight: 112,
    padding: 14,
    textAlignVertical: 'top'
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#FF6200',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800'
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f3f5f7',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 16
  },
  secondaryButtonText: {
    color: '#173042',
    fontSize: 17,
    fontWeight: '700'
  },
  warningButton: {
    alignItems: 'center',
    backgroundColor: '#fff3ea',
    borderColor: '#ffd5bc',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 54,
    paddingHorizontal: 16
  },
  warningButtonText: {
    color: '#b44d07',
    fontSize: 16,
    fontWeight: '800'
  },
  buttonDisabled: {
    opacity: 0.55
  },
  sidText: {
    color: '#7a848d',
    fontSize: 13,
    marginBottom: 8
  },
  sheetContent: {
    flex: 1,
    padding: 18
  },
  sheetOption: {
    backgroundColor: '#ffffff',
    borderColor: '#e1e5e8',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  sheetOptionText: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '700'
  }
});
