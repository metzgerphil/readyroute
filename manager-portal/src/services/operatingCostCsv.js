function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }

  values.push(value.trim());
  return values;
}

export function parseOperatingCostCsv(csvText) {
  const lines = String(csvText || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV must include a header and at least one cost row.');
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  if (!headers.includes('vendor') || (!headers.includes('amount') && !headers.includes('amount_cents'))) {
    throw new Error('CSV headers must include vendor and amount (or amount_cents).');
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => ({ ...row, [header]: values[index] || '' }), {});
  });
}
