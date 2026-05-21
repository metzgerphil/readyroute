const XLSX = require('xlsx');
const { isUsableCoordinate } = require('./coordinates');
const { normalizeRouteWorkAreaName } = require('./routeIdentity');

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value, fallback = 0) {
  const parsed = parseInt(Number(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stripLeadingZeros(value) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return '';
  }

  const stripped = normalized.replace(/^0+(?=\d)/, '');
  return stripped || '0';
}

function getSidMetadata(value) {
  const sid = String(value ?? '').trim();
  return {
    sid,
    floor_load: /\d+\s*FL$/i.test(sid)
  };
}

function titleCaseToken(token) {
  return String(token || '')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function normalizeContactDisplayName(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDriverName(value) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return '';
  }

  if (!normalized.includes(',')) {
    return titleCaseToken(normalized);
  }

  const [lastName, firstName] = normalized.split(',');
  return [titleCaseToken(firstName), titleCaseToken(lastName)].filter(Boolean).join(' ');
}

function formatManifestDate(value) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return '';
  }

  const parts = normalized.split('/');

  if (parts.length !== 3) {
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return normalized;
    }

    return parsed.toISOString().slice(0, 10);
  }

  const [month, day, year] = parts;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatTimeValue(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    return time === '00:00' ? null : time;
  }

  const normalized = String(value).trim();

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);

  if (match) {
    const hours = String(match[1]).padStart(2, '0');
    const minutes = match[2];
    const time = `${hours}:${minutes}`;
    return time === '00:00' ? null : time;
  }

  return normalized === '00:00' ? null : normalized;
}

function normalizeManifestStopType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  const compact = normalized.replace(/\s+/g, '');
  const pickupValues = new Set(['p', 'pu', 'pux', 'pickup', 'pickupstop', 'scheduledpickup']);
  const deliveryValues = new Set(['d', 'del', 'delivery', 'deliverystop', 'scheduleddelivery']);

  if (pickupValues.has(compact) || /^pickup\b/.test(normalized) || /\bpickup\b/.test(normalized)) {
    return 'pickup';
  }

  if (deliveryValues.has(compact) || /^delivery\b/.test(normalized) || /\bdelivery\b/.test(normalized)) {
    return 'delivery';
  }

  return '';
}

function getManifestRowStopType(record = {}) {
  const typeFields = ['Delivery/Pickup', 'Stop Type', 'Stop type', 'Service Type', 'Service type', 'Type'];

  for (const field of typeFields) {
    const stopType = normalizeManifestStopType(record[field]);

    if (stopType) {
      return stopType;
    }
  }

  const pickupFlagFields = ['Pickup', 'Pickup Stop', 'Scheduled Pickup'];

  for (const field of pickupFlagFields) {
    const value = String(record[field] || '').trim().toLowerCase();

    if (['yes', 'y', 'true', '1', 'pickup', 'pux'].includes(value)) {
      return 'pickup';
    }
  }

  if (
    record.DeliveryTimeBegin !== undefined ||
    record.DeliveryTimeEnd !== undefined ||
    record.Completed !== undefined ||
    record.Recipient !== undefined
  ) {
    return 'delivery';
  }

  return '';
}

function normalizeSuspiciousBusinessDeliveryWindow({ type, contact_name, address_line2, ready_time, close_time }) {
  if (type !== 'delivery') {
    return { ready_time, close_time };
  }

  if (!detectBusinessContact(contact_name, address_line2, type)) {
    return { ready_time, close_time };
  }

  // FedEx business-delivery rows in some uploaded manifests have been arriving
  // with a repeated 02:00-04:00 window for afternoon commercial commits.
  // Keep the correction narrowly scoped to the exact bad pattern we observed.
  if (ready_time === '02:00' && close_time === '04:00') {
    return {
      ready_time: '14:00',
      close_time: '16:00'
    };
  }

  return { ready_time, close_time };
}

function buildAddress(addressLine1, addressLine2, city, state, postalCode) {
  const parts = [];
  const streetLine = [String(addressLine1 || '').trim(), String(addressLine2 || '').trim()].filter(Boolean).join(', ');

  if (streetLine) {
    parts.push(streetLine);
  }

  const cityStatePostal = [String(city || '').trim(), String(state || '').trim()].filter(Boolean).join(', ');
  const postal = String(postalCode || '').trim();

  if (cityStatePostal || postal) {
    parts.push([cityStatePostal, postal].filter(Boolean).join(' '));
  }

  return parts.join(', ').trim();
}

function normalizeAddressFragment(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bPLACE\b/g, 'PL')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bPARKWAY\b/g, 'PKWY')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSecondaryAddressLine(addressLine1, addressLine2) {
  const normalizedLine2 = String(addressLine2 || '').trim();

  if (!normalizedLine2) {
    return '';
  }

  const line1Fragment = normalizeAddressFragment(addressLine1);
  const line2Fragment = normalizeAddressFragment(normalizedLine2);

  if (!line2Fragment) {
    return '';
  }

  if (line1Fragment === line2Fragment || line1Fragment.includes(line2Fragment)) {
    return '';
  }

  return normalizedLine2;
}

const BUSINESS_KEYWORDS = [
  'INC',
  'LLC',
  'CORP',
  'CO.',
  'COMPANY',
  'LTD',
  'GROUP',
  'SYSTEMS',
  'SOLUTIONS',
  'TECHNOLOGIES',
  'SERVICES',
  'RECEIVING',
  'PRODUCTS',
  'ENTERPRISES',
  'MEDICAL',
  'HEALTH',
  'REHABILITATION',
  'SURGICAL',
  'CENTER',
  'CLINIC',
  'PHARMACY',
  'BREWING',
  'GUITARS',
  'ENGINEERING',
  'MANUFACTURING',
  'SUPPLY',
  'INDUSTRIES',
  'INTERNATIONAL',
  'ASSOCIATES',
  'PARTNERS',
  'FOUNDATION',
  'OFFICE',
  'STORE',
  'TRANSFER',
  'RETURNS',
  'LOGISTICS',
  'WAREHOUSE',
  'STUDIO',
  'MARKET',
  'FEDEX',
  'UPS',
  'USPS',
  'STAPLES',
  'GNC',
  'VANS',
  'SPORT',
  'DONUTS',
  'BAR',
  'GRILL',
  'BUY',
  'CARE',
  'HOSPICE',
  'PETCO',
  'BEST',
  'CHILIS',
  'DENTAL',
  'ORTHO',
  'ORTHODONTICS',
  'PEDIATRICS',
  'URGENT',
  'AUTO',
  'MOTORS',
  'TIRE',
  'SALON',
  'SPA',
  'NAILS',
  'CHURCH',
  'SCHOOL',
  'ACADEMY',
  'BANK',
  'CREDIT',
  'UNION',
  'INSURANCE',
  'REALTY',
  'LEASING',
  'APARTMENTS',
  'CLUBHOUSE'
];

const RESIDENTIAL_UNIT_KEYWORDS = [
  'APT',
  'APARTMENT',
  'UNIT',
  'LOT',
  'SPACE',
  'TRLR',
  'TRAILER'
];

function looksLikeTypicalPersonName(value) {
  const normalized = normalizeContactDisplayName(value)
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return false;
  }

  const commaFormatMatch = normalized.match(/^([A-Za-z]+(?:[-'][A-Za-z]+)?(?:\s+[A-Za-z]+(?:[-'][A-Za-z]+)?)*)\s*,\s*([A-Za-z]+(?:[-'][A-Za-z]+)?(?:\s+[A-Za-z]+(?:[-'][A-Za-z]+)?)*)$/);
  if (commaFormatMatch) {
    return true;
  }

  const candidate = titleCaseToken(
    normalized
      .replace(/\b(AND|OR|&)\b/gi, ' ')
      .replace(/\s+/g, ' ')
  );

  const parts = candidate
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2 || parts.length > 5) {
    return false;
  }

  const validTokenCount = parts.filter((part) => /^(?:[A-Z][a-z]+|[A-Z]\.|[A-Z][a-z]+[-'][A-Z][a-z]+)$/.test(part)).length;
  return validTokenCount >= Math.max(2, parts.length - 1);
}

function detectSecondaryAddressType(addressLine2 = '') {
  const normalized = String(addressLine2 || '').trim();

  if (!normalized) {
    return null;
  }

  if (/\b(STE|SUITE|OFFICE)\b/i.test(normalized)) {
    return 'suite';
  }

  if (/\b(RECEIVING|MAILROOM|LEASING|CLUBHOUSE|LOBBY|FRONT DESK|DOCK)\b/i.test(normalized)) {
    return 'business_access';
  }

  if (/\b(BLDG|BUILDING)\b/i.test(normalized)) {
    return 'building';
  }

  if (/\b(FL|FLOOR)\b/i.test(normalized)) {
    return 'floor';
  }

  if (/\b(APT|APARTMENT|UNIT|LOT|SPACE|TRLR|TRAILER|RM|ROOM)\b/i.test(normalized) || /(^|\s)#\s*[A-Z0-9-]+\b/i.test(normalized)) {
    return 'unit';
  }

  return 'other';
}

function extractUnitLikeValue(addressLine2 = '') {
  const normalized = String(addressLine2 || '').trim();

  if (!normalized) {
    return null;
  }

  const unitMatch = normalized.match(/(?:\b(?:apt|apartment|unit|lot|space|trlr|trailer|rm|room)\b|#)\s*([a-z0-9-]+)\b/i);
  if (unitMatch) {
    return unitMatch[1].toUpperCase();
  }

  const suiteMatch = normalized.match(/\b(?:ste|suite|office)\b\s*([a-z0-9-]+)\b/i);
  if (suiteMatch) {
    return suiteMatch[1].toUpperCase();
  }

  const floorMatch = normalized.match(/\b(?:fl|floor|level)\b\s*([a-z0-9-]+)\b/i);
  if (floorMatch) {
    return floorMatch[1].toUpperCase();
  }

  return null;
}

function extractBuildingLabel(addressLine2 = '') {
  const normalized = String(addressLine2 || '').trim();

  if (!normalized) {
    return null;
  }

  const buildingMatch = normalized.match(/\b(?:bldg|building)\b\s*([a-z0-9-]+)\b/i);
  if (buildingMatch) {
    return `Building ${buildingMatch[1].toUpperCase()}`;
  }

  const towerMatch = normalized.match(/\b(?:tower|warehouse|phase)\b\s*([a-z0-9-]+)\b/i);
  if (towerMatch) {
    return titleCaseToken(`${towerMatch[0]}`);
  }

  return null;
}

function extractFloorLabel(addressLine2 = '') {
  const normalized = String(addressLine2 || '').trim();

  if (!normalized) {
    return null;
  }

  const ordinalMatch = normalized.match(/\b(\d+)(?:ST|ND|RD|TH)\s+FL\b/i);
  if (ordinalMatch) {
    return `Floor ${ordinalMatch[1]}`;
  }

  const floorMatch = normalized.match(/\b(?:fl|floor|level)\b\s*([a-z0-9-]+)\b/i);
  if (floorMatch) {
    return `Floor ${String(floorMatch[1]).toUpperCase()}`;
  }

  return null;
}

function detectBusinessContact(contactName, addressLine2 = '', stopType = '') {
  const normalized = normalizeContactDisplayName(contactName);
  const upper = normalized.toUpperCase();
  const normalizedAddressLine2 = String(addressLine2 || '').toUpperCase().trim();
  const normalizedStopType = String(stopType || '').toLowerCase().trim();

  const residentialUnitHint = /\b(APT|APARTMENT|UNIT|TRLR|TRAILER|LOT|SPACE|RM|ROOM)\b/.test(normalizedAddressLine2);
  const commercialSuiteHint = /\b(STE|SUITE|OFFICE)\b/.test(normalizedAddressLine2);
  const commercialAccessHint = /\b(RECEIVING|MAILROOM|LEASING|CLUBHOUSE|LOBBY|FRONT DESK|DOCK)\b/.test(normalizedAddressLine2);

  if (normalizedStopType === 'pickup') {
    return true;
  }

  if (commercialSuiteHint || commercialAccessHint) {
    return true;
  }

  if (BUSINESS_KEYWORDS.some((keyword) => upper.includes(keyword))) {
    return true;
  }

  if (
    /\b\d{2,}\b/.test(upper) &&
    /\b(BEST|BUY|CARE|CLINIC|GRILL|BAR|HOSPICE|PETCO|VETCO|CHILI'?S|AUTO|MOTORS|TIRE|PHARMACY|HOSPITAL)\b/.test(upper)
  ) {
    return true;
  }

  if (/\b#\s*\d{2,}\b/.test(upper) && !looksLikeTypicalPersonName(normalized)) {
    return true;
  }

  if (!normalized) {
    return false;
  }

  if (looksLikeTypicalPersonName(normalized)) {
    return false;
  }

  if (residentialUnitHint) {
    return false;
  }

  const tokens = upper
    .replace(/[^A-Z0-9/&'-]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

  const alphaTokens = tokens.filter((token) => /^[A-Z][A-Z'-]*$/.test(token));
  const mostlyNameLike =
    alphaTokens.length >= 2 &&
    alphaTokens.length <= 5 &&
    alphaTokens.every((token) => token.length > 1 || token === '&') &&
    !upper.includes(' C/O ') &&
    !upper.includes('/');

  if (mostlyNameLike) {
    return false;
  }

  return true;
}

function detectApartmentUnitStop(stopLike = {}) {
  const secondaryType = detectSecondaryAddressType(stopLike.address_line2);
  const upperAddressText = [
    String(stopLike.address_line1 || '').trim(),
    String(stopLike.address_line2 || '').trim(),
    String(stopLike.address || '').trim()
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  const hasResidentialContext = /\b(APARTMENTS?|CONDO|CONDOMINIUM|VILLA|VILLAS|TOWNHOME|TOWNHOMES|COURT|LANE|GLN|GLEN)\b/i.test(upperAddressText);

  if (!upperAddressText || stopLike.is_business) {
    return false;
  }

  if (secondaryType === 'suite' || secondaryType === 'business_access') {
    return false;
  }

  if (/\b(?:APT|APARTMENT|TRLR|TRAILER|LOT|SPACE)\b/i.test(upperAddressText)) {
    return true;
  }

  if (/\bUNIT\b/i.test(upperAddressText)) {
    return true;
  }

  if (/(^|\s)#\s*[A-Z0-9-]+\b/i.test(upperAddressText)) {
    return hasResidentialContext;
  }

  return RESIDENTIAL_UNIT_KEYWORDS.some((keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(upperAddressText));
}

function inferLocationType(stopLike = {}) {
  const combined = [
    stopLike.contact_name,
    stopLike.address_line2,
    stopLike.address,
    stopLike.notes,
    stopLike.note_text
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  const addressLine2 = String(stopLike.address_line2 || '').toUpperCase().trim();
  const secondaryType = detectSecondaryAddressType(stopLike.address_line2);
  const isBusiness = Boolean(stopLike.is_business);
  const isApartment = detectApartmentUnitStop(stopLike);
  const hasResidentialComplexSignal = /\b(APARTMENTS?|CONDO|CONDOMINIUM|VILLA|VILLAS|TOWNHOME|TOWNHOMES)\b/.test(combined);
  const hasResidentialUnitSignal =
    /\b(APT|APARTMENT|UNIT|LOT|SPACE|TRLR|TRAILER)\b/.test(addressLine2) ||
    (/(^|\s)#\s*[A-Z0-9-]+\b/.test(addressLine2) && hasResidentialComplexSignal);

  if (/\b(DOCK|WAREHOUSE|INDUSTRIAL|BAY)\b/.test(combined)) {
    return 'industrial';
  }

  if (hasResidentialComplexSignal && hasResidentialUnitSignal) {
    return 'apartment';
  }

  if (isApartment) {
    return 'apartment';
  }

  if (isBusiness && (secondaryType === 'suite' || /\b(OFFICE|RECEPTION|FRONT DESK|CLINIC|MEDICAL|DENTAL|HOSPICE|FLOOR|LEVEL)\b/.test(combined))) {
    return 'office';
  }

  if (isBusiness) {
    return 'business';
  }

  return 'house';
}

function readSheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

function getHeaderSheet(workbook) {
  return workbook.Sheets.Header || workbook.Sheets[workbook.SheetNames[0]];
}

function getStopDetailsSheet(workbook) {
  return workbook.Sheets['Stop Details'] || workbook.Sheets[workbook.SheetNames[1]];
}

function getPackageDetailsSheet(workbook) {
  return workbook.Sheets['Package Details'] || null;
}

function getHeaderLookup(rows) {
  return rows.reduce((lookup, row) => {
    if (!Array.isArray(row) || row.length < 2) {
      return lookup;
    }

    const key = String(row[0] || '').trim();
    if (!key) {
      return lookup;
    }

    lookup[key] = String(row[1] || '').trim();
    return lookup;
  }, {});
}

function isPickupManifestWorkbook(headerLookup = {}, stopHeaders = []) {
  const page = String(headerLookup.Page || '').trim();
  if (/pickup manifest/i.test(page)) {
    return true;
  }

  const normalizedHeaders = new Set((stopHeaders || []).map((header) => normalizeHeaderKey(header)));
  return (
    normalizedHeaders.has('puid') &&
    normalizedHeaders.has('shipper name') &&
    normalizedHeaders.has('pkgs picked up')
  );
}

function buildStopPackageKey({ stopNumber, sid, addressLine1 }) {
  return [
    String(stopNumber ?? '').trim(),
    String(sid ?? '').trim(),
    String(addressLine1 || '').trim().toUpperCase()
  ].join('|');
}

function isAdultSignatureService(value) {
  const normalized = String(value || '').toUpperCase();
  return /\bA(?:DULT)?SIGN\b/.test(normalized) || normalized.includes('ADULT');
}

function isSignatureService(value) {
  const normalized = String(value || '').toUpperCase();
  return isAdultSignatureService(normalized) || normalized.includes('SIGN');
}

function buildPackageDetailsByStop(packageDetailsSheet) {
  if (!packageDetailsSheet) {
    return new Map();
  }

  const packageRows = readSheetRows(packageDetailsSheet);
  if (packageRows.length < 2) {
    return new Map();
  }

  const [packageHeaders, ...dataRows] = packageRows;
  const packagesByStop = new Map();

  for (const row of dataRows) {
    if (!Array.isArray(row) || row.every((cell) => String(cell || '').trim() === '')) {
      continue;
    }

    const record = getStopRowObject(packageHeaders, row);
    const stopNumber = parseInteger(record['ST#'], null);
    const sidMetadata = getSidMetadata(record.SID);
    const sid = sidMetadata.sid;
    const addressLine1 = String(record['Address Line 1'] || '').trim();
    const trackingNumber = String(record['Track ID'] || record['Tracking Number'] || record.Tracking || '').trim();

    if (!trackingNumber) {
      continue;
    }

    const serviceCode = normalizeOptionalText(record['Prem Svc'] || record['Service Code'] || record.Service);
    const key = buildStopPackageKey({ stopNumber, sid, addressLine1 });
    const existing = packagesByStop.get(key) || [];

    existing.push({
      tracking_number: trackingNumber,
      service_code: serviceCode,
      requires_signature: isSignatureService(serviceCode),
      requires_adult_signature: isAdultSignatureService(serviceCode),
      hazmat: false,
      ...(sidMetadata.floor_load ? { floor_load: true } : {})
    });
    packagesByStop.set(key, existing);
  }

  return packagesByStop;
}

function getStopRowObject(headerRow, row) {
  return headerRow.reduce((record, header, index) => {
    record[String(header || '').trim()] = row[index];
    return record;
  }, {});
}

function normalizeHeaderKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[#]/g, ' number ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONTACT_FIELD_ALIASES = new Map([
  ['contact name', 'contact_name'],
  ['contact', 'contact_name'],
  ['recipient', 'contact_name'],
  ['recipient name', 'contact_name'],
  ['customer', 'contact_name'],
  ['customer name', 'contact_name'],
  ['business name', 'business_name'],
  ['company', 'company_name'],
  ['company name', 'company_name'],
  ['phone', 'primary_phone'],
  ['phone number', 'primary_phone'],
  ['customer phone', 'primary_phone'],
  ['contact phone', 'primary_phone'],
  ['primary phone', 'primary_phone'],
  ['telephone', 'primary_phone'],
  ['tel', 'primary_phone'],
  ['alt phone', 'alternate_phone'],
  ['alternate phone', 'alternate_phone'],
  ['secondary phone', 'alternate_phone'],
  ['email', 'email'],
  ['email address', 'email'],
  ['instructions', 'customer_instructions'],
  ['stop instructions', 'delivery_instructions'],
  ['customer instructions', 'customer_instructions'],
  ['delivery instructions', 'delivery_instructions'],
  ['driver instructions', 'delivery_instructions'],
  ['notes', 'customer_instructions'],
  ['consignee', 'consignee'],
  ['shipper', 'shipper'],
  ['sender', 'shipper']
]);

const CONTACT_LIKE_HEADER_PATTERN = /\b(contact|recipient|customer|consignee|business|company|phone|telephone|tel|email|instruction|note|shipper|sender)\b/i;
const CONTACT_FIELDS = [
  'contact_name',
  'business_name',
  'company_name',
  'primary_phone',
  'alternate_phone',
  'email',
  'customer_instructions',
  'delivery_instructions',
  'consignee',
  'shipper'
];

function normalizeOptionalText(value) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function normalizePhoneDisplay(value) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  return normalized;
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeOptionalText(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function assignContactField(contactData, field, value) {
  const normalized = field === 'primary_phone' || field === 'alternate_phone'
    ? normalizePhoneDisplay(value)
    : normalizeOptionalText(value);

  if (!normalized || contactData[field]) {
    return;
  }

  contactData[field] = normalized;
}

function extractManifestContactFields(record = {}, headerRow = []) {
  const contactData = {};
  const rawContactMetadata = {};

  for (const header of headerRow || []) {
    const originalHeader = String(header || '').trim();
    if (!originalHeader) {
      continue;
    }

    const value = normalizeOptionalText(record[originalHeader]);
    if (!value) {
      continue;
    }

    const normalizedHeader = normalizeHeaderKey(originalHeader);
    const mappedField = CONTACT_FIELD_ALIASES.get(normalizedHeader);

    if (mappedField) {
      assignContactField(contactData, mappedField, value);
      continue;
    }

    if (CONTACT_LIKE_HEADER_PATTERN.test(originalHeader)) {
      rawContactMetadata[originalHeader] = value;
    }
  }

  if (!contactData.contact_name) {
    contactData.contact_name = pickFirstNonEmpty(contactData.consignee);
  }

  if (Object.keys(rawContactMetadata).length) {
    contactData.raw_contact_metadata = rawContactMetadata;
  }

  if (CONTACT_FIELDS.some((field) => contactData[field]) || contactData.raw_contact_metadata) {
    contactData.contact_source = 'manifest';
  }

  return contactData;
}

function mergeRawContactMetadata(...metadataEntries) {
  const merged = {};

  for (const metadata of metadataEntries) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      continue;
    }

    for (const [key, value] of Object.entries(metadata)) {
      const normalized = normalizeOptionalText(value);
      if (key && normalized && !merged[key]) {
        merged[key] = normalized;
      }
    }
  }

  return Object.keys(merged).length ? merged : null;
}

function mergeStopContactFields(primaryRow = {}, fallbackRow = {}) {
  const merged = {};

  for (const field of CONTACT_FIELDS) {
    merged[field] = pickFirstNonEmpty(primaryRow?.[field], fallbackRow?.[field]);
  }

  const rawContactMetadata = mergeRawContactMetadata(primaryRow?.raw_contact_metadata, fallbackRow?.raw_contact_metadata);
  if (rawContactMetadata) {
    merged.raw_contact_metadata = rawContactMetadata;
  }

  merged.contact_source = pickFirstNonEmpty(primaryRow?.contact_source, fallbackRow?.contact_source);

  return merged;
}

function normalizeSyntheticStopFingerprint(row) {
  return [
    row?.contact_name,
    row?.address_line1,
    row?.address_line2,
    row?.city,
    row?.state,
    row?.postal_code
  ]
    .map((value) => String(value || '').trim().toUpperCase())
    .join('|');
}

function buildParsedStop(stopNumber, deliveryRow, pickupRow, options = {}) {
  const baseRow = deliveryRow || pickupRow;
  const deliveryPackageCount = deliveryRow ? deliveryRow.package_count : 0;
  const pickupPackageCount = pickupRow ? pickupRow.package_count : 0;
  const packages = [
    ...(deliveryRow?.packages || []),
    ...(pickupRow?.packages || [])
  ];
  const hasDelivery = Boolean(deliveryRow);
  const hasPickup = Boolean(pickupRow);
  // Pickup-only and combined pickup/delivery rows are operational stops; pickup totals are a slice of total stops.
  const sequence = Number.isInteger(options.sequence) && options.sequence > 0
    ? options.sequence
    : stopNumber;
  const secondaryAddressType = detectSecondaryAddressType(baseRow.address_line2);
  const unitLabel = extractUnitLikeValue(baseRow.address_line2);
  const buildingLabel = extractBuildingLabel(baseRow.address_line2);
  const floorLabel = extractFloorLabel(baseRow.address_line2);
  const isBusiness = detectBusinessContact(
    baseRow.contact_name,
    baseRow.address_line2,
    hasDelivery && hasPickup ? 'combined' : hasDelivery ? 'delivery' : 'pickup'
  );
  const readyTime = hasDelivery ? deliveryRow.ready_time : pickupRow.ready_time;
  const closeTime = hasDelivery ? deliveryRow.close_time : pickupRow.close_time;
  const contactFields = mergeStopContactFields(baseRow, hasDelivery ? pickupRow : null);

  return {
    stop_number: Number.isInteger(stopNumber) && stopNumber > 0 ? stopNumber : sequence,
    sequence,
    uses_synthetic_sequence: Boolean(options.usesSyntheticSequence),
    type: hasDelivery && hasPickup ? 'combined' : hasDelivery ? 'delivery' : 'pickup',
    has_pickup: hasPickup,
    has_delivery: hasDelivery,
    contact_name: contactFields.contact_name,
    business_name: contactFields.business_name,
    company_name: contactFields.company_name,
    primary_phone: contactFields.primary_phone,
    alternate_phone: contactFields.alternate_phone,
    email: contactFields.email,
    customer_instructions: contactFields.customer_instructions,
    delivery_instructions: contactFields.delivery_instructions,
    consignee: contactFields.consignee,
    shipper: contactFields.shipper,
    contact_source: contactFields.contact_source,
    raw_contact_metadata: contactFields.raw_contact_metadata,
    address_line1: baseRow.address_line1,
    address_line2: baseRow.address_line2,
    city: baseRow.city,
    state: baseRow.state,
    postal_code: baseRow.postal_code,
    full_address: baseRow.full_address,
    address: baseRow.full_address,
    package_count: deliveryPackageCount + pickupPackageCount,
    delivery_package_count: deliveryPackageCount,
    pickup_package_count: pickupPackageCount,
    packages,
    sid: hasDelivery ? deliveryRow.sid : pickupRow.sid,
    floor_load: Boolean(deliveryRow?.floor_load || pickupRow?.floor_load || packages.some((pkg) => pkg.floor_load)),
    ready_time: readyTime,
    close_time: closeTime,
    pickup_ready_time: pickupRow ? pickupRow.ready_time : null,
    pickup_close_time: pickupRow ? pickupRow.close_time : null,
    has_time_commit: Boolean(readyTime || closeTime || (pickupRow ? pickupRow.ready_time || pickupRow.close_time : null)),
    is_business: isBusiness,
    is_apartment_unit: detectApartmentUnitStop({
      address_line1: baseRow.address_line1,
      address_line2: baseRow.address_line2,
      address: baseRow.full_address,
      is_business: isBusiness
    }),
    secondary_address_type: secondaryAddressType,
    unit_label: secondaryAddressType === 'unit' ? unitLabel : null,
    suite_label: secondaryAddressType === 'suite' ? unitLabel : null,
    building_label: buildingLabel,
    floor_label: floorLabel,
    location_type: inferLocationType({
      address_line1: baseRow.address_line1,
      address_line2: baseRow.address_line2,
      address: baseRow.full_address,
      contact_name: contactFields.contact_name,
      is_business: isBusiness
    }),
    lat: null,
    lng: null,
    name: contactFields.contact_name || baseRow.full_address || (hasDelivery ? deliveryRow.sid : pickupRow.sid),
    is_pickup: !hasDelivery && hasPickup
  };
}

function parsePickupXLSManifest({ manifestMeta, sheetHeaders, dataRows }) {
  const stops = [];

  for (const [rowIndex, row] of dataRows.entries()) {
    if (!Array.isArray(row) || row.every((cell) => String(cell || '').trim() === '')) {
      continue;
    }

    const record = getStopRowObject(sheetHeaders, row);
    const puid = parseInteger(record.PUID, null);
    const sequence = Number.isInteger(puid) && puid > 0 ? puid : rowIndex + 1;
    const addressLine1 = String(record['Address Line 1'] || '').trim();
    const city = String(record.City || '').trim();
    const state = String(record.State || '').trim();
    const postalCode = String(record['Postal Code'] || '').trim();

    const hasStreetLikeAddress =
      /\d/.test(addressLine1) &&
      /[a-z]/i.test(addressLine1) &&
      !/^\d{5}(?:-\d{4})?$/.test(addressLine1);

    if (!hasStreetLikeAddress || !city || !state || !postalCode) {
      continue;
    }

    const shipperName = normalizeOptionalText(record['Shipper Name']);
    const scheduledPackageCount = parseInteger(record['# Pkgs'], 0);
    const pickedUpPackageCount = parseInteger(record['Pkgs Picked Up'], 0);
    const packageCount = Math.max(scheduledPackageCount, pickedUpPackageCount, 0);
    const rawContactMetadata = {};

    for (const metadataField of ['PU List', 'Station', 'WA', 'PUID', 'Type', 'Shipper #', 'Origin Station & WA#', 'PU Closed', 'Reas Code', 'Pkgs Picked Up']) {
      const value = normalizeOptionalText(record[metadataField]);
      if (value) {
        rawContactMetadata[metadataField] = value;
      }
    }

    const addressLine2 = normalizeSecondaryAddressLine(
      addressLine1,
      String(record['Address Line 2'] || '').trim()
    );
    const fullAddress = buildAddress(addressLine1, addressLine2, city, state, postalCode);
    const readyTime = formatTimeValue(record.Ready);
    const closeTime = formatTimeValue(record.Close);
    const secondaryAddressType = detectSecondaryAddressType(addressLine2);
    const unitLabel = extractUnitLikeValue(addressLine2);
    const buildingLabel = extractBuildingLabel(addressLine2);
    const floorLabel = extractFloorLabel(addressLine2);

    stops.push({
      stop_number: sequence,
      sequence,
      type: 'pickup',
      has_pickup: true,
      has_delivery: false,
      contact_name: shipperName,
      business_name: shipperName,
      company_name: null,
      primary_phone: null,
      alternate_phone: null,
      email: null,
      customer_instructions: null,
      delivery_instructions: null,
      consignee: null,
      shipper: shipperName,
      contact_source: shipperName || Object.keys(rawContactMetadata).length ? 'manifest' : null,
      raw_contact_metadata: Object.keys(rawContactMetadata).length ? rawContactMetadata : null,
      address_line1: addressLine1,
      address_line2: addressLine2,
      city,
      state,
      postal_code: postalCode,
      full_address: fullAddress,
      address: fullAddress,
      package_count: packageCount,
      delivery_package_count: 0,
      pickup_package_count: packageCount,
      packages: [],
      sid: '0',
      ready_time: readyTime,
      close_time: closeTime,
      pickup_ready_time: readyTime,
      pickup_close_time: closeTime,
      has_time_commit: Boolean(readyTime || closeTime),
      is_business: true,
      is_apartment_unit: false,
      secondary_address_type: secondaryAddressType,
      unit_label: secondaryAddressType === 'unit' ? unitLabel : null,
      suite_label: secondaryAddressType === 'suite' ? unitLabel : null,
      building_label: buildingLabel,
      floor_label: floorLabel,
      location_type: inferLocationType({
        address_line1: addressLine1,
        address_line2: addressLine2,
        address: fullAddress,
        contact_name: shipperName,
        is_business: true,
        type: 'pickup'
      }),
      lat: null,
      lng: null,
      name: shipperName || fullAddress,
      is_pickup: true
    });
  }

  return {
    manifest_meta: manifestMeta,
    stops: stops.sort((left, right) => left.sequence - right.sequence)
  };
}

function extractGpxTagValue(content, tagNames) {
  for (const tagName of tagNames) {
    const match = content.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));

    if (match) {
      return decodeXml(String(match[1] || '').trim());
    }
  }

  return '';
}

function extractCoordinateValue(attributes, name) {
  const match = attributes.match(new RegExp(`${name}="([^"]+)"`, 'i'));
  return match ? parseNumber(match[1]) : null;
}

function extractGpxRouteName(gpxText) {
  const routeNameMatch = gpxText.match(/<rte>\s*[\s\S]*?<name>([\s\S]*?)<\/name>/i);

  if (!routeNameMatch) {
    return '';
  }

  return decodeXml(String(routeNameMatch[1] || '').trim());
}

function parseGpxWaypointName(rawName, fallbackSequence) {
  const normalized = String(rawName || '').trim();
  const fallbackAddress = normalized || `Stop ${fallbackSequence}`;
  const structured = normalized.match(
    /^Seq\s+(\d+)\s*:\s*SID\s+([^:]+)\s*:\s*(.+?)\s*:\s*(?:Ready|DeliveryTimeBegin)\s+([0-9:]+)\s*:\s*(?:Close|DeliveryTimeEnd)\s+([0-9:]+)\s*$/i
  );

  if (!structured) {
    return {
      stopNumber: fallbackSequence,
      sequence: fallbackSequence,
      sid: normalized || '',
      floor_load: false,
      addressLine1: fallbackAddress,
      fullAddress: fallbackAddress,
      readyTime: null,
      closeTime: null,
      hasTimeCommit: false,
      displayName: fallbackAddress
    };
  }

  const stopNumber = parseInteger(structured[1], fallbackSequence) || fallbackSequence;
  const sidMetadata = getSidMetadata(structured[2]);
  const sid = sidMetadata.sid;
  const addressLine1 = String(structured[3] || '').trim() || fallbackAddress;
  const readyTime = formatTimeValue(structured[4]);
  const closeTime = formatTimeValue(structured[5]);

  return {
    stopNumber,
    sequence: stopNumber,
    sid,
    floor_load: sidMetadata.floor_load,
    addressLine1,
    fullAddress: addressLine1,
    readyTime,
    closeTime,
    hasTimeCommit: Boolean(readyTime || closeTime),
    displayName: addressLine1
  };
}

async function parseGPXManifest(fileBuffer) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new Error('A valid GPX file buffer is required');
  }

  const gpxText = fileBuffer.toString('utf8');
  const routeName = extractGpxRouteName(gpxText);
  const workAreaMatch = routeName.match(/\bWA\s*0*(\d+)\b/i);
  const waypointRegex = /<(wpt|rtept|trkpt)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const stops = [];
  let match;

  while ((match = waypointRegex.exec(gpxText)) !== null) {
    const [, , attributes, waypointContent] = match;
    const latValue = extractCoordinateValue(attributes, 'lat');
    const lngValue = extractCoordinateValue(attributes, 'lon');

    if (!isUsableCoordinate(latValue, lngValue)) {
      continue;
    }

    const rawName = extractGpxTagValue(waypointContent, ['name', 'n', 'desc', 'cmt']);
    const parsedWaypoint = parseGpxWaypointName(rawName, stops.length + 1);
    stops.push({
      stop_number: parsedWaypoint.stopNumber,
      sequence: parsedWaypoint.sequence,
      type: 'delivery',
      has_pickup: false,
      has_delivery: true,
      address_line1: parsedWaypoint.addressLine1,
      address_line2: '',
      city: '',
      state: '',
      postal_code: '',
      full_address: parsedWaypoint.fullAddress,
      address: parsedWaypoint.fullAddress,
      package_count: 1,
      sid: parsedWaypoint.sid,
      floor_load: Boolean(parsedWaypoint.floor_load),
      ready_time: parsedWaypoint.readyTime,
      close_time: parsedWaypoint.closeTime,
      pickup_ready_time: null,
      pickup_close_time: null,
      has_time_commit: parsedWaypoint.hasTimeCommit,
      is_business: false,
      is_apartment_unit: false,
      secondary_address_type: null,
      unit_label: null,
      suite_label: null,
      building_label: null,
      floor_label: null,
      location_type: 'house',
      lat: latValue,
      lng: lngValue,
      name: parsedWaypoint.displayName,
      is_pickup: false
    });
  }

  return {
    manifest_meta: routeName
      ? {
          date: '',
          work_area_name: normalizeRouteWorkAreaName(workAreaMatch ? stripLeadingZeros(workAreaMatch[1]) : ''),
          driver_name: '',
          vehicle_number: '',
          sa_number: '',
          contractor_name: ''
        }
      : null,
    stops: stops.sort((left, right) => left.sequence - right.sequence)
  };
}

function parseXLSManifest(fileBuffer) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new Error('A valid spreadsheet file buffer is required');
  }

  const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: false });
  const headerSheet = getHeaderSheet(workbook);
  const stopDetailsSheet = getStopDetailsSheet(workbook);
  const packageDetailsByStop = buildPackageDetailsByStop(getPackageDetailsSheet(workbook));

  if (!headerSheet || !stopDetailsSheet) {
    throw new Error('FedEx Combined Manifest must contain Header and Stop Details sheets');
  }

  const headerRows = readSheetRows(headerSheet);
  const stopRows = readSheetRows(stopDetailsSheet);
  const headerLookup = getHeaderLookup(headerRows);

  const manifestMeta = {
    date: formatManifestDate(headerLookup.Date),
    work_area_name: normalizeRouteWorkAreaName(stripLeadingZeros(headerLookup['WA#'])),
    driver_name: formatDriverName(headerLookup.Driver),
    vehicle_number: String(headerLookup['Vehicle #'] || '').trim(),
    sa_number: String(headerLookup['SA#'] || '').trim(),
    contractor_name: String(headerLookup['IC/ISP'] || '').trim()
  };

  if (!stopRows.length) {
    return {
      manifest_meta: manifestMeta,
      stops: []
    };
  }

  const [sheetHeaders, ...dataRows] = stopRows;
  if (isPickupManifestWorkbook(headerLookup, sheetHeaders)) {
    return parsePickupXLSManifest({ manifestMeta, sheetHeaders, dataRows });
  }

  const groupedStops = new Map();
  const pendingSyntheticStopKeys = new Map();
  let nextSyntheticSequence = 1;

  for (const [rowIndex, row] of dataRows.entries()) {
    if (!Array.isArray(row) || row.every((cell) => String(cell || '').trim() === '')) {
      continue;
    }

    const record = getStopRowObject(sheetHeaders, row);
    const stopNumber = parseInteger(record['ST#'], null);
    const type = getManifestRowStopType(record);
    if (!type) {
      continue;
    }

    const addressLine1 = String(record['Address Line 1'] || '').trim();
    const city = String(record.City || '').trim();
    const state = String(record.State || '').trim();
    const postalCode = String(record['Postal Code'] || '').trim();

    // Skip malformed shifted rows where the stop payload no longer resembles
    // a deliverable address, even if ST# parses as an integer.
    const hasStreetLikeAddress =
      /\d/.test(addressLine1) &&
      /[a-z]/i.test(addressLine1) &&
      !/^\d{5}(?:-\d{4})?$/.test(addressLine1);

    if (!hasStreetLikeAddress || !city || !state || !postalCode) {
      continue;
    }

    const contactFields = extractManifestContactFields(record, sheetHeaders);

    const sidMetadata = getSidMetadata(record.SID);

    const parsedRow = {
      stop_number: stopNumber,
      type,
      contact_name: contactFields.contact_name || '',
      business_name: contactFields.business_name || null,
      company_name: contactFields.company_name || null,
      primary_phone: contactFields.primary_phone || null,
      alternate_phone: contactFields.alternate_phone || null,
      email: contactFields.email || null,
      customer_instructions: contactFields.customer_instructions || null,
      delivery_instructions: contactFields.delivery_instructions || null,
      consignee: contactFields.consignee || null,
      shipper: contactFields.shipper || null,
      contact_source: contactFields.contact_source || null,
      raw_contact_metadata: contactFields.raw_contact_metadata || null,
      address_line1: addressLine1,
      address_line2: normalizeSecondaryAddressLine(
        addressLine1,
        String(record['Address Line 2'] || '').trim()
      ),
      city,
      state,
      postal_code: postalCode,
      package_count: parseInteger(record['# Pkgs'], 0),
      sid: sidMetadata.sid,
      floor_load: sidMetadata.floor_load,
      ready_time: formatTimeValue(pickFirstNonEmpty(record.Ready, record.DeliveryTimeBegin)),
      close_time: formatTimeValue(pickFirstNonEmpty(record.Close, record.DeliveryTimeEnd)),
      completed: String(record.Completed || '').trim().toUpperCase() === 'Y'
    };

    const packageDetailsKey = buildStopPackageKey({
      stopNumber,
      sid: parsedRow.sid,
      addressLine1: parsedRow.address_line1
    });
    const packageDetails = packageDetailsByStop.get(packageDetailsKey) || [];
    if (packageDetails.length) {
      parsedRow.packages = packageDetails;
      parsedRow.package_count = packageDetails.length;
      parsedRow.floor_load = parsedRow.floor_load || packageDetails.some((pkg) => pkg.floor_load);
    }

    const normalizedTimeWindow = normalizeSuspiciousBusinessDeliveryWindow(parsedRow);
    parsedRow.ready_time = normalizedTimeWindow.ready_time;
    parsedRow.close_time = normalizedTimeWindow.close_time;

    parsedRow.full_address = buildAddress(
      parsedRow.address_line1,
      parsedRow.address_line2,
      parsedRow.city,
      parsedRow.state,
      parsedRow.postal_code
    );

    if (!parsedRow.full_address) {
      continue;
    }

    parsedRow.has_time_commit = Boolean(parsedRow.ready_time || parsedRow.close_time);
    parsedRow._row_index = rowIndex + 1;

    let groupKey = null;

    if (Number.isInteger(stopNumber) && stopNumber > 0) {
      groupKey = `stop:${stopNumber}`;
    } else {
      const syntheticFingerprint = normalizeSyntheticStopFingerprint(parsedRow);
      const pendingGroupKey = pendingSyntheticStopKeys.get(syntheticFingerprint) || null;
      const pendingGroup = pendingGroupKey ? groupedStops.get(pendingGroupKey) : null;

      if (pendingGroup && !pendingGroup.rows[type]) {
        groupKey = pendingGroupKey;
      } else {
        const syntheticSequence = nextSyntheticSequence;
        nextSyntheticSequence += 1;
        groupKey = `synthetic:${syntheticSequence}`;
      }

      pendingSyntheticStopKeys.set(syntheticFingerprint, groupKey);
    }

    const existing = groupedStops.get(groupKey) || {
      stopNumber: Number.isInteger(stopNumber) && stopNumber > 0 ? stopNumber : null,
      sequence: Number.isInteger(stopNumber) && stopNumber > 0 ? stopNumber : 100000 + (nextSyntheticSequence - 1),
      usesSyntheticSequence: !(Number.isInteger(stopNumber) && stopNumber > 0),
      sortOrder: Number.isInteger(stopNumber) && stopNumber > 0 ? stopNumber : rowIndex + 1,
      rows: {}
    };
    existing.rows[type] = parsedRow;
    groupedStops.set(groupKey, existing);
  }

  const stops = Array.from(groupedStops.values())
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((group) =>
      buildParsedStop(group.stopNumber, group.rows.delivery, group.rows.pickup, {
        sequence: group.sequence,
        usesSyntheticSequence: group.usesSyntheticSequence
      })
    );

  return {
    manifest_meta: manifestMeta,
    stops
  };
}

function detectManifestFormat(fileBuffer, filename = '') {
  const lowerName = String(filename || '').toLowerCase();

  if (lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) {
    return 'xls';
  }

  if (lowerName.endsWith('.gpx')) {
    return 'gpx';
  }

  return 'unknown';
}

async function parseManifestFile(fileBuffer, filename = '', mimeType = '') {
  const format = detectManifestFormat(fileBuffer, filename);
  const lowerMime = String(mimeType || '').toLowerCase();

  if (format === 'xls' || lowerMime.includes('spreadsheet') || lowerMime.includes('excel')) {
    return parseXLSManifest(fileBuffer);
  }

  if (format === 'gpx' || lowerMime.includes('xml')) {
    return parseGPXManifest(fileBuffer);
  }

  throw new Error('Unsupported manifest file type. Use .xls, .xlsx, or .gpx.');
}

module.exports = {
  detectBusinessContact,
  detectSecondaryAddressType,
  extractUnitLikeValue,
  extractBuildingLabel,
  extractFloorLabel,
  normalizeManifestStopType,
  inferLocationType,
  parseGPXManifest,
  parseXLSManifest,
  detectApartmentUnitStop,
  detectManifestFormat,
  parseManifestFile
};
