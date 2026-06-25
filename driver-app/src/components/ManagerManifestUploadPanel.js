import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import RouteMetricIcon from './RouteMetricIcon';
import AppButton from './ui/AppButton';
import api from '../services/api';
import {
  GPX_MIME_TYPES,
  XLS_MIME_TYPES,
  buildManifestFormData,
  getPickedAsset,
  getSupportedRouteFileKind,
  isSupportedRouteFile
} from '../services/managerManifestUpload';
import appTheme from '../theme/appTheme';

export default function ManagerManifestUploadPanel({
  failureMessage = 'Could not process manifest.',
  onUploaded,
  showAutomaticSyncNote = false,
  successMessage = 'Manifest uploaded successfully.',
  submitLabel = 'Upload Manifest'
}) {
  const [selectedXlsFile, setSelectedXlsFile] = useState(null);
  const [selectedGpxFile, setSelectedGpxFile] = useState(null);
  const [selectedManifestFiles, setSelectedManifestFiles] = useState({
    combinedManifestFile: null,
    combinedGpxFile: null,
    deliveryManifestFile: null,
    deliveryGpxFile: null,
    pickupManifestFile: null
  });
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);
  const [isUploadingRoutes, setIsUploadingRoutes] = useState(false);
  const selectedBundleFileCount = Object.values(selectedManifestFiles).filter(Boolean).length;
  const hasSelectedFiles = Boolean(selectedXlsFile || selectedGpxFile || selectedBundleFileCount);

  async function pickRouteFile(expectedKind, bundleKey = null) {
    setUploadError('');
    setUploadResult(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: expectedKind === 'gpx' ? GPX_MIME_TYPES : XLS_MIME_TYPES
      });
      const asset = getPickedAsset(result);

      if (!asset) {
        return;
      }

      if (!isSupportedRouteFile(asset.name)) {
        setUploadError('This file type is not supported. Upload an XLS or GPX file.');
        return;
      }

      const fileKind = getSupportedRouteFileKind(asset.name);

      if (expectedKind === 'xls' && fileKind !== 'xls') {
        setUploadError('This file type is not supported. Upload an XLS or GPX file.');
        return;
      }

      if (expectedKind === 'gpx' && fileKind !== 'gpx') {
        setUploadError('This file type is not supported. Upload an XLS or GPX file.');
        return;
      }

      if (bundleKey) {
        setSelectedManifestFiles((current) => ({ ...current, [bundleKey]: asset }));
        setSelectedXlsFile(null);
        setSelectedGpxFile(null);
      } else if (fileKind === 'gpx') {
        setSelectedGpxFile(asset);
      } else {
        setSelectedXlsFile(asset);
      }
    } catch (_error) {
      setUploadError(failureMessage);
    }
  }

  function clearSelectedFiles() {
    setSelectedXlsFile(null);
    setSelectedGpxFile(null);
    setSelectedManifestFiles({
      combinedManifestFile: null,
      combinedGpxFile: null,
      deliveryManifestFile: null,
      deliveryGpxFile: null,
      pickupManifestFile: null
    });
    setUploadError('');
    setUploadProgress(0);
    setUploadResult(null);
  }

  async function submitRouteUpload() {
    if (!hasSelectedFiles || isUploadingRoutes) {
      return;
    }

    const formData = buildManifestFormData({
      gpxFile: selectedGpxFile,
      xlsFile: selectedXlsFile,
      combinedManifestFile: selectedManifestFiles.combinedManifestFile,
      combinedGpxFile: selectedManifestFiles.combinedGpxFile,
      deliveryManifestFile: selectedManifestFiles.deliveryManifestFile,
      deliveryGpxFile: selectedManifestFiles.deliveryGpxFile,
      pickupManifestFile: selectedManifestFiles.pickupManifestFile
    });

    if (!formData) {
      setUploadError('This file type is not supported. Upload an XLS or GPX file.');
      return;
    }

    setIsUploadingRoutes(true);
    setUploadError('');
    setUploadProgress(0);
    setUploadResult(null);

    try {
      const response = await api.post('/routes/upload-manifest', formData, {
        authMode: 'manager',
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (event) => {
          const total = Number(event.total || 0);
          if (total > 0) {
            setUploadProgress(Math.round((Number(event.loaded || 0) / total) * 100));
          }
        }
      });

      setUploadProgress(100);
      setUploadResult(response.data || { ok: true });
      await onUploaded?.(response.data || null);
    } catch (_error) {
      setUploadError(failureMessage);
    } finally {
      setIsUploadingRoutes(false);
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.body}>
        Upload today’s manifest files. ReadyRoute will use them to build routes, stops, packages, pickups, customer contact detail, and map pins.
      </Text>
      <Text style={styles.helperText}>
        For best results, attach Combined, Delivery, Pickup, and the matching GPX files together so ReadyRoute can merge route pins, package detail, service codes, and customer contact data in one pass.
      </Text>

      <View style={styles.uploadOptionList}>
        <Pressable
          onPress={() => pickRouteFile('xls', 'combinedManifestFile')}
          style={({ pressed }) => [styles.uploadOption, pressed ? styles.pressed : null]}
        >
          <RouteMetricIcon color={appTheme.colors.orangeDeep} name="notes" size={appTheme.icons.md} />
          <View style={styles.uploadOptionCopy}>
            <Text style={styles.uploadOptionText}>Combined XLS</Text>
            <Text numberOfLines={1} style={styles.selectedFileText}>
              {selectedManifestFiles.combinedManifestFile?.name || selectedXlsFile?.name || 'CombinedManifest.xls'}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => pickRouteFile('gpx', 'combinedGpxFile')}
          style={({ pressed }) => [styles.uploadOption, pressed ? styles.pressed : null]}
        >
          <RouteMetricIcon color={appTheme.colors.orangeDeep} name="map" size={appTheme.icons.md} />
          <View style={styles.uploadOptionCopy}>
            <Text style={styles.uploadOptionText}>Combined GPX</Text>
            <Text numberOfLines={1} style={styles.selectedFileText}>
              {selectedManifestFiles.combinedGpxFile?.name || selectedGpxFile?.name || 'CombinedManifest.gpx'}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => pickRouteFile('xls', 'deliveryManifestFile')}
          style={({ pressed }) => [styles.uploadOption, pressed ? styles.pressed : null]}
        >
          <RouteMetricIcon color={appTheme.colors.orangeDeep} name="notes" size={appTheme.icons.md} />
          <View style={styles.uploadOptionCopy}>
            <Text style={styles.uploadOptionText}>Delivery XLS</Text>
            <Text numberOfLines={1} style={styles.selectedFileText}>
              {selectedManifestFiles.deliveryManifestFile?.name || 'DeliveryManifest.xls'}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => pickRouteFile('gpx', 'deliveryGpxFile')}
          style={({ pressed }) => [styles.uploadOption, pressed ? styles.pressed : null]}
        >
          <RouteMetricIcon color={appTheme.colors.orangeDeep} name="map" size={appTheme.icons.md} />
          <View style={styles.uploadOptionCopy}>
            <Text style={styles.uploadOptionText}>Delivery GPX</Text>
            <Text numberOfLines={1} style={styles.selectedFileText}>
              {selectedManifestFiles.deliveryGpxFile?.name || 'DeliveryManifest.gpx'}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => pickRouteFile('xls', 'pickupManifestFile')}
          style={({ pressed }) => [styles.uploadOption, pressed ? styles.pressed : null]}
        >
          <RouteMetricIcon color={appTheme.colors.orangeDeep} name="truck" size={appTheme.icons.md} />
          <View style={styles.uploadOptionCopy}>
            <Text style={styles.uploadOptionText}>Pickup XLS</Text>
            <Text numberOfLines={1} style={styles.selectedFileText}>
              {selectedManifestFiles.pickupManifestFile?.name || 'PickupManifest.xls'}
            </Text>
          </View>
        </Pressable>
      </View>

      {uploadProgress > 0 || isUploadingRoutes ? (
        <View style={styles.uploadProgressTrack}>
          <View style={[styles.uploadProgressFill, { width: `${Math.max(uploadProgress, isUploadingRoutes ? 8 : 0)}%` }]} />
        </View>
      ) : null}

      {uploadError ? <Text style={styles.uploadError}>{uploadError}</Text> : null}
      {uploadResult ? <Text style={styles.uploadSuccess}>{successMessage}</Text> : null}

      {uploadResult?.route?.work_area_name || uploadResult?.work_area_name ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Route generation result</Text>
          <Text style={styles.resultBody}>
            {uploadResult?.route?.work_area_name || uploadResult?.work_area_name}
          </Text>
        </View>
      ) : null}

      {showAutomaticSyncNote ? (
        <Text style={styles.syncNote}>Automatic sync can be configured from the manager portal when available.</Text>
      ) : null}

      <View style={styles.buttonRow}>
        {hasSelectedFiles ? (
          <AppButton label="Clear" onPress={clearSelectedFiles} style={styles.splitButton} variant="outline" />
        ) : null}
        <Pressable
          disabled={!hasSelectedFiles || isUploadingRoutes}
          onPress={submitRouteUpload}
          style={({ pressed }) => [
            styles.submitButton,
            !hasSelectedFiles || isUploadingRoutes ? styles.submitButtonDisabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          {isUploadingRoutes ? (
            <ActivityIndicator color={appTheme.colors.textInverse} size="small" />
          ) : (
            <Text style={styles.submitButtonText}>{submitLabel}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: appTheme.spacing.sm
  },
  body: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  helperText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  uploadOptionList: {
    gap: appTheme.spacing.xs
  },
  uploadOption: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orangeSoft,
    borderRadius: appTheme.radius.md,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    minHeight: 50,
    paddingHorizontal: appTheme.spacing.md
  },
  uploadOptionCopy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8
  },
  uploadOptionText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  selectedFileText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    marginTop: 2
  },
  uploadProgressTrack: {
    backgroundColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    height: 8,
    overflow: 'hidden'
  },
  uploadProgressFill: {
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.pill,
    height: '100%'
  },
  uploadError: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  uploadSuccess: {
    color: appTheme.colors.greenText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  syncNote: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    lineHeight: 17
  },
  resultCard: {
    backgroundColor: appTheme.colors.greenSoft,
    borderRadius: appTheme.radius.md,
    padding: appTheme.spacing.md
  },
  resultTitle: {
    color: appTheme.colors.greenText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  resultBody: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    marginTop: 2
  },
  buttonRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  splitButton: {
    flex: 1
  },
  submitButton: {
    alignItems: 'center',
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.buttons.radius,
    flex: 1,
    justifyContent: 'center',
    minHeight: appTheme.buttons.height,
    paddingHorizontal: appTheme.buttons.horizontalPadding
  },
  submitButtonDisabled: {
    backgroundColor: appTheme.colors.borderStrong,
    shadowOpacity: 0
  },
  submitButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  pressed: {
    opacity: 0.86
  }
});
