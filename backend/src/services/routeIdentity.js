function stripRouteStatusSuffix(value) {
  return String(value || '')
    .replace(/\s+-\s+(Available|Unavailable|Assigned|Unassigned|Selected)\s*$/i, '')
    .trim();
}

function extractRouteCode(value) {
  const match = String(value || '').match(/\b(\d{3})\b/);
  return match ? match[1] : null;
}

function formatDriverCandidate(value) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[-:]+|[-:]+$/g, '')
    .trim();

  if (!normalized || /^bridge\s+\d+/i.test(normalized)) {
    return '';
  }

  if (!normalized.includes(',')) {
    return normalized
      .toLowerCase()
      .replace(/(^|[\s'-])([a-z])/g, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
  }

  const [lastName, firstName] = normalized.split(',');
  const titleCase = (part) =>
    String(part || '')
      .trim()
      .toLowerCase()
      .replace(/(^|[\s'-])([a-z])/g, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);

  return [titleCase(firstName), titleCase(lastName)].filter(Boolean).join(' ');
}

function parseFccWorkAreaIdentity(value) {
  const cleaned = stripRouteStatusSuffix(value);
  const routeCode = extractRouteCode(cleaned);

  if (!routeCode) {
    return {
      routeCode: '',
      driverName: '',
      rawWorkAreaName: cleaned
    };
  }

  const afterRouteCode = cleaned
    .replace(new RegExp(`^.*?\\b${routeCode}\\b\\s*`, 'i'), '')
    .trim();

  return {
    routeCode,
    driverName: formatDriverCandidate(afterRouteCode),
    rawWorkAreaName: cleaned
  };
}

function normalizeRouteWorkAreaName(value) {
  return parseFccWorkAreaIdentity(value).routeCode || String(value || '').trim();
}

module.exports = {
  extractRouteCode,
  normalizeRouteWorkAreaName,
  parseFccWorkAreaIdentity,
  stripRouteStatusSuffix
};
