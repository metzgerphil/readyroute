const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60;

const PRIVATE_STORAGE_BUCKETS = new Set([
  'driver-documents',
  'pod-photos',
  'support-attachments',
  'vehicle-inspection-photos'
]);

function getSignedUrlTtlSeconds() {
  const configured = Number(process.env.STORAGE_SIGNED_URL_TTL_SECONDS);

  if (!Number.isFinite(configured)) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }

  return Math.min(60 * 60, Math.max(60, Math.round(configured)));
}

function normalizeStoragePath(value) {
  const path = String(value || '').trim().replace(/^\/+/, '');

  if (!path || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    return null;
  }

  return path;
}

function parseStorageReference(value, fallbackBucket = null) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  if (raw.startsWith('storage://')) {
    const reference = raw.slice('storage://'.length);
    const separatorIndex = reference.indexOf('/');
    const bucket = separatorIndex > 0 ? reference.slice(0, separatorIndex) : null;
    const path = separatorIndex > 0 ? normalizeStoragePath(reference.slice(separatorIndex + 1)) : null;
    return bucket && path ? { bucket, path } : null;
  }

  try {
    const url = new URL(raw);
    const markers = [
      '/storage/v1/object/public/',
      '/storage/v1/object/sign/',
      '/storage/v1/object/authenticated/'
    ];
    const marker = markers.find((candidate) => url.pathname.includes(candidate));

    if (!marker) {
      return null;
    }

    const reference = decodeURIComponent(url.pathname.split(marker)[1] || '');
    const separatorIndex = reference.indexOf('/');
    const bucket = separatorIndex > 0 ? reference.slice(0, separatorIndex) : fallbackBucket;
    const path = separatorIndex > 0
      ? normalizeStoragePath(reference.slice(separatorIndex + 1))
      : normalizeStoragePath(reference);

    return bucket && path ? { bucket, path } : null;
  } catch (_error) {
    const path = normalizeStoragePath(raw);
    return fallbackBucket && path ? { bucket: fallbackBucket, path } : null;
  }
}

function resolveStorageReference({ bucket, path, url } = {}, fallbackBucket = null) {
  const normalizedBucket = String(bucket || fallbackBucket || '').trim();
  const normalizedPath = normalizeStoragePath(path);

  if (normalizedBucket && normalizedPath) {
    return { bucket: normalizedBucket, path: normalizedPath };
  }

  return parseStorageReference(url, normalizedBucket || fallbackBucket);
}

async function createSignedStorageUrl(supabase, reference, options = {}) {
  const resolved = resolveStorageReference(reference, options.fallbackBucket || null);

  if (!resolved || !PRIVATE_STORAGE_BUCKETS.has(resolved.bucket)) {
    return null;
  }

  const storageBucket = supabase?.storage?.from?.(resolved.bucket);
  if (!storageBucket?.createSignedUrl) {
    return null;
  }

  const { data, error } = await storageBucket.createSignedUrl(
    resolved.path,
    options.expiresIn || getSignedUrlTtlSeconds(),
    options.download ? { download: options.download } : undefined
  );

  if (error) {
    return null;
  }

  return data?.signedUrl || data?.signedURL || null;
}

async function addDriverDocumentAccessUrl(supabase, document = {}) {
  const accessUrl = await createSignedStorageUrl(supabase, {
    bucket: document.storage_bucket,
    path: document.storage_path,
    url: document.public_url
  }, {
    fallbackBucket: 'driver-documents',
    download: document.file_name || true
  });

  return {
    ...document,
    public_url: null,
    access_url: accessUrl,
    access_url_expires_in: accessUrl ? getSignedUrlTtlSeconds() : null
  };
}

async function addInspectionPhotoAccessUrls(supabase, inspection = {}) {
  const signItems = async (items = []) => Promise.all((items || []).map(async (item) => {
    const photos = await Promise.all((item?.photos || []).map(async (photo) => {
      const reference = resolveStorageReference({
        bucket: photo?.storage_bucket,
        path: photo?.storage_path,
        url: photo?.url
      }, 'vehicle-inspection-photos');

      if (!reference) {
        return photo;
      }

      const url = await createSignedStorageUrl(supabase, reference);
      return {
        ...photo,
        url,
        storage_bucket: reference.bucket,
        storage_path: reference.path
      };
    }));

    return { ...item, photos };
  }));

  const items = await signItems(inspection.items || []);
  const signedItemsByKey = new Map(items.map((item) => [item.checklist_item_key, item]));
  const mergeSignedPhotos = (itemsToMerge = []) => (itemsToMerge || []).map((item) => ({
    ...item,
    photos: signedItemsByKey.get(item.checklist_item_key)?.photos || item.photos || []
  }));

  return {
    ...inspection,
    items,
    issue_items: mergeSignedPhotos(inspection.issue_items),
    failed_items: mergeSignedPhotos(inspection.failed_items),
    inspection_summary: inspection.inspection_summary
      ? {
          ...inspection.inspection_summary,
          issue_items: mergeSignedPhotos(inspection.inspection_summary.issue_items),
          failed_items: mergeSignedPhotos(inspection.inspection_summary.failed_items)
        }
      : inspection.inspection_summary
  };
}

module.exports = {
  PRIVATE_STORAGE_BUCKETS,
  addDriverDocumentAccessUrl,
  addInspectionPhotoAccessUrls,
  createSignedStorageUrl,
  getSignedUrlTtlSeconds,
  normalizeStoragePath,
  parseStorageReference,
  resolveStorageReference
};
