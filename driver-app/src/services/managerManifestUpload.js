const XLS_MIME_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];
const GPX_MIME_TYPES = [
  'application/gpx+xml',
  'application/xml',
  'text/xml',
  'text/plain'
];

function getFileExtension(fileName = '') {
  const match = String(fileName).trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function getSupportedRouteFileKind(fileName = '') {
  const extension = getFileExtension(fileName);

  if (extension === 'xls' || extension === 'xlsx') {
    return 'xls';
  }

  if (extension === 'gpx') {
    return 'gpx';
  }

  return '';
}

function isSupportedRouteFile(fileName = '') {
  return Boolean(getSupportedRouteFileKind(fileName));
}

function getPickedAsset(result) {
  if (!result || result.canceled || result.cancelled) {
    return null;
  }

  if (Array.isArray(result.assets) && result.assets.length > 0) {
    return result.assets[0];
  }

  if (result.uri) {
    return result;
  }

  return null;
}

function toUploadFile(asset) {
  if (!asset?.uri || !asset?.name) {
    return null;
  }

  const extension = getFileExtension(asset.name);
  const mimeType = asset.mimeType ||
    (extension === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : extension === 'xls'
        ? 'application/vnd.ms-excel'
        : extension === 'gpx'
          ? 'application/gpx+xml'
          : 'application/octet-stream');

  return {
    name: asset.name,
    type: mimeType,
    uri: asset.uri
  };
}

function appendUploadFile(formData, fieldName, asset) {
  const file = toUploadFile(asset);
  if (!file || !isSupportedRouteFile(file.name)) {
    return false;
  }

  formData.append(fieldName, file);
  return true;
}

function buildManifestFormData({
  gpxFile,
  xlsFile,
  combinedManifestFile,
  combinedGpxFile,
  deliveryManifestFile,
  deliveryGpxFile,
  pickupManifestFile
}) {
  const bundleAssets = [
    ['combined_manifest_file', combinedManifestFile],
    ['combined_gpx_file', combinedGpxFile],
    ['delivery_manifest_file', deliveryManifestFile],
    ['delivery_gpx_file', deliveryGpxFile],
    ['pickup_manifest_file', pickupManifestFile]
  ].filter(([, asset]) => Boolean(asset));

  if (bundleAssets.length) {
    const formData = new FormData();
    let appendedCount = 0;

    for (const [fieldName, asset] of bundleAssets) {
      appendedCount += appendUploadFile(formData, fieldName, asset) ? 1 : 0;
    }

    return appendedCount > 0 ? formData : null;
  }

  const primaryAsset = xlsFile || gpxFile;
  const primaryFile = toUploadFile(primaryAsset);
  const companionGpxFile = xlsFile && gpxFile ? toUploadFile(gpxFile) : null;

  if (!primaryFile || !isSupportedRouteFile(primaryFile.name) || (companionGpxFile && !isSupportedRouteFile(companionGpxFile.name))) {
    return null;
  }

  const formData = new FormData();
  formData.append('file', primaryFile);

  if (companionGpxFile) {
    formData.append('gpx_file', companionGpxFile);
  }

  return formData;
}

export {
  GPX_MIME_TYPES,
  XLS_MIME_TYPES,
  buildManifestFormData,
  getFileExtension,
  getPickedAsset,
  getSupportedRouteFileKind,
  isSupportedRouteFile,
  toUploadFile
};
