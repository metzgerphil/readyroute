function normalizeContactText(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized || '';
}

function firstContactText(...values) {
  return values.map(normalizeContactText).find(Boolean) || '';
}

export function getStopContactDetails(stop) {
  const contactName = normalizeContactText(stop?.contact_name);
  const businessName = firstContactText(stop?.business_name, stop?.company_name);
  const primaryPhone = normalizeContactText(stop?.primary_phone);
  const alternatePhone = normalizeContactText(stop?.alternate_phone);
  const email = normalizeContactText(stop?.email);
  const instructions = firstContactText(stop?.customer_instructions, stop?.delivery_instructions);
  const consignee = normalizeContactText(stop?.consignee);
  const shipper = normalizeContactText(stop?.shipper);

  return {
    contactName,
    businessName,
    primaryPhone,
    alternatePhone,
    email,
    instructions,
    consignee,
    shipper,
    hasPhone: Boolean(primaryPhone || alternatePhone),
    hasAny: Boolean(
      contactName ||
        businessName ||
        primaryPhone ||
        alternatePhone ||
        email ||
        instructions ||
        consignee ||
        shipper ||
        stop?.has_contact_info
    )
  };
}

export function getStopContactSummaryParts(stop) {
  const contact = getStopContactDetails(stop);
  return [
    contact.contactName,
    contact.businessName,
    contact.primaryPhone || contact.alternatePhone,
    contact.email
  ].filter(Boolean);
}

export function buildTelHref(phone) {
  const displayValue = normalizeContactText(phone);

  if (!displayValue) {
    return '';
  }

  const extensionMatch = displayValue.match(/\b(?:ext\.?|extension|x)\s*([0-9]+)\b/i);
  const extensionDigits = extensionMatch?.[1] || '';
  const baseValue = extensionMatch ? displayValue.slice(0, extensionMatch.index).trim() : displayValue;
  const dialableBase = baseValue.replace(/[^\d+]/g, '');

  if (!dialableBase) {
    return '';
  }

  return `tel:${dialableBase}${extensionDigits ? `,${extensionDigits}` : ''}`;
}

