function isTruthyFlag(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    return ['true', 't', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
  }

  return false;
}

function hasExplicitTestFlag(row) {
  return Object.prototype.hasOwnProperty.call(row, 'is_test') ||
    Object.prototype.hasOwnProperty.call(row, 'test_data');
}

function getStringFields(row, fields) {
  const fieldNames = fields?.length
    ? fields
    : ['name', 'email', 'full_name', 'work_area_name', 'source', 'notes', 'description', 'service_type'];

  return fieldNames
    .map((field) => row?.[field])
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());
}

function isProductionTestArtifact(row, fields = []) {
  if (!row || typeof row !== 'object') {
    return false;
  }

  if (isTruthyFlag(row.is_test) || isTruthyFlag(row.test_data)) {
    return true;
  }

  if (hasExplicitTestFlag(row)) {
    return false;
  }

  const values = getStringFields(row, fields);

  if (values.some((value) => /@readyroute\.test$/i.test(value))) {
    return true;
  }

  return values.some((value) => {
    const normalized = value.toLowerCase();
    return (
      /\bsmoke test\b/.test(normalized) ||
      /\bqa artifact\b/.test(normalized) ||
      /\btest driver\b/.test(normalized) ||
      /\btest truck\b/.test(normalized) ||
      /^test\b/.test(normalized) ||
      /^smoke\b/.test(normalized) ||
      /^qa\b/.test(normalized)
    );
  });
}

function filterProductionRows(rows = [], fields = []) {
  return (rows || []).filter((row) => !isProductionTestArtifact(row, fields));
}

module.exports = {
  filterProductionRows,
  isProductionTestArtifact
};
