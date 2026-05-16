import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import ManagerSectionLayout from '../components/ManagerSectionLayout';
import ManagerManifestUploadPanel from '../components/ManagerManifestUploadPanel';
import AppCard from '../components/ui/AppCard';
import ErrorState from '../components/ui/ErrorState';
import RouteMetricIcon from '../components/RouteMetricIcon';
import api from '../services/api';
import appTheme from '../theme/appTheme';

function getTodayDateParam() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function getRouteUploadLabel(route) {
  return route?.work_area_name || route?.route_number || route?.name || route?.id || '';
}

function getRouteUploadTimestamp(route) {
  return route?.uploaded_at || route?.manifest_uploaded_at || route?.created_at || route?.updated_at || '';
}

function getRouteUploadMode(route) {
  return route?.upload_mode || route?.manifest_upload_mode || route?.source || '';
}

function buildRecentManifestUploads(payload = {}) {
  if (Array.isArray(payload.uploads)) {
    return payload.uploads.filter(Boolean);
  }

  if (Array.isArray(payload.manifests)) {
    return payload.manifests.filter(Boolean);
  }

  return (payload.routes || [])
    .filter((route) => getRouteUploadMode(route) || getRouteUploadTimestamp(route))
    .map((route) => ({
      id: route.id,
      label: getRouteUploadLabel(route),
      mode: getRouteUploadMode(route),
      timestamp: getRouteUploadTimestamp(route)
    }));
}

function UploadHistoryItem({ item }) {
  const label = item.label || item.work_area_name || item.file_name || item.filename || 'Manifest upload';
  const mode = item.mode || item.upload_mode || item.source || '';
  const timestamp = item.timestamp || item.uploaded_at || item.created_at || '';

  return (
    <View style={styles.historyItem}>
      <View style={styles.historyIcon}>
        <RouteMetricIcon color={appTheme.colors.orangeDeep} name="notes" size={appTheme.icons.sm} />
      </View>
      <View style={styles.historyCopy}>
        <Text numberOfLines={1} style={styles.historyTitle}>{label}</Text>
        {mode || timestamp ? (
          <Text numberOfLines={1} style={styles.historyMeta}>
            {[mode, timestamp].filter(Boolean).join(' • ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function ManagerManifestScreen({ csaWorkspaceVersion = 0, identity, onManagerDataRefresh }) {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [payload, setPayload] = useState(null);
  const date = getTodayDateParam();

  async function loadManifestContext() {
    setIsLoading(true);

    try {
      const response = await api.get('/manager/routes', {
        authMode: 'manager',
        params: { date }
      });
      setPayload(response.data || null);
      setErrorMessage('');
    } catch (_error) {
      setErrorMessage('Manifest status could not be loaded right now.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadManifestContext();
  }, [csaWorkspaceVersion]);

  const recentUploads = useMemo(() => buildRecentManifestUploads(payload || {}), [payload]);
  const workspaceName = payload?.account?.company_name || identity?.companyName || 'Upload route files and prepare today’s routes.';

  async function handleManifestUploaded() {
    await loadManifestContext();
    onManagerDataRefresh?.();
  }

  return (
    <ManagerSectionLayout
      compact
      eyebrow="ReadyRoute"
      subtitle={workspaceName}
      title="Manifest"
      tone="light"
    >
      <AppCard style={styles.uploadCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <RouteMetricIcon color={appTheme.colors.orangeDeep} name="notes" size={appTheme.icons.md} />
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle}>Add routes from files</Text>
            <Text style={styles.cardSubtitle}>Upload route files and prepare today’s routes.</Text>
          </View>
        </View>
        <ManagerManifestUploadPanel
          onUploaded={handleManifestUploaded}
          showAutomaticSyncNote
          submitLabel="Upload Manifest"
        />
      </AppCard>

      <AppCard style={styles.statusCard}>
        <Text style={styles.sectionTitle}>Upload status</Text>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={appTheme.colors.orange} size="small" />
            <Text style={styles.loadingText}>Loading manifest status</Text>
          </View>
        ) : errorMessage ? (
          <ErrorState
            body="Check your connection and try again."
            onAction={loadManifestContext}
            title="Could not load manifest status"
          />
        ) : recentUploads.length > 0 ? (
          <View style={styles.historyList}>
            {recentUploads.slice(0, 5).map((item, index) => (
              <UploadHistoryItem item={item} key={item.id || item.file_name || item.label || index} />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No manifest uploaded for this day.</Text>
        )}
      </AppCard>
    </ManagerSectionLayout>
  );
}

export {
  buildRecentManifestUploads,
  getTodayDateParam
};

const styles = StyleSheet.create({
  uploadCard: {
    gap: appTheme.spacing.md,
    padding: appTheme.spacing.lg
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.sm
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orangeSoft,
    borderRadius: appTheme.radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  cardCopy: {
    flex: 1,
    minWidth: 0
  },
  cardTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  cardSubtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginTop: 2
  },
  statusCard: {
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.lg
  },
  sectionTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.heavy
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  loadingText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall
  },
  historyList: {
    gap: appTheme.spacing.xs
  },
  historyItem: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    minHeight: 52,
    paddingHorizontal: appTheme.spacing.md
  },
  historyIcon: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  historyCopy: {
    flex: 1,
    minWidth: 0
  },
  historyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  historyMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    marginTop: 2
  },
  emptyText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  }
});
