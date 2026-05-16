import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import MapView from '../components/MapView';
import { PageHeader, StatusBadge } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import { getStopContactDetails } from '../utils/contactInfo';
import { getTodayString, loadStoredOperationsDate, saveStoredOperationsDate } from '../utils/operationsDate';
import { sortRoutesByWorkArea } from '../utils/routeSort';

const MANIFEST_UPLOAD_STORAGE_KEY = 'readyroute:manifest-latest-upload';

function formatMorningDate(dateValue) {
  return format(new Date(`${dateValue}T12:00:00`), 'EEEE, MMMM d');
}

function formatSyncLine(timestamp) {
  if (!timestamp) {
    return 'Not synced today';
  }

  const date = new Date(timestamp);
  return `Last synced today at ${format(date, 'h:mm a')}`;
}

function formatAuditEventTime(timestamp) {
  if (!timestamp) {
    return 'Unknown time';
  }

  return format(new Date(timestamp), 'h:mm a');
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCount(value) {
  return safeNumber(value).toLocaleString();
}

function getDispatchWindowCopy(routeSyncSettings) {
  if (!routeSyncSettings) {
    return 'ReadyRoute uses this CSA’s local dispatch window to interpret route readiness.';
  }

  switch (routeSyncSettings.dispatch_window_state) {
    case 'before_window':
      return `It is still before this CSA’s local dispatch window (${routeSyncSettings.dispatch_window_label} ${routeSyncSettings.operations_timezone}). ReadyRoute should keep staging morning changes.`;
    case 'active_window':
      return `This CSA is inside its active dispatch window (${routeSyncSettings.dispatch_window_label} ${routeSyncSettings.operations_timezone}). Dispatch can happen as soon as blockers are cleared.`;
    case 'after_window':
      return `This CSA is past its configured dispatch window for today (${routeSyncSettings.dispatch_window_label} ${routeSyncSettings.operations_timezone}). Treat late manifest changes more carefully.`;
    case 'historical':
      return `You are reviewing a historical date. Dispatch timing is shown using ${routeSyncSettings.operations_timezone}.`;
    case 'scheduled':
    default:
      return `ReadyRoute will use ${routeSyncSettings.operations_timezone} and the ${routeSyncSettings.dispatch_window_label} window for this CSA’s morning route sync logic.`;
  }
}

const ROUTE_COLOR_PALETTE = [
  '#ff6200',
  '#1a73e8',
  '#0f9d58',
  '#d93025',
  '#8e24aa',
  '#f9ab00',
  '#00897b',
  '#5f6368'
];

function getRouteColorMap(routes) {
  const workAreas = [...new Set((routes || []).map((route) => route.work_area_name).filter(Boolean))];
  return workAreas.reduce((map, workAreaName, index) => {
    map.set(workAreaName, ROUTE_COLOR_PALETTE[index % ROUTE_COLOR_PALETTE.length]);
    return map;
  }, new Map());
}

function getRouteCenter(stops = []) {
  const validStops = (stops || []).filter(
    (stop) =>
      stop?.lat != null &&
      stop?.lng != null &&
      Number.isFinite(Number(stop.lat)) &&
      Number.isFinite(Number(stop.lng))
  );

  if (!validStops.length) {
    return null;
  }

  return {
    lat: validStops.reduce((sum, stop) => sum + Number(stop.lat), 0) / validStops.length,
    lng: validStops.reduce((sum, stop) => sum + Number(stop.lng), 0) / validStops.length
  };
}

function buildManifestMarkers(routes, routeColorMap) {
  return (routes || []).flatMap((route) =>
    (route.stops || [])
      .filter(
        (stop) =>
          stop?.lat != null &&
          stop?.lng != null &&
          Number.isFinite(Number(stop.lat)) &&
          Number.isFinite(Number(stop.lng))
      )
      .map((stop) => ({
        lat: Number(stop.lat),
        lng: Number(stop.lng),
        color: routeColorMap.get(route.work_area_name) || '#ff6200',
        scale: stop.status === 'delivered' ? 7 : 9,
        fillOpacity: stop.status === 'delivered' ? 0.72 : 1,
        label: `${route.work_area_name} · ST#${stop.sequence_order}`,
        shortLabel: String(stop.sequence_order || ''),
        subtitle: stop.address || 'No address',
        secondaryLine: route.driver_name || 'Unassigned'
      }))
  );
}

function getRouteStatus(route) {
  if (route.dispatch_state === 'dispatched') {
    return { label: 'Dispatched', className: 'manifest-status-pill active' };
  }

  if (route.dispatch_state === 'staged') {
    return { label: 'Staged', className: 'manifest-status-pill ready' };
  }

  if (!route.driver_id) {
    return { label: 'Unassigned', className: 'manifest-status-pill unassigned' };
  }

  if (route.status === 'complete') {
    return { label: 'Complete', className: 'manifest-status-pill active' };
  }

  if (route.status === 'in_progress') {
    return { label: 'Active', className: 'manifest-status-pill active' };
  }

  return { label: 'Ready', className: 'manifest-status-pill ready' };
}

function getRouteSyncStatePill(route) {
  switch (route.sync_state) {
    case 'staged_stable':
      return { label: 'Stable', className: 'manifest-status-pill mapped' };
    case 'staged_changed':
      return { label: 'Changed', className: 'manifest-status-pill partial' };
    case 'dispatch_blocked':
      return { label: 'Blocked', className: 'manifest-status-pill unassigned' };
    case 'changed_after_dispatch':
      return { label: 'Changed after dispatch', className: 'manifest-status-pill partial' };
    case 'sync_failed':
      return { label: 'Sync failed', className: 'manifest-status-pill needs-pins' };
    case 'syncing':
      return { label: 'Syncing', className: 'manifest-status-pill ready' };
    case 'sync_pending':
    default:
      return { label: 'Pending sync', className: 'manifest-status-pill ready' };
  }
}

function getRouteMapHealth(route) {
  switch (route?.map_status) {
    case 'mapped':
      return { label: 'Mapped', className: 'manifest-status-pill mapped' };
    case 'partially_mapped':
      return { label: 'Partially mapped', className: 'manifest-status-pill partial' };
    case 'needs_pins':
    default:
      return { label: 'Needs pins', className: 'manifest-status-pill needs-pins' };
  }
}

function getPinSourceSummary(routeHealth) {
  if (!routeHealth?.pin_source_counts) {
    return [];
  }

  const counts = routeHealth.pin_source_counts;
  const lines = [];

  if (counts.manifest > 0) {
    lines.push(`${counts.manifest} manifest pins`);
  }
  if (counts.cache > 0) {
    lines.push(`${counts.cache} reused pins`);
  }
  if (counts.google > 0) {
    lines.push(`${counts.google} new Google pins`);
  }
  if (counts.driver_verified > 0) {
    lines.push(`${counts.driver_verified} driver pins`);
  }
  if (counts.other > 0) {
    lines.push(`${counts.other} other pins`);
  }

  return lines;
}

function getUploadModeLabel(uploadMode) {
  switch (uploadMode) {
    case 'manifest_bundle':
      return 'Manifest bundle';
    case 'spreadsheet_gpx':
      return 'Spreadsheet + GPX';
    case 'spreadsheet':
      return 'Spreadsheet only';
    case 'gpx':
      return 'GPX only';
    default:
      return 'Manual upload';
  }
}

function loadStoredManifestUpload(dateValue) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(MANIFEST_UPLOAD_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.date !== dateValue || !parsed.latestUpload) {
      return null;
    }

    return parsed.latestUpload;
  } catch {
    return null;
  }
}

function saveStoredManifestUpload(dateValue, latestUpload) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!latestUpload) {
      window.sessionStorage.removeItem(MANIFEST_UPLOAD_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      MANIFEST_UPLOAD_STORAGE_KEY,
      JSON.stringify({ date: dateValue, latestUpload })
    );
  } catch {
    // Ignore session storage write failures in the browser.
  }
}

function getRouteAttentionItems(route) {
  const items = [];

  if (route?.sync_state === 'staged_changed') {
    items.push({ key: 'sync-changed', label: 'Manifest changed since last sync', tone: 'warning' });
  }

  if (route?.sync_state === 'changed_after_dispatch') {
    items.push({
      key: 'post-dispatch-change',
      label:
        route?.post_dispatch_change_policy?.code === 'manager_review_required'
          ? 'Changed after dispatch · manager review required'
          : 'Changed after dispatch · driver warning',
      tone: route?.post_dispatch_change_policy?.code === 'manager_review_required' ? 'urgent' : 'warning'
    });
  }

  if (route?.sync_state === 'sync_failed') {
    items.push({ key: 'sync-failed', label: 'Sync failed', tone: 'urgent' });
  }

  if (!route?.driver_id) {
    items.push({ key: 'driver', label: 'Needs driver', tone: 'urgent' });
  }

  if (!route?.vehicle_id) {
    items.push({ key: 'vehicle', label: 'Needs vehicle', tone: 'warning' });
  }

  if (route?.map_status === 'needs_pins') {
    items.push({ key: 'pins', label: 'Needs pins', tone: 'urgent' });
  } else if (route?.map_status === 'partially_mapped') {
    items.push({
      key: 'partial-pins',
      label: `${route.missing_stops || 0} pins missing`,
      tone: 'warning'
    });
  }

  const routeWarnings = (route?.stops || []).filter((stop) => Boolean(stop?.notes)).length;
  if (routeWarnings > 0) {
    items.push({
      key: 'warnings',
      label: `${routeWarnings} address warning${routeWarnings === 1 ? '' : 's'}`,
      tone: 'warning'
    });
  }

  return items;
}

function routeHasAddressWarnings(route) {
  return (route?.stops || []).some((stop) => Boolean(stop?.notes));
}

function routeBlocksDispatch(route) {
  return ['sync_pending', 'syncing', 'sync_failed', 'needs_attention', 'dispatch_blocked'].includes(
    route?.sync_state
  );
}

function routeNeedsDispatchReview(route) {
  if (route?.dispatch_state === 'dispatched' || routeBlocksDispatch(route)) {
    return false;
  }

  return (
    route?.sync_state === 'staged_changed' ||
    route?.sync_state === 'changed_after_dispatch' ||
    route?.map_status === 'needs_pins' ||
    route?.map_status === 'partially_mapped' ||
    routeHasAddressWarnings(route)
  );
}

function getRouteDispatchSummary(route) {
  if (routeBlocksDispatch(route)) {
    if (!route?.driver_id && !route?.vehicle_id) {
      return 'Assign a driver and a vehicle before this route can dispatch.';
    }
    if (!route?.driver_id) {
      return 'Assign a driver before dispatch.';
    }
    if (!route?.vehicle_id) {
      return 'Assign a vehicle before dispatch.';
    }
    if (route?.sync_state === 'sync_failed') {
      return 'Manifest sync failed. Review this route before dispatch.';
    }
    if (route?.sync_state === 'syncing' || route?.sync_state === 'sync_pending') {
      return 'ReadyRoute is still building this manifest.';
    }
    return 'This route needs attention before dispatch.';
  }

  if (route?.sync_state === 'changed_after_dispatch') {
    if (route?.post_dispatch_change_policy?.code === 'manager_review_required') {
      return 'The manifest changed after dispatch and the route is already in progress. Recheck with the driver before sending further updates.';
    }

    return 'The manifest changed after dispatch before work really started. Warn the driver and confirm they see the updated route.';
  }

  if (route?.sync_state === 'staged_changed') {
    return 'The manifest changed since the last stable sync. Review before dispatch.';
  }

  if (route?.map_status === 'needs_pins') {
    return 'This route still needs usable pins before drivers head out.';
  }

  if (route?.map_status === 'partially_mapped') {
    return `${route?.missing_stops || 0} stop${route?.missing_stops === 1 ? '' : 's'} still need pins before dispatch review is complete.`;
  }

  if (routeHasAddressWarnings(route)) {
    return 'Address warnings were detected on this route. Review before dispatch.';
  }

  if (route?.dispatch_state === 'dispatched') {
    return 'This route is already live in the driver app.';
  }

  return 'This route is staged and ready to dispatch.';
}

function MorningStepRail({ steps }) {
  return (
    <aside className="morning-step-rail" aria-label="Morning setup steps">
      {steps.map((step) => (
        <div className={`morning-step-rail-item ${step.status}`} key={step.key}>
          <div className="morning-step-number">{step.order}</div>
          <div>
            <div className="morning-step-label">{step.label}</div>
            <div className="morning-step-state">{step.state}</div>
          </div>
        </div>
      ))}
    </aside>
  );
}

function createWarningRows(routes, editedWarnings = {}) {
  const warnings = [];

  for (const route of routes || []) {
    for (const stop of route.stops || []) {
      if (!stop.notes) {
        continue;
      }

      warnings.push({
        key: stop.id,
        route_id: route.id,
        work_area_name: route.work_area_name,
        stop_id: stop.id,
        sequence_order: stop.sequence_order,
        address: editedWarnings[stop.id] ?? stop.address,
        warning: stop.notes
      });
    }
  }

  return warnings;
}

export default function ManifestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const gpxInputRef = useRef(null);
  const routeCardRefs = useRef(new Map());
  const routeFieldRefs = useRef(new Map());
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDate = searchParams.get('date') || loadStoredOperationsDate() || getTodayString();
  const [date, setDate] = useState(initialDate);
  const [activeTab, setActiveTab] = useState('auto');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedGpxFile, setSelectedGpxFile] = useState(null);
  const [manifestBundleFiles, setManifestBundleFiles] = useState({
    combinedManifest: null,
    combinedGpx: null,
    deliveryManifest: null,
    deliveryGpx: null,
    pickupManifest: null
  });
  const [workAreaName, setWorkAreaName] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [latestUpload, setLatestUpload] = useState(() => loadStoredManifestUpload(initialDate));
  const [syncPanelExpanded, setSyncPanelExpanded] = useState(true);
  const [warningsExpanded, setWarningsExpanded] = useState(true);
  const [editedWarnings, setEditedWarnings] = useState({});
  const [editingWarningIds, setEditingWarningIds] = useState({});
  const [savingRouteIds, setSavingRouteIds] = useState(new Set());
  const [selectedDispatchRouteIds, setSelectedDispatchRouteIds] = useState([]);

  const today = getTodayString();
  const isPastDate = date < today;
  const forceSyncOpen = searchParams.get('action') === 'sync';
  const { selectedCsaId } = useSelectedCsa();

  const routesQuery = useQuery({
    queryKey: ['manager-routes', selectedCsaId, date],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/routes', { params: { date } });
      return response.data;
    }
  });

  const driversQuery = useQuery({
    queryKey: ['manager-drivers-manifest', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/drivers');
      return response.data?.drivers || [];
    }
  });

  const vehiclesQuery = useQuery({
    queryKey: ['manager-vehicles', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/vehicles');
      return response.data?.vehicles || [];
    }
  });

  const routePayload = routesQuery.data || {};
  const routeSummaries = useMemo(() => sortRoutesByWorkArea(routePayload.routes || []), [routePayload.routes]);
  const syncStatus = routePayload.sync_status || { routes_today: 0, routes_assigned: 0, last_sync_at: null };
  const routeSyncSettings = routePayload.route_sync_settings || null;
  const fedexConnection = routePayload.fedex_connection || { is_connected: false, terminal_label: null };
  const warningRows = useMemo(() => createWarningRows(routeSummaries, editedWarnings), [routeSummaries, editedWarnings]);
  const routeColorMap = useMemo(() => getRouteColorMap(routeSummaries), [routeSummaries]);
  const manifestMarkers = useMemo(() => buildManifestMarkers(routeSummaries, routeColorMap), [routeSummaries, routeColorMap]);
  const manifestCenter = useMemo(() => {
    const allStops = routeSummaries.flatMap((route) => route.stops || []);
    return getRouteCenter(allStops);
  }, [routeSummaries]);
  const bundleFileList = useMemo(
    () => Object.values(manifestBundleFiles).filter(Boolean),
    [manifestBundleFiles]
  );
  const hasManifestBundleFiles = bundleFileList.length > 0;
  const selectedFileName = selectedFile?.name?.toLowerCase() || '';
  const hasSelectedFile = Boolean(selectedFile) || hasManifestBundleFiles;
  const isSpreadsheetUpload = selectedFileName.endsWith('.xls') || selectedFileName.endsWith('.xlsx');
  const isManifestBundleUpload = hasManifestBundleFiles;
  const needsGpxUploadFields = hasSelectedFile && !isSpreadsheetUpload && !isManifestBundleUpload && (!workAreaName.trim() || !driverId || !vehicleId);
  const latestUploadRoute = latestUpload ? routeSummaries.find((route) => route.id === latestUpload.route_id) : null;
  const hasRoutesToday = routeSummaries.length > 0;
  const canModifyExistingRoutes = hasRoutesToday;
  const allRoutesHaveDrivers = hasRoutesToday && routeSummaries.every((route) => Boolean(route.driver_id));
  const routesNeedingDrivers = routeSummaries.filter((route) => !route.driver_id);
  const routesNeedingVehicles = routeSummaries.filter((route) => !route.vehicle_id);
  const routesNeedingPins = routeSummaries.filter((route) => route.map_status === 'needs_pins');
  const partiallyMappedRoutes = routeSummaries.filter((route) => route.map_status === 'partially_mapped');
  const routesWithWarnings = routeSummaries.filter((route) => routeHasAddressWarnings(route));
  const routesWithSyncWarnings = routeSummaries.filter((route) => route.sync_state === 'staged_changed');
  const routesChangedAfterDispatch = routeSummaries.filter((route) => route.sync_state === 'changed_after_dispatch');
  const routesWithSyncFailures = routeSummaries.filter((route) => route.sync_state === 'sync_failed');
  const dispatchedRoutes = routeSummaries.filter((route) => route.dispatch_state === 'dispatched');
  const blockedDispatchRoutes = routeSummaries.filter((route) => routeBlocksDispatch(route));
  const reviewDispatchRoutes = routeSummaries.filter((route) => routeNeedsDispatchReview(route));
  const readyDispatchRoutes = routeSummaries.filter(
    (route) =>
      route.dispatch_state !== 'dispatched' && !routeBlocksDispatch(route) && !routeNeedsDispatchReview(route)
  );
  const dispatchableRoutes = routeSummaries.filter(
    (route) => route.dispatch_state !== 'dispatched' && !routeBlocksDispatch(route)
  );
  const routeTotals = useMemo(() => {
    const totalStops = routeSummaries.reduce((sum, route) => sum + safeNumber(route.total_stops || route.manifest_stop_count), 0);
    const totalPackages = routeSummaries.reduce((sum, route) => sum + safeNumber(route.total_packages || route.manifest_package_count), 0);
    const unmappedStops = routeSummaries.reduce((sum, route) => sum + safeNumber(route.missing_stops), 0);

    return { totalStops, totalPackages, unmappedStops };
  }, [routeSummaries]);
  const allRoutesHaveVehicles = hasRoutesToday && routeSummaries.every((route) => Boolean(route.vehicle_id));
  const dispatchReady = hasRoutesToday && allRoutesHaveDrivers && allRoutesHaveVehicles && blockedDispatchRoutes.length === 0;
  const morningSteps = useMemo(() => [
    {
      key: 'load',
      order: 1,
      label: 'Load routes',
      state: hasRoutesToday ? `${routeSummaries.length} loaded` : 'Waiting',
      status: hasRoutesToday ? 'done' : 'active'
    },
    {
      key: 'review',
      order: 2,
      label: 'Review routes',
      state: !hasRoutesToday
        ? 'Not started'
        : routeTotals.unmappedStops > 0 || routesWithWarnings.length > 0
          ? 'Needs review'
          : 'Ready',
      status: !hasRoutesToday ? 'waiting' : routeTotals.unmappedStops > 0 || routesWithWarnings.length > 0 ? 'active' : 'done'
    },
    {
      key: 'assign',
      order: 3,
      label: 'Assign drivers and vehicles',
      state: !hasRoutesToday
        ? 'Not started'
        : routesNeedingDrivers.length || routesNeedingVehicles.length
          ? `${routesNeedingDrivers.length + routesNeedingVehicles.length} open`
          : 'Ready',
      status: !hasRoutesToday ? 'waiting' : routesNeedingDrivers.length || routesNeedingVehicles.length ? 'active' : 'done'
    },
    {
      key: 'dispatch',
      order: 4,
      label: 'Dispatch to app',
      state: dispatchedRoutes.length ? `${dispatchedRoutes.length} dispatched` : dispatchReady ? 'Ready' : 'Blocked',
      status: dispatchedRoutes.length ? 'done' : dispatchReady ? 'active' : 'waiting'
    }
  ], [
    dispatchReady,
    dispatchedRoutes.length,
    hasRoutesToday,
    routeSummaries.length,
    routeTotals.unmappedStops,
    routesNeedingDrivers.length,
    routesNeedingVehicles.length,
    routesWithWarnings.length
  ]);
  const isSetupFlow = searchParams.get('source') === 'setup';
  const setupFocus = searchParams.get('focus') || '';
  const setupBanner = useMemo(() => {
    if (!isSetupFlow || setupFocus !== 'routes') {
      return null;
    }

    if (hasRoutesToday) {
      return {
        tone: 'done',
        title: 'First routes are in ReadyRoute',
        body: `${routeSummaries.length} route${routeSummaries.length === 1 ? '' : 's'} loaded for ${formatMorningDate(date)}. You can assign, review, and dispatch from here.`,
        actionTo: `/?date=${date}`,
        actionLabel: 'Open Dashboard'
      };
    }

    return {
      tone: 'active',
      title: 'Import the first manifest',
      body: 'Pull from FedEx or upload the manifest here. Once a route lands, onboarding can hand off into live dispatch.'
    };
  }, [date, hasRoutesToday, isSetupFlow, routeSummaries.length, setupFocus]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Morning Setup | ReadyRoute';

    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (forceSyncOpen || !hasRoutesToday) {
      setSyncPanelExpanded(true);
      return;
    }

    setSyncPanelExpanded(false);
  }, [forceSyncOpen, hasRoutesToday, date]);

  useEffect(() => {
    setLatestUpload(loadStoredManifestUpload(date));
  }, [date]);

  useEffect(() => {
    setSelectedDispatchRouteIds(dispatchableRoutes.map((route) => route.id));
  }, [dispatchableRoutes]);

  useEffect(() => {
    saveStoredManifestUpload(date, latestUpload);
  }, [date, latestUpload]);

  useEffect(() => {
    saveStoredOperationsDate(date);
  }, [date]);

  useEffect(() => {
    if (searchParams.get('date') === date) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', date);
    setSearchParams(nextParams, { replace: true });
  }, [date, searchParams, setSearchParams]);

  function jumpToRouteField(routeId, field = null) {
    const routeCard = routeCardRefs.current.get(routeId);
    if (routeCard) {
      routeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (!field) {
      return;
    }

    window.setTimeout(() => {
      const fieldRef = routeFieldRefs.current.get(`${routeId}:${field}`);
      if (fieldRef) {
        fieldRef.focus();
        if (typeof fieldRef.showPicker === 'function') {
          fieldRef.showPicker();
        }
      }
    }, 220);
  }

  function toggleDispatchRoute(routeId) {
    setSelectedDispatchRouteIds((current) =>
      current.includes(routeId) ? current.filter((value) => value !== routeId) : [...current, routeId]
    );
  }

  const pullManifestMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/routes/pull-fedex', { date });
      return response.data;
    },
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-routes', selectedCsaId, date] }),
        queryClient.invalidateQueries({ queryKey: ['fleet-map-routes', selectedCsaId, date] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-overview-routes', selectedCsaId, date] })
      ]);

      await queryClient.fetchQuery({
        queryKey: ['manager-routes', selectedCsaId, date],
        queryFn: async () => {
          const response = await api.get('/manager/routes', { params: { date } });
          return response.data;
        },
        staleTime: 0
      });

      if (data?.message) {
        setLatestUpload(null);
      }
    }
  });
  const syncRunStatus = pullManifestMutation.data?.sync_engine_status || pullManifestMutation.data?.run?.run_status || null;
  const syncRunError = pullManifestMutation.data?.run?.error_summary || null;
  const syncDidNotComplete = ['failed', 'skipped'].includes(syncRunStatus);

  const dispatchRoutesMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/manager/routes/dispatch', {
        date,
        route_ids: selectedDispatchRouteIds
      });
      return response.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-routes', selectedCsaId, date] }),
        queryClient.invalidateQueries({ queryKey: ['fleet-map-routes', selectedCsaId, date] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-overview-routes', selectedCsaId, date] })
      ]);
    }
  });

  const archiveRoutesMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/manager/routes/archive-date', { date });
      return response.data;
    },
    onSuccess: async () => {
      setLatestUpload(null);
      saveStoredManifestUpload(date, null);
      setSyncPanelExpanded(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-routes', selectedCsaId, date] }),
        queryClient.invalidateQueries({ queryKey: ['fleet-map-routes', selectedCsaId, date] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-overview-routes', selectedCsaId, date] })
      ]);
    }
  });

  const uploadManifestMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();

      if (isManifestBundleUpload) {
        if (manifestBundleFiles.combinedManifest) {
          formData.append('combined_manifest_file', manifestBundleFiles.combinedManifest);
        }
        if (manifestBundleFiles.combinedGpx) {
          formData.append('combined_gpx_file', manifestBundleFiles.combinedGpx);
        }
        if (manifestBundleFiles.deliveryManifest) {
          formData.append('delivery_manifest_file', manifestBundleFiles.deliveryManifest);
        }
        if (manifestBundleFiles.deliveryGpx) {
          formData.append('delivery_gpx_file', manifestBundleFiles.deliveryGpx);
        }
        if (manifestBundleFiles.pickupManifest) {
          formData.append('pickup_manifest_file', manifestBundleFiles.pickupManifest);
        }
      } else {
        formData.append('file', selectedFile);
        if (selectedGpxFile) {
          formData.append('gpx_file', selectedGpxFile);
        }
      }

      if (!isSpreadsheetUpload && !isManifestBundleUpload) {
        formData.append('work_area_name', workAreaName.trim());
        formData.append('driver_id', driverId);
        formData.append('vehicle_id', vehicleId);
        formData.append('date', date);
      }

      const response = await api.post('/routes/upload-manifest', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      return response.data;
    },
    onSuccess: async (data) => {
      const uploadMode = isManifestBundleUpload
        ? 'manifest_bundle'
        : selectedGpxFile && isSpreadsheetUpload
        ? 'spreadsheet_gpx'
        : isSpreadsheetUpload
          ? 'spreadsheet'
          : 'gpx';
      const resolvedDate = data.manifest_meta?.date || date;
      setSelectedFile(null);
      setSelectedGpxFile(null);
      setManifestBundleFiles({
        combinedManifest: null,
        combinedGpx: null,
        deliveryManifest: null,
        deliveryGpx: null,
        pickupManifest: null
      });
      setWorkAreaName('');
      setDriverId('');
      setVehicleId('');
      setLatestUpload({
        ...data,
        upload_mode: uploadMode
      });
      setDate(resolvedDate);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (gpxInputRef.current) {
        gpxInputRef.current.value = '';
      }

      const routeData = await queryClient.fetchQuery({
        queryKey: ['manager-routes', selectedCsaId, resolvedDate],
        queryFn: async () => {
          const response = await api.get('/manager/routes', { params: { date: resolvedDate } });
          return response.data;
        }
      });

      const warningSeed = {};
      for (const warning of data.address_warnings || []) {
        const matchedRoute = (routeData.routes || []).find((route) => route.id === data.route_id);
        const matchedStop = matchedRoute?.stops?.find((stop) => stop.sequence_order === warning.sequence);

        if (matchedStop) {
          warningSeed[matchedStop.id] = warning.address;
        }
      }

      setEditedWarnings((current) => ({ ...current, ...warningSeed }));
      setWarningsExpanded((data.address_warnings || []).length > 0);
      setSyncPanelExpanded(false);
    }
  });

  async function handleAssignmentChange(route, field, value) {
    setSavingRouteIds((current) => new Set(current).add(route.id));

    const nextDriverId = field === 'driver_id' ? value : route.driver_id || '';
    const nextVehicleId = field === 'vehicle_id' ? value : route.vehicle_id || '';

    try {
      await api.patch(`/routes/${route.id}/assign`, {
        driver_id: nextDriverId || null,
        vehicle_id: nextVehicleId || null
      });
      await queryClient.invalidateQueries({ queryKey: ['manager-routes', selectedCsaId, date] });
      await queryClient.invalidateQueries({ queryKey: ['manager-dashboard', selectedCsaId, date] });
    } finally {
      setSavingRouteIds((current) => {
        const next = new Set(current);
        next.delete(route.id);
        return next;
      });
    }
  }

  function handleArchiveRoutesForDate() {
    if (!isPastDate || !hasRoutesToday || archiveRoutesMutation.isPending) {
      return;
    }

    const confirmed = window.confirm(
      `Archive all manifests for ${formatMorningDate(date)}? This hides them from Morning Setup, Fleet Map, and Dashboard while keeping timecards, breaks, and other backend history intact.`
    );

    if (!confirmed) {
      return;
    }

    archiveRoutesMutation.mutate();
  }

  function handleFileSelection(fileInput) {
    const files = Array.from(fileInput instanceof FileList ? fileInput : Array.isArray(fileInput) ? fileInput : fileInput ? [fileInput] : []);

    if (!files.length) {
      return;
    }

    const bundleFiles = files.reduce((bundle, file) => {
      const lowerName = file.name.toLowerCase();
      const isSpreadsheet = lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx');
      const isGpx = lowerName.endsWith('.gpx');

      if (isSpreadsheet && lowerName.includes('combined')) {
        bundle.combinedManifest = file;
      } else if (isGpx && lowerName.includes('combined')) {
        bundle.combinedGpx = file;
      } else if (isSpreadsheet && lowerName.includes('delivery')) {
        bundle.deliveryManifest = file;
      } else if (isGpx && lowerName.includes('delivery')) {
        bundle.deliveryGpx = file;
      } else if (isSpreadsheet && lowerName.includes('pickup')) {
        bundle.pickupManifest = file;
      }

      return bundle;
    }, {
      combinedManifest: null,
      combinedGpx: null,
      deliveryManifest: null,
      deliveryGpx: null,
      pickupManifest: null
    });
    const recognizedBundleFiles = Object.values(bundleFiles).filter(Boolean);
    const shouldUseBundle = recognizedBundleFiles.length > 1 || Boolean(bundleFiles.deliveryManifest || bundleFiles.pickupManifest);

    if (shouldUseBundle) {
      setLatestUpload(null);
      setSelectedFile(null);
      setSelectedGpxFile(null);
      setManifestBundleFiles((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(bundleFiles).filter(([, file]) => Boolean(file)))
      }));
      if (gpxInputRef.current) {
        gpxInputRef.current.value = '';
      }
      return;
    }

    const spreadsheet = files.find((file) => {
      const lowerName = file.name.toLowerCase();
      return lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx');
    }) || null;
    const gpx = files.find((file) => file.name.toLowerCase().endsWith('.gpx')) || null;

    if (!spreadsheet && !gpx) {
      return;
    }

    setLatestUpload(null);
    setManifestBundleFiles({
      combinedManifest: null,
      combinedGpx: null,
      deliveryManifest: null,
      deliveryGpx: null,
      pickupManifest: null
    });

    if (spreadsheet) {
      setSelectedFile(spreadsheet);
    } else if (gpx && !selectedFile) {
      setSelectedFile(gpx);
    }

    if (gpx && (spreadsheet || isSpreadsheetUpload)) {
      setSelectedGpxFile(gpx);
    } else if (spreadsheet && !gpx) {
      setSelectedGpxFile(null);
      if (gpxInputRef.current) {
        gpxInputRef.current.value = '';
      }
    }
  }

  function handleGpxSelection(file) {
    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.gpx')) {
      return;
    }

    setSelectedGpxFile(file);
  }

  const uploadSummaryLines = useMemo(() => {
    if (!latestUpload) {
      return [];
    }

    const totalPickupStops = latestUpload.pickup_stop_count ?? latestUpload.total_pickup_stops ?? latestUpload.pickup_count ?? 0;
    const lines = [
      `${latestUpload.total_stops} stops loaded — ${latestUpload.delivery_count} deliveries, ${totalPickupStops} pickups`
    ];

    if (latestUpload.live_route_protected || latestUpload.driver_route_unchanged) {
      lines.unshift('Driver route left unchanged because this route has already been dispatched');
    } else if (latestUpload.post_dispatch_change_held) {
      lines.unshift('Post-dispatch update held for manager review');
    }

    if (latestUpload.merged_into_existing_route) {
      lines.unshift('Existing pending route updated in place with the new manifest upload');
    }

    if (latestUpload.combined_count > 0) {
      lines.push(`${latestUpload.combined_count} stops have both a delivery and pickup`);
    }

    if (latestUpload.time_commit_count > 0) {
      lines.push(`${latestUpload.time_commit_count} stops have time commit windows (TCs)`);
    }

    if ((latestUpload.manifest_layers || []).length > 1) {
      lines.push(
        `Merged ${latestUpload.manifest_layers.length} manifest layers: ${latestUpload.manifest_layers.map((layer) => layer.label || layer.key).join(', ')}`
      );
    }

    if (latestUpload.route_health) {
      lines.push(
        `${latestUpload.route_health.mapped_stops} mapped, ${latestUpload.route_health.missing_stops} missing pins`
      );
      lines.push(...getPinSourceSummary(latestUpload.route_health));
    }

    if ((latestUpload.address_warnings || []).length > 0) {
      lines.push(`${latestUpload.address_warnings.length} address warnings — click to review`);
    }

    return lines;
  }, [latestUpload]);
  const uploadErrorData = uploadManifestMutation.error?.response?.data || null;
  const duplicatePackageExamples = Array.isArray(uploadErrorData?.duplicate_packages)
    ? uploadErrorData.duplicate_packages
    : [];

  const uploadSummaryBadges = useMemo(() => {
    if (!latestUpload) {
      return [];
    }

    return [
      {
        key: 'mode',
        label: getUploadModeLabel(latestUpload.upload_mode),
        tone: 'neutral'
      },
      latestUpload.merged_into_existing_route
        ? { key: 'merge', label: 'Updated existing route', tone: 'success' }
        : null,
      latestUpload.live_route_protected || latestUpload.driver_route_unchanged
        ? { key: 'protected', label: 'Driver route unchanged', tone: 'warning' }
        : null,
      latestUpload.route_health?.map_status === 'mapped'
        ? { key: 'map', label: 'Map coverage ready', tone: 'success' }
        : latestUpload.route_health?.map_status === 'partially_mapped'
          ? { key: 'map', label: 'Partial map coverage', tone: 'warning' }
          : { key: 'map', label: 'Needs pin review', tone: 'urgent' },
      latestUpload.auto_matched_driver
        ? { key: 'driver', label: 'Driver auto-matched', tone: 'success' }
        : latestUpload.unmatched_driver_name
          ? { key: 'driver', label: 'Driver needs review', tone: 'warning' }
          : null,
      (latestUpload.address_warnings || []).length > 0
        ? {
            key: 'warnings',
            label: `${latestUpload.address_warnings.length} address warning${latestUpload.address_warnings.length === 1 ? '' : 's'}`,
            tone: 'warning'
          }
        : null
    ].filter(Boolean);
  }, [latestUpload]);

  return (
    <section className="page-section">
      <PageHeader
        title="Morning Setup"
        description={
          isPastDate
            ? 'You are viewing historical manifests for this date. Sync and upload are locked, but assignments and review stay available until you archive them.'
            : 'Pull or upload routes, confirm work areas, assign drivers, and get the day ready to run.'
        }
        actions={(
          <>
          <input
            className="date-field"
            onChange={(event) => setDate(event.target.value)}
            type="date"
            value={date}
          />
          {isPastDate && hasRoutesToday ? (
            <button
              className="secondary-button"
              disabled={archiveRoutesMutation.isPending}
              onClick={handleArchiveRoutesForDate}
              type="button"
            >
              {archiveRoutesMutation.isPending ? 'Archiving...' : 'Archive Routes For This Date'}
            </button>
          ) : null}
          </>
        )}
      />

      {setupBanner ? (
        <div className={`card setup-continue-banner ${setupBanner.tone}`}>
          <div>
            <div className="setup-next-eyebrow">Onboarding</div>
            <h2>{setupBanner.title}</h2>
            <p>{setupBanner.body}</p>
          </div>
          {setupBanner.actionTo ? (
            <Link className="primary-cta setup-next-action" to={setupBanner.actionTo}>
              {setupBanner.actionLabel}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="morning-setup-layout">
        <MorningStepRail steps={morningSteps} />
        <div className="morning-setup-main">
      <div className="card manifest-step-card" id="morning-load-routes">
        <div className="manifest-step-header">
          <div>
            <div className="setup-next-eyebrow">Step 1</div>
            <div className="card-title">Load routes</div>
            <div className="manifest-step-subtitle">
              {hasRoutesToday
                ? `${routeSummaries.length} route${routeSummaries.length === 1 ? '' : 's'} loaded for ${formatMorningDate(date)}.`
                : 'No routes loaded for this day yet.'}
            </div>
          </div>
          {hasRoutesToday ? (
            <button
              className="secondary-inline-button"
              onClick={() => setSyncPanelExpanded((current) => !current)}
              type="button"
            >
              {syncPanelExpanded ? 'Collapse' : 'Expand'}
            </button>
          ) : null}
        </div>

        {syncPanelExpanded ? (
          <div className="manifest-sync-panel">
            <div className="toggle-group">
              <button
                className={activeTab === 'auto' ? 'toggle-button active' : 'toggle-button'}
                onClick={() => setActiveTab('auto')}
                type="button"
              >
                FedEx Auto-Sync
              </button>
              <button
                className={activeTab === 'upload' ? 'toggle-button active' : 'toggle-button'}
                onClick={() => setActiveTab('upload')}
                type="button"
              >
                Upload Manifest
              </button>
            </div>

            {activeTab === 'auto' ? (
              <div className="manifest-sync-body">
                <div className={`fedex-connection-row morning-fcc-card ${fedexConnection.is_connected ? 'connected' : 'not-connected'}`}>
                  <div>
                    <div className="morning-fcc-title">FedEx Customer Connection</div>
                    <div className="morning-fcc-meta">
                      {fedexConnection.default_account_label || fedexConnection.terminal_label || 'No account connected'}
                    </div>
                    <div className="morning-fcc-meta">{formatSyncLine(syncStatus.last_sync_at)}</div>
                    {!fedexConnection.is_connected ? (
                      <div>
                        <a className="configure-link" href="/csa?focus=fedex">
                          Configure FCC connection
                        </a>
                      </div>
                    ) : null}
                  </div>
                  <StatusBadge tone={fedexConnection.is_connected ? 'active' : 'warning'}>
                    {fedexConnection.is_connected ? 'Connected' : 'Not connected'}
                  </StatusBadge>
                </div>

                <button
                  className="primary-cta manifest-button"
                  disabled={pullManifestMutation.isPending || isPastDate || !fedexConnection.is_connected}
                  onClick={() => pullManifestMutation.mutate()}
                  type="button"
                >
                  {pullManifestMutation.isPending ? 'Pulling routes from FedEx...' : `Sync Routes for ${format(new Date(`${date}T12:00:00`), 'MMM d')}`}
                </button>

                {!fedexConnection.is_connected ? (
                  <div className="info-banner">
                    FCC connection required. Connect FedEx Customer Connection before auto-syncing routes, or use Upload Manifest.
                  </div>
                ) : null}

                {pullManifestMutation.isPending ? <div className="progress-bar"><div className="progress-bar-fill indeterminate" /></div> : null}

                {pullManifestMutation.isError ? (
                  <div className="error-banner manifest-error-row">
                    <span>{pullManifestMutation.error?.response?.data?.error || 'Sync failed. Try again.'}</span>
                    <button className="secondary-inline-button" onClick={() => pullManifestMutation.mutate()} type="button">
                      Retry
                    </button>
                  </div>
                ) : null}

                {pullManifestMutation.data?.message ? (
                  <div className={syncDidNotComplete ? 'error-banner manifest-error-row' : 'info-banner'}>
                    <span>{syncRunError || pullManifestMutation.data.message}</span>
                    {syncDidNotComplete ? (
                      <button className="secondary-inline-button" onClick={() => pullManifestMutation.mutate()} type="button">
                        Retry
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="manifest-note">
                  Make sure ReadyRoute is set as a Vendor under Data Subscriptions in your FCC portal.
                </div>
              </div>
            ) : (
              <div className="manifest-sync-body">
                <button
                  className="upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleFileSelection(event.dataTransfer.files);
                  }}
                  type="button"
                >
                  <span className="upload-title">Drag a FedEx Combined, Delivery, or Pickup Manifest (.xls, .xlsx) and optional GPX file here</span>
                  <span className="upload-subtitle">
                    {hasManifestBundleFiles
                      ? bundleFileList.map((file) => file.name).join(' + ')
                      : hasSelectedFile
                      ? `${selectedFile.name} · ${(selectedFile.size / 1024).toFixed(1)} KB${selectedGpxFile ? ` + ${selectedGpxFile.name}` : ''}`
                      : 'Upload Combined first, then Delivery or Pickup to enrich the same route. You can select one spreadsheet and its GPX together.'}
                  </span>
                </button>

                <input
                  accept=".xls,.xlsx,.gpx"
                  className="hidden-file-input"
                  multiple
                  onChange={(event) => handleFileSelection(event.target.files)}
                  ref={fileInputRef}
                  type="file"
                />

                {isSpreadsheetUpload && !isManifestBundleUpload ? (
                  <div className="manifest-upload-grid">
                    <div className="manifest-field">
                      <span className="field-label">Optional GPX companion</span>
                      <button
                        className="secondary-inline-button"
                        onClick={() => gpxInputRef.current?.click()}
                        type="button"
                      >
                        {selectedGpxFile ? 'Replace GPX file' : 'Add GPX file'}
                      </button>
                      <div className="manifest-step-subtitle">
                        {selectedGpxFile
                          ? `${selectedGpxFile.name} · ${(selectedGpxFile.size / 1024).toFixed(1)} KB`
                          : 'Optional: attach a GPX file to supply route coordinates while keeping the richer XLS stop, package, contact, and pickup detail.'}
                      </div>
                      {selectedGpxFile ? (
                        <button
                          className="secondary-inline-button"
                          onClick={() => {
                            setSelectedGpxFile(null);
                            if (gpxInputRef.current) {
                              gpxInputRef.current.value = '';
                            }
                          }}
                          type="button"
                        >
                          Remove GPX
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <input
                  accept=".gpx"
                  className="hidden-file-input"
                  onChange={(event) => handleGpxSelection(event.target.files?.[0])}
                  ref={gpxInputRef}
                  type="file"
                />

                <div className="manifest-upload-grid">
                  {latestUpload?.manifest_meta?.work_area_name ? (
                    <div className="manifest-field">
                      <span className="field-label">Work Area Name</span>
                      <div className="manifest-readonly-field">{latestUpload.manifest_meta.work_area_name}</div>
                    </div>
                  ) : (
                    <label className="manifest-field">
                      <span className="field-label">Work Area Name (e.g. 810)</span>
                      <input
                        className="text-field"
                        onChange={(event) => setWorkAreaName(event.target.value)}
                        value={workAreaName}
                      />
                    </label>
                  )}

                  {latestUpload?.manifest_meta?.date ? (
                    <div className="manifest-field">
                      <span className="field-label">Date</span>
                      <div className="manifest-readonly-field">{latestUpload.manifest_meta.date}</div>
                    </div>
                  ) : (
                    <label className="manifest-field">
                      <span className="field-label">Assign to driver</span>
                      <select className="text-field" onChange={(event) => setDriverId(event.target.value)} value={driverId}>
                        <option value="">Select driver...</option>
                        {(driversQuery.data || []).map((driver) => (
                          <option key={driver.id} value={driver.id}>{driver.name}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="manifest-field">
                    <span className="field-label">Assign vehicle</span>
                    <select className="text-field" onChange={(event) => setVehicleId(event.target.value)} value={vehicleId}>
                      <option value="">Select vehicle...</option>
                      {(vehiclesQuery.data || []).map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.name} {vehicle.plate ? `· ${vehicle.plate}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {latestUpload ? (
                  <div className="manifest-upload-summary">
                    {latestUpload.auto_matched_driver ? (
                      <div className="success-banner">✓ Driver auto-matched: {latestUpload.matched_driver_name || latestUpload.manifest_meta?.driver_name}</div>
                    ) : latestUpload.unmatched_driver_name ? (
                      <div className="info-banner">
                        Driver '{latestUpload.unmatched_driver_name}' not found — please select manually
                      </div>
                    ) : null}

                    {!latestUpload.auto_matched_driver && latestUpload.unmatched_driver_name && latestUploadRoute ? (
                      <label className="manifest-field">
                        <span className="field-label">Assign to driver</span>
                        <select
                          className="text-field"
                          onChange={(event) => handleAssignmentChange(latestUploadRoute, 'driver_id', event.target.value)}
                          value={latestUploadRoute.driver_id || ''}
                        >
                          <option value="">Select driver...</option>
                          {(driversQuery.data || []).map((driver) => (
                            <option key={driver.id} value={driver.id}>{driver.name}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <div className="manifest-summary-panel">
                      <div className="manifest-summary-badges">
                        {uploadSummaryBadges.map((badge) => (
                          <span className={`manifest-summary-badge ${badge.tone}`} key={badge.key}>
                            {badge.label}
                          </span>
                        ))}
                      </div>
                      {uploadSummaryLines.map((line) => (
                        <div className="manifest-summary-line" key={line}>{line}</div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {needsGpxUploadFields ? (
                  <div className="info-banner">
                    Please fill in Work Area Name, Driver, and Vehicle before processing.
                  </div>
                ) : null}

                <button
                  className="primary-cta manifest-button"
                  disabled={
                    !hasSelectedFile ||
                    uploadManifestMutation.isPending ||
                    isPastDate ||
                    (!isSpreadsheetUpload && !isManifestBundleUpload && (!workAreaName.trim() || !driverId || !vehicleId))
                  }
                  onClick={() => uploadManifestMutation.mutate()}
                  type="button"
                >
                  {uploadManifestMutation.isPending ? 'Processing Route...' : 'Process Route'}
                </button>

                {uploadManifestMutation.isPending ? <div className="progress-bar"><div className="progress-bar-fill indeterminate" /></div> : null}
                {uploadManifestMutation.isError ? (
                  <div className="error-banner">
                    <div>{uploadErrorData?.error || 'Manifest upload failed. Please try again.'}</div>
                    {duplicatePackageExamples.length ? (
                      <div className="manifest-error-detail">
                        Examples: {duplicatePackageExamples.map((pkg) => {
                          const firstSequence = pkg.first_sequence ? `stop ${pkg.first_sequence}` : 'earlier stop';
                          const duplicateSequence = pkg.duplicate_sequence ? `stop ${pkg.duplicate_sequence}` : 'later stop';
                          return `${pkg.tracking_number} (${firstSequence} and ${duplicateSequence})`;
                        }).join('; ')}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {routesQuery.isError ? (
              <div className="error-banner">
                {routesQuery.error?.response?.data?.error || 'Unable to load routes for this date right now.'}
              </div>
            ) : null}
            {isPastDate ? (
              <div className="info-banner">
                Historical date mode: sync and upload are disabled for {formatMorningDate(date)}. Existing manifests can still be reviewed and assigned, or archived to clear them from operational views while preserving timecards and breaks.
              </div>
            ) : null}
            {archiveRoutesMutation.isError ? (
              <div className="error-banner">
                {archiveRoutesMutation.error?.response?.data?.error || 'Failed to archive routes for this date.'}
              </div>
            ) : null}
            {archiveRoutesMutation.data?.archived_count ? (
              <div className="success-banner">
                Archived {archiveRoutesMutation.data.archived_count} route{archiveRoutesMutation.data.archived_count === 1 ? '' : 's'} for {formatMorningDate(date)}. Labor history and breaks were kept.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {hasRoutesToday ? (
        <div className="card manifest-step-card" id="morning-review-routes">
          <div className="manifest-step-header">
            <div>
              <div className="setup-next-eyebrow">Steps 2-4</div>
              <div className="card-title">Review, assign, and dispatch</div>
              <div className="manifest-step-subtitle">Confirm work areas, clear blockers, assign drivers and vehicles, then dispatch to the driver app.</div>
            </div>
          </div>

          <div className="morning-review-summary">
            <div className="morning-review-stat">
              <strong>{formatCount(routeSummaries.length)}</strong>
              <span>Routes</span>
            </div>
            <div className="morning-review-stat">
              <strong>{formatCount(routeTotals.totalStops)}</strong>
              <span>Total stops</span>
            </div>
            <div className="morning-review-stat">
              <strong>{formatCount(routeTotals.totalPackages)}</strong>
              <span>Total packages</span>
            </div>
            <div className="morning-review-stat">
              <strong>{formatCount(routeTotals.unmappedStops)}</strong>
              <span>Unmapped stops</span>
            </div>
          </div>

          <div className="manifest-dispatch-board">
            <div className="manifest-dispatch-overview">
              <div>
                <div className="manifest-dispatch-eyebrow">Dispatch routes</div>
                <div className="manifest-dispatch-headline">
                  Dispatch sends ready routes to driver apps.
                </div>
                <div className="manifest-step-subtitle">
                  Routes stay hidden until dispatched.
                </div>
                {routeSyncSettings ? (
                  <div className="manifest-note">
                    {getDispatchWindowCopy(routeSyncSettings)} FCC polling target: every {routeSyncSettings.manifest_sync_interval_minutes} minutes.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {dispatchRoutesMutation.isError ? (
            <div className="error-banner">
              {dispatchRoutesMutation.error?.response?.data?.error || 'Failed to dispatch routes.'}
            </div>
          ) : null}
          {dispatchRoutesMutation.data?.dispatched_count ? (
            <div className="success-banner">
              Dispatched {dispatchRoutesMutation.data.dispatched_count} route{dispatchRoutesMutation.data.dispatched_count === 1 ? '' : 's'} for {formatMorningDate(date)}.
            </div>
          ) : null}

          <div className="morning-dispatch-checklist">
            <div className="morning-checklist-item done">
              <span>Routes loaded</span>
              <StatusBadge tone={hasRoutesToday ? 'active' : 'neutral'}>{hasRoutesToday ? 'Ready' : 'Waiting'}</StatusBadge>
            </div>
            <div className={`morning-checklist-item ${allRoutesHaveDrivers ? 'done' : 'warning'}`}>
              <span>Drivers assigned</span>
              <StatusBadge tone={allRoutesHaveDrivers ? 'active' : 'warning'}>
                {allRoutesHaveDrivers ? 'Ready' : `${routesNeedingDrivers.length} open`}
              </StatusBadge>
            </div>
            <div className={`morning-checklist-item ${allRoutesHaveVehicles ? 'done' : 'warning'}`}>
              <span>Vehicles assigned</span>
              <StatusBadge tone={allRoutesHaveVehicles ? 'active' : 'warning'}>
                {allRoutesHaveVehicles ? 'Ready' : `${routesNeedingVehicles.length} open`}
              </StatusBadge>
            </div>
            <div className={`morning-checklist-item ${dispatchReady ? 'done' : 'warning'}`}>
              <span>Dispatch ready</span>
              <StatusBadge tone={dispatchReady ? 'active' : 'warning'}>
                {dispatchReady ? 'Ready' : 'Not ready'}
              </StatusBadge>
            </div>
          </div>

          <div className="manifest-route-actions">
            <div className="manifest-dispatch-action-card">
              <button
                className="primary-cta manifest-button"
                disabled={isPastDate || dispatchRoutesMutation.isPending || selectedDispatchRouteIds.length === 0 || !dispatchReady}
                onClick={() => dispatchRoutesMutation.mutate()}
                type="button"
              >
                {dispatchRoutesMutation.isPending
                  ? 'Dispatching…'
                  : `Dispatch ${selectedDispatchRouteIds.length} route${selectedDispatchRouteIds.length === 1 ? '' : 's'}`}
              </button>
              <div className="manifest-note">
                {blockedDispatchRoutes.length
                  ? 'Fix blockers before dispatch.'
                  : reviewDispatchRoutes.length
                    ? 'Review flagged routes before dispatch.'
                    : 'Routes stay hidden until dispatched.'}
              </div>
            </div>
          </div>

          {(routesNeedingDrivers.length || routesNeedingVehicles.length || routesNeedingPins.length || partiallyMappedRoutes.length || routesWithWarnings.length || routesWithSyncWarnings.length || routesChangedAfterDispatch.length || routesWithSyncFailures.length) ? (
            <div className="manifest-attention-strip">
              {routesWithSyncFailures.map((route) => (
                <button
                  className="manifest-attention-chip urgent"
                  key={`${route.id}-sync-failed`}
                  onClick={() => jumpToRouteField(route.id, 'driver_id')}
                  type="button"
                >
                  {route.work_area_name}: sync failed
                </button>
              ))}
              {routesWithSyncWarnings.map((route) => (
                <button
                  className="manifest-attention-chip warning"
                  key={`${route.id}-sync-warning`}
                  onClick={() => jumpToRouteField(route.id)}
                  type="button"
                >
                  {route.work_area_name}: manifest changed
                </button>
              ))}
              {routesChangedAfterDispatch.map((route) => (
                <button
                  className="manifest-attention-chip urgent"
                  key={`${route.id}-post-dispatch`}
                  onClick={() => jumpToRouteField(route.id)}
                  type="button"
                >
                  {route.work_area_name}: changed after dispatch
                </button>
              ))}
              {routesNeedingDrivers.map((route) => (
                <button
                  className="manifest-attention-chip urgent"
                  key={`${route.id}-driver`}
                  onClick={() => jumpToRouteField(route.id, 'driver_id')}
                  type="button"
                >
                  {route.work_area_name}: assign driver
                </button>
              ))}
              {routesNeedingVehicles.map((route) => (
                <button
                  className="manifest-attention-chip warning"
                  key={`${route.id}-vehicle`}
                  onClick={() => jumpToRouteField(route.id, 'vehicle_id')}
                  type="button"
                >
                  {route.work_area_name}: assign vehicle
                </button>
              ))}
              {routesNeedingPins.map((route) => (
                <button
                  className="manifest-attention-chip urgent"
                  key={`${route.id}-pins`}
                  onClick={() => navigate(`/routes/${route.id}?date=${date}`)}
                  type="button"
                >
                  {route.work_area_name}: needs pins
                </button>
              ))}
              {partiallyMappedRoutes.map((route) => (
                <button
                  className="manifest-attention-chip warning"
                  key={`${route.id}-partial`}
                  onClick={() => navigate(`/routes/${route.id}?date=${date}`)}
                  type="button"
                >
                  {route.work_area_name}: {route.missing_stops || 0} pins missing
                </button>
              ))}
              {routesWithWarnings.map((route) => (
                <button
                  className="manifest-attention-chip warning"
                  key={`${route.id}-warning`}
                  onClick={() => navigate(`/routes/${route.id}?date=${date}`)}
                  type="button"
                >
                  {route.work_area_name}: review address warnings
                </button>
              ))}
            </div>
          ) : null}

          <div className="manifest-dispatch-lanes">
            {[
              {
                key: 'blocked',
                title: 'Blocking dispatch',
                subtitle: 'Fix these before dispatch.',
                className: 'manifest-lane-card urgent',
                routes: blockedDispatchRoutes,
                empty: 'No routes blocked.'
              },
              {
                key: 'review',
                title: 'Review before dispatch',
                subtitle: 'Review these before sending routes.',
                className: 'manifest-lane-card warning',
                routes: reviewDispatchRoutes,
                empty: 'No routes need review.'
              },
              {
                key: 'ready',
                title: 'Ready to dispatch',
                subtitle: 'Ready for driver apps.',
                className: 'manifest-lane-card success',
                routes: readyDispatchRoutes,
                empty: 'No routes ready.'
              }
            ].map((lane) => (
              <section className={lane.className} key={lane.key}>
                <div className="manifest-lane-header">
                  <div>
                    <div className="card-title">{lane.title}</div>
                    <div className="manifest-step-subtitle">{lane.subtitle}</div>
                  </div>
                  <div className="manifest-lane-count">{lane.routes.length}</div>
                </div>

                {lane.routes.length ? (
                  <div className="manifest-route-grid">
                    {lane.routes.map((route) => {
              const routeStatus = getRouteStatus(route);
              const routeSyncPill = getRouteSyncStatePill(route);
              const routeMapHealth = getRouteMapHealth(route);
              const isSaving = savingRouteIds.has(route.id);
              const upcomingStops = (route.stops || [])
                .filter((stop) => stop.address)
                .slice(0, 3);
              const attentionItems = getRouteAttentionItems(route);
              const contactStopCount = (route.stops || []).filter((stop) => getStopContactDetails(stop).hasAny).length;

              return (
                <article
                  className="manifest-route-card"
                  key={route.id}
                  ref={(node) => {
                    if (node) {
                      routeCardRefs.current.set(route.id, node);
                    } else {
                      routeCardRefs.current.delete(route.id);
                    }
                  }}
                >
                  {route.dispatch_state !== 'dispatched' && !routeBlocksDispatch(route) ? (
                    <label className="manifest-dispatch-select">
                      <input
                        checked={selectedDispatchRouteIds.includes(route.id)}
                        onChange={() => toggleDispatchRoute(route.id)}
                        type="checkbox"
                      />
                      <span>Include in dispatch</span>
                    </label>
                  ) : null}

                  <div className="manifest-route-card-header">
                    <div>
                      <div className="manifest-route-card-title">{route.work_area_name || '--'}</div>
                      <div className="manifest-route-card-meta">
                        {route.total_stops ?? 0} stops
                        {route.completed_stops ? ` · ${route.completed_stops} done` : ''}
                        {typeof route.mapped_stops === 'number' ? ` · ${route.mapped_stops} mapped` : ''}
                      </div>
                      <div className="manifest-route-readiness-line">{getRouteDispatchSummary(route)}</div>
                    </div>
                    <div className="manifest-route-pill-stack">
                      <span className={routeStatus.className}>{routeStatus.label}</span>
                      <span className={routeSyncPill.className}>{routeSyncPill.label}</span>
                      <span className={routeMapHealth.className}>{routeMapHealth.label}</span>
                    </div>
                  </div>

                  {route.map_status !== 'mapped' ? (
                    <div className="info-banner manifest-route-warning">
                      {route.map_status === 'needs_pins'
                        ? `This route has no usable pins yet. Upload a GPX companion or let ReadyRoute learn new addresses on import.`
                        : `${route.missing_stops} stops are still missing pins on this route.`}
                    </div>
                  ) : null}

                  {getPinSourceSummary(route).length > 0 ? (
                    <div className="manifest-route-pin-sources">
                      {getPinSourceSummary(route).map((line) => (
                        <span className="manifest-route-pin-chip" key={`${route.id}-${line}`}>{line}</span>
                      ))}
                    </div>
                  ) : null}

                  {attentionItems.length ? (
                    <div className="manifest-route-attention">
                      {attentionItems.map((item) => (
                        <span className={`manifest-attention-chip ${item.tone}`} key={`${route.id}-${item.key}`}>
                          {item.label}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {contactStopCount ? (
                    <div className="manifest-route-contact-summary">
                      {contactStopCount} stop{contactStopCount === 1 ? '' : 's'} with manifest contact info
                    </div>
                  ) : null}

                  {route.audit_events?.length ? (
                    <div className="manifest-route-audit">
                      <div className="manifest-address-heading">Recent route history</div>
                      {route.audit_events.slice(0, 3).map((event) => (
                        <div className="manifest-route-audit-row" key={event.id}>
                          <span className={`manifest-status-pill ${event.event_status === 'urgent' ? 'needs-pins' : event.event_status === 'warning' ? 'partial' : 'mapped'}`}>
                            {event.event_status === 'urgent' ? 'Urgent' : event.event_status === 'warning' ? 'Warning' : 'Logged'}
                          </span>
                          <div className="manifest-route-audit-copy">
                            <div className="manifest-route-audit-summary">{event.summary}</div>
                            <div className="manifest-route-audit-time">{formatAuditEventTime(event.created_at)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="manifest-route-card-grid">
                    <label className="manifest-field">
                      <span className="field-label">Driver</span>
                      <select
                        className={`text-field compact manifest-inline-select${!route.driver_id ? ' unassigned' : ''}`}
                        disabled={isSaving || (!canModifyExistingRoutes && isPastDate)}
                        onChange={(event) => handleAssignmentChange(route, 'driver_id', event.target.value)}
                        ref={(node) => {
                          if (node) {
                            routeFieldRefs.current.set(`${route.id}:driver_id`, node);
                          } else {
                            routeFieldRefs.current.delete(`${route.id}:driver_id`);
                          }
                        }}
                        value={route.driver_id || ''}
                      >
                        <option value="">Select driver...</option>
                        {(driversQuery.data || []).map((driver) => (
                          <option key={driver.id} value={driver.id}>{driver.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="manifest-field">
                      <span className="field-label">Vehicle</span>
                      <select
                        className="text-field compact manifest-inline-select"
                        disabled={isSaving || (!canModifyExistingRoutes && isPastDate)}
                        onChange={(event) => handleAssignmentChange(route, 'vehicle_id', event.target.value)}
                        ref={(node) => {
                          if (node) {
                            routeFieldRefs.current.set(`${route.id}:vehicle_id`, node);
                          } else {
                            routeFieldRefs.current.delete(`${route.id}:vehicle_id`);
                          }
                        }}
                        value={route.vehicle_id || ''}
                      >
                        <option value="">Select vehicle...</option>
                        {(vehiclesQuery.data || []).map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.name} {vehicle.plate ? `· ${vehicle.plate}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="manifest-route-card-addresses">
                    <div className="manifest-address-heading">First stops</div>
                    {upcomingStops.length ? (
                      upcomingStops.map((stop) => {
                        const contact = getStopContactDetails(stop);
                        const contactParts = [
                          contact.contactName,
                          contact.businessName,
                          contact.primaryPhone || contact.alternatePhone,
                          contact.email
                        ].filter(Boolean);

                        return (
                          <div className="manifest-address-row" key={stop.id}>
                            <span className="manifest-address-seq">ST#{stop.sequence_order}</span>
                            <span className="manifest-address-text">
                              <span>{stop.address}</span>
                              {contact.hasAny ? (
                                <span className="manifest-address-contact">
                                  {contactParts.length ? `Contact: ${contactParts.join(' · ')}` : 'Contact info detected'}
                                  {contact.instructions ? ` · Instructions: ${contact.instructions}` : ''}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="manifest-address-empty">No mapped stops available yet.</div>
                    )}
                  </div>

                  <div className="manifest-route-actions">
                    <button
                      aria-label="Preview route"
                      className="secondary-inline-button"
                      onClick={() => navigate(`/routes/${route.id}?date=${date}`)}
                      type="button"
                    >
                      Open Route
                    </button>
                  </div>
                </article>
              );
                    })}
                  </div>
                ) : (
                  <div className="manifest-lane-empty">
                    {lane.empty}
                  </div>
                )}
              </section>
            ))}
          </div>

          <div className="manifest-map-shell">
            <div className="manifest-map-header">
              <div>
                <div className="card-title">Route Map</div>
                <div className="manifest-step-subtitle">
                  Routes plotted together so you can spot work-area spread before drivers head out.
                </div>
              </div>
              <div className="manifest-route-key">
                {routeSummaries.map((route) => (
                  <div className="manifest-route-key-item" key={route.id}>
                    <span
                      className="manifest-route-key-dot"
                      style={{ background: routeColorMap.get(route.work_area_name) || '#ff6200' }}
                    />
                    <span>{route.work_area_name}</span>
                  </div>
                ))}
              </div>
            </div>

            <MapView center={manifestCenter} markers={manifestMarkers} />
          </div>

          <div className="manifest-route-table">
            <div className="manifest-route-header">
              <span>Work Area</span>
              <span>Stops</span>
              <span>Driver</span>
              <span>Vehicle</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            <div className="manifest-route-body">
              {routeSummaries.map((route) => {
                const routeStatus = getRouteStatus(route);
                const isSaving = savingRouteIds.has(route.id);

                return (
                  <div className="manifest-route-row" key={route.id}>
                    <span className="manifest-route-work-area">{route.work_area_name || '--'}</span>
                    <span>{route.total_stops ?? 0}</span>
                    <span>
                      <select
                        className={`text-field compact manifest-inline-select${!route.driver_id ? ' unassigned' : ''}`}
                        disabled={isSaving || (!canModifyExistingRoutes && isPastDate)}
                        onChange={(event) => handleAssignmentChange(route, 'driver_id', event.target.value)}
                        value={route.driver_id || ''}
                      >
                        <option value="">Select driver...</option>
                        {(driversQuery.data || []).map((driver) => (
                          <option key={driver.id} value={driver.id}>{driver.name}</option>
                        ))}
                      </select>
                    </span>
                    <span>
                      <select
                        className="text-field compact manifest-inline-select"
                        disabled={isSaving || (!canModifyExistingRoutes && isPastDate)}
                        onChange={(event) => handleAssignmentChange(route, 'vehicle_id', event.target.value)}
                        value={route.vehicle_id || ''}
                      >
                        <option value="">Select vehicle...</option>
                        {(vehiclesQuery.data || []).map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.name} {vehicle.plate ? `· ${vehicle.plate}` : ''}
                          </option>
                        ))}
                      </select>
                    </span>
                    <span>
                      <span className={routeStatus.className}>{routeStatus.label}</span>
                    </span>
                    <span className="manifest-route-actions">
                      <button
                        aria-label="Preview route"
                        className="icon-button"
                        onClick={() => navigate(`/routes/${route.id}?date=${date}`)}
                        type="button"
                      >
                        Open
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="card manifest-step-card morning-empty-routes" id="morning-review-routes">
          <div className="setup-next-eyebrow">Step 2</div>
          <div className="card-title">Review routes</div>
          <div className="manifest-step-subtitle">Routes, stop counts, package totals, and mapping coverage will appear here after routes are loaded.</div>
        </div>
      )}

      {warningRows.length ? (
        <div className="card manifest-step-card">
          <button
            className="warning-panel-toggle"
            onClick={() => setWarningsExpanded((current) => !current)}
            type="button"
          >
            {warningRows.length} address warnings — tap to review
          </button>

          {warningsExpanded ? (
            <div className="warning-list">
              {warningRows.map((warning) => (
                <div className="warning-row" key={warning.key}>
                  <div>
                    <div className="warning-address">
                      {warning.work_area_name || '--'} · Stop {warning.sequence_order}: {warning.address}
                    </div>
                    <div className="warning-message">{warning.warning}</div>
                  </div>
                  <div className="warning-editor">
                    {editingWarningIds[warning.key] ? (
                      <input
                        className="text-field compact"
                        onChange={(event) =>
                          setEditedWarnings((current) => ({ ...current, [warning.key]: event.target.value }))
                        }
                        value={editedWarnings[warning.key] ?? warning.address}
                      />
                    ) : null}
                    <button
                      className="secondary-inline-button"
                      onClick={() =>
                        setEditingWarningIds((current) => ({ ...current, [warning.key]: !current[warning.key] }))
                      }
                      type="button"
                    >
                      {editingWarningIds[warning.key] ? 'Done' : 'Fix'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
        </div>
      </div>
    </section>
  );
}
