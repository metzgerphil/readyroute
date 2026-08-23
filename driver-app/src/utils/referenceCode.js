export function formatReferenceCode(value) {
  const code = String(value || '').trim();
  if (!/^\d+$/.test(code)) return code;
  return String(Number(code)).padStart(2, '0');
}
