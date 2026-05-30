function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseWorkAreaCodes(line) {
  const match = normalizeText(line).match(/^WA\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return match[1]
    .split(/[\/, ]+/)
    .map((part) => part.replace(/\D/g, ''))
    .filter(Boolean);
}

function cleanAddressHint(value) {
  return normalizeText(value)
    .replace(/[-:,.]+$/g, '')
    .replace(/\b(?:1st|2nd|first|second)\s+gate$/i, '')
    .trim();
}

function cleanAccessCode(value) {
  return normalizeText(value)
    .replace(/^code[:\s]*/i, '')
    .replace(/^gate[:\s]*/i, '')
    .trim();
}

function splitGateCodeLine(line) {
  const normalized = normalizeText(line);

  if (!normalized || /^GATE CODE$/i.test(normalized) || /^\(/.test(normalized)) {
    return null;
  }

  const gateLabelMatch = normalized.match(/^(.+?)(?:[-\s]*(?:1st|2nd|first|second)?\s*gate:)\s*([#*]?\d{3,6}#?)(.*)$/i);
  if (gateLabelMatch) {
    return {
      address_hint: cleanAddressHint(gateLabelMatch[1]),
      access_code: cleanAccessCode(gateLabelMatch[2]),
      access_note: normalizeText(gateLabelMatch[3] || null) || null,
      confidence: 'medium'
    };
  }

  const explicitMatch = normalized.match(/^(.+?)(?:\s*[-:]\s*)?((?:#|\*)\d[\d#]*|key\s*key\s*\d+|key\s*\d+|clicker\b)(.*)$/i);
  if (explicitMatch) {
    const addressHint = cleanAddressHint(explicitMatch[1]);
    const accessCode = cleanAccessCode(explicitMatch[2]);
    const accessNote = normalizeText(explicitMatch[3] || null) || null;

    if (!addressHint || !accessCode) {
      return null;
    }

    return {
      address_hint: addressHint,
      access_code: accessCode,
      access_note: accessNote,
      confidence: 'high'
    };
  }

  const numericTailMatch = normalized.match(/^(.+)\s+(\d{3,6}#?\*?)(\s.*)?$/);
  if (numericTailMatch) {
    return {
      address_hint: cleanAddressHint(numericTailMatch[1]),
      access_code: cleanAccessCode(numericTailMatch[2]),
      access_note: normalizeText(numericTailMatch[3] || null) || null,
      confidence: 'medium'
    };
  }

  const compactTailMatch = normalized.match(/^(.+[A-Za-z)])(\d{3,6}#?)(\s.*)?$/);
  if (compactTailMatch && !/\d$/.test(compactTailMatch[1].trim())) {
    return {
      address_hint: cleanAddressHint(compactTailMatch[1]),
      access_code: cleanAccessCode(compactTailMatch[2]),
      access_note: normalizeText(compactTailMatch[3] || null) || null,
      confidence: 'medium'
    };
  }

  return null;
}

function parseGateCodeText(text) {
  const candidates = [];
  let currentWorkAreas = [];

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = normalizeText(rawLine);

    if (!line) {
      continue;
    }

    const workAreas = parseWorkAreaCodes(line);
    if (workAreas) {
      currentWorkAreas = workAreas;
      continue;
    }

    const parsed = splitGateCodeLine(line);
    if (!parsed) {
      continue;
    }

    candidates.push({
      ...parsed,
      work_area_codes: currentWorkAreas,
      raw_line: line,
      source: 'gate_code_doc'
    });
  }

  return candidates;
}

module.exports = {
  parseGateCodeText,
  splitGateCodeLine
};
