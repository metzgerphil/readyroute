const DELIVERY_EXCEPTION_CODES = new Set([
  '001',
  '002',
  '003',
  '004',
  '006',
  '007',
  '010',
  '011',
  '012',
  '015',
  '016',
  '017',
  '027',
  '030',
  '034',
  '079',
  '081',
  '082',
  '083',
  '095',
  '100',
  '250'
]);

const PICKUP_EXCEPTION_CODES = new Set(['P01', 'P10', 'P11', 'P14', 'P15', 'P16', 'P17', 'P21', 'P24', 'P25', 'P26']);

const FEDEX_EXCEPTION_CODES = new Set([...DELIVERY_EXCEPTION_CODES, ...PICKUP_EXCEPTION_CODES]);

function normalizeFedExStatusCode(value, options = {}) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  const prefixedPickupCode = raw.match(/\bP\s*0*(\d{1,3})\b/i);
  if (prefixedPickupCode) {
    const code = Number(prefixedPickupCode[1]);
    return code > 0 ? `P${String(code).padStart(2, '0')}` : null;
  }

  const explicitCode = raw.match(/\b(?:code|status(?:\s+code)?|exception(?:\s+code)?)\s*#?:?\s*0*(\d{1,3})\b/i);
  const loneCode = raw.match(/^\s*0*(\d{1,3})\s*$/);
  const numericCode = explicitCode || loneCode;

  if (!numericCode) {
    return null;
  }

  const code = Number(numericCode[1]);
  if (!Number.isFinite(code) || code <= 0) {
    return null;
  }

  if (options.pickup) {
    return `P${String(code).padStart(2, '0')}`;
  }

  return String(code).padStart(3, '0');
}

function isFedExExceptionCode(value, options = {}) {
  const code = normalizeFedExStatusCode(value, options);
  return Boolean(code && FEDEX_EXCEPTION_CODES.has(code));
}

function getFedExExceptionCode(value, options = {}) {
  const code = normalizeFedExStatusCode(value, options);
  return code && FEDEX_EXCEPTION_CODES.has(code) ? code : null;
}

module.exports = {
  DELIVERY_EXCEPTION_CODES,
  PICKUP_EXCEPTION_CODES,
  FEDEX_EXCEPTION_CODES,
  normalizeFedExStatusCode,
  isFedExExceptionCode,
  getFedExExceptionCode
};
