function getMissingColumnName(error) {
  const message = String(error?.message || error?.details || '');
  const schemaCacheMatch = message.match(/Could not find the '([^']+)' column/i);
  if (schemaCacheMatch?.[1]) {
    return schemaCacheMatch[1];
  }

  const postgresMatch = message.match(/column "([^"]+)"(?: of relation "[^"]+")? does not exist/i);
  if (postgresMatch?.[1]) {
    return postgresMatch[1];
  }

  return null;
}

function isMissingColumnError(error) {
  if (['42703', 'PGRST204'].includes(error?.code)) {
    return true;
  }

  const message = String(error?.message || error?.details || '');
  return /column/i.test(message) && /(does not exist|schema cache|could not find)/i.test(message);
}

function isInspectionTypeConstraintError(error) {
  const combined = String(`${error?.message || ''} ${error?.details || ''}`).toLowerCase();
  return error?.code === '23514' &&
    combined.includes('vehicle_inspections_type_check');
}

function createLegacyInspectionPayload(payload = {}) {
  const issueReported = typeof payload.issue_reported === 'boolean'
    ? payload.issue_reported
    : Boolean(payload.issue_note || payload.status === 'needs_review');

  return {
    account_id: payload.account_id,
    vehicle_id: payload.vehicle_id,
    driver_id: payload.driver_id || payload.submitted_by_driver_id || null,
    route_id: payload.route_id || null,
    inspection_date: payload.inspection_date,
    inspection_type: 'daily_check',
    odometer: payload.odometer,
    issue_reported: issueReported,
    issue_note: payload.issue_note,
    status: payload.status,
    submitted_at: payload.submitted_at,
    submitted_by_type: payload.submitted_by_type,
    submitted_by_driver_id: payload.submitted_by_driver_id || null,
    submitted_by_manager_user_id: payload.submitted_by_manager_user_id || null,
    submitted_by_name: payload.submitted_by_name || null
  };
}

async function insertVehicleInspectionWithSchemaFallback(supabase, payload) {
  let currentPayload = { ...payload };
  const fallbackReasons = [];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from('vehicle_inspections')
      .insert(currentPayload)
      .select('*')
      .single();

    if (!error) {
      return { data, error: null, fallbackReasons };
    }

    if (isInspectionTypeConstraintError(error) && currentPayload.inspection_type !== 'daily_check') {
      currentPayload = createLegacyInspectionPayload(payload);
      fallbackReasons.push('legacy_inspection_type');
      continue;
    }

    if (!isMissingColumnError(error)) {
      return { data: null, error };
    }

    const missingColumn = getMissingColumnName(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(currentPayload, missingColumn)) {
      currentPayload = { ...currentPayload };
      delete currentPayload[missingColumn];
      fallbackReasons.push(`missing_column:${missingColumn}`);
      continue;
    }

    const legacyPayload = createLegacyInspectionPayload(payload);
    const changedToLegacyPayload = Object.keys(currentPayload).some((key) => legacyPayload[key] !== currentPayload[key]);
    if (!changedToLegacyPayload) {
      return { data: null, error };
    }

    currentPayload = legacyPayload;
    fallbackReasons.push('legacy_inspection_payload');
  }

  return {
    data: null,
    error: {
      code: 'INSPECTION_SCHEMA_FALLBACK_EXHAUSTED',
      message: 'Vehicle inspection insert could not be matched to the current database schema.'
    }
  };
}

module.exports = {
  insertVehicleInspectionWithSchemaFallback,
  isInspectionTypeConstraintError,
  isMissingColumnError
};
