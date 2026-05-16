const XLSX = require('xlsx');

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getCell(row, aliases) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return '';
}

function getExtension(fileName = '') {
  const match = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function parseTabularUpload(file) {
  if (!file?.buffer?.length) {
    throw new Error('Upload file is required.');
  }

  const extension = getExtension(file.originalname);
  if (!['csv', 'xls', 'xlsx'].includes(extension)) {
    throw new Error('This file type is not supported. Upload a CSV, XLS, or XLSX file.');
  }

  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  if (!sheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false
  });

  return rows.map((row) => Object.entries(row).reduce((normalized, [key, value]) => {
    normalized[normalizeHeader(key)] = value;
    return normalized;
  }, {}));
}

function parseDriverImportRows(file) {
  return parseTabularUpload(file).map((row, index) => ({
    row_number: index + 2,
    name: getCell(row, ['name', 'driver name', 'driver']),
    email: getCell(row, ['email', 'driver email']),
    fedex_driver_id: getCell(row, ['fedex driver id', 'fedex id', 'driver id', 'fedex_driver_id']),
    phone: getCell(row, ['phone', 'phone number', 'mobile']),
    pin: getCell(row, ['pin', 'driver pin'])
  }));
}

function parseVehicleImportRows(file) {
  return parseTabularUpload(file).map((row, index) => ({
    row_number: index + 2,
    name: getCell(row, ['vehicle id', 'vehicle', 'name', 'unit', 'unit number']),
    truck_type: getCell(row, ['truck type', 'vehicle type', 'type']),
    custom_truck_type: getCell(row, ['custom truck type', 'custom type']),
    make: getCell(row, ['make']),
    model: getCell(row, ['model']),
    year: getCell(row, ['year']),
    plate: getCell(row, ['plate', 'registration number', 'license plate']),
    registration_expiration: getCell(row, ['registration expiration', 'registration expiry', 'registration expires', 'registration_expiration']),
    insurance_expiration: getCell(row, ['insurance expiration', 'insurance expiry', 'insurance expires', 'insurance_expiration']),
    current_mileage: getCell(row, ['mileage', 'current mileage', 'current_mileage', 'odometer']),
    notes: getCell(row, ['notes', 'description'])
  }));
}

module.exports = {
  parseDriverImportRows,
  parseVehicleImportRows,
  parseTabularUpload
};
