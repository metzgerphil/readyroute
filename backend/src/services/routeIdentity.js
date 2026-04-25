function stripRouteStatusSuffix(value) {
  return String(value || '')
    .replace(/\s+-\s+(Available|Unavailable|Assigned|Unassigned|Selected)\s*$/i, '')
    .trim();
}

function normalizeNameForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function namesLookLikeMatch(left, right) {
  const leftNormalized = normalizeNameForMatch(left);
  const rightNormalized = normalizeNameForMatch(right);

  if (!leftNormalized || !rightNormalized) {
    return false;
  }

  if (leftNormalized === rightNormalized) {
    return true;
  }

  const leftTokens = leftNormalized.split(' ').filter(Boolean);
  const rightTokens = rightNormalized.split(' ').filter(Boolean);
  const [leftFirst] = leftTokens;
  const [rightFirst] = rightTokens;
  const leftLast = leftTokens[leftTokens.length - 1];
  const rightLast = rightTokens[rightTokens.length - 1];

  return Boolean(leftFirst && rightFirst && leftLast && rightLast && leftFirst === rightFirst && leftLast === rightLast);
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
  namesLookLikeMatch,
  normalizeNameForMatch,
  normalizeRouteWorkAreaName,
  parseFccWorkAreaIdentity,
  stripRouteStatusSuffix
};
