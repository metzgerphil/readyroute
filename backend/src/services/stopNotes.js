const { extractUnitNumber, normalizeBuildingAddress } = require('./apartmentIntelligence');

function normalizeString(value) {
  return String(value || '').trim();
}

function buildStopNoteKey(stop, createAddressHash) {
  const address = normalizeString(stop?.address);
  const addressLine2 = normalizeString(stop?.address_line2);

  return {
    address_hash: createAddressHash(address),
    normalized_address: normalizeBuildingAddress(address, addressLine2),
    unit_number: extractUnitNumber(addressLine2),
    display_address: address || null
  };
}

async function loadStopNote(supabase, accountId, stop, createAddressHash) {
  const noteKey = buildStopNoteKey(stop, createAddressHash);

  if (noteKey.normalized_address) {
    if (noteKey.unit_number) {
      const { data: exactMatch, error: exactError } = await supabase
        .from('stop_notes')
        .select('id, note_text, normalized_address, unit_number, updated_at')
        .eq('account_id', accountId)
        .eq('normalized_address', noteKey.normalized_address)
        .eq('unit_number', noteKey.unit_number)
        .maybeSingle();

      if (exactError) {
        throw exactError;
      }

      if (exactMatch) {
        return {
          ...exactMatch,
          applies_to_unit: true
        };
      }
    }

    const { data: buildingMatch, error: buildingError } = await supabase
      .from('stop_notes')
      .select('id, note_text, normalized_address, unit_number, updated_at')
      .eq('account_id', accountId)
      .eq('normalized_address', noteKey.normalized_address)
      .is('unit_number', null)
      .maybeSingle();

    if (buildingError) {
      throw buildingError;
    }

    if (buildingMatch) {
      return {
        ...buildingMatch,
        applies_to_unit: false
      };
    }
  }

  const { data: legacyMatch, error: legacyError } = await supabase
    .from('stop_notes')
    .select('id, note_text, updated_at')
    .eq('account_id', accountId)
    .eq('address_hash', noteKey.address_hash)
    .maybeSingle();

  if (legacyError) {
    throw legacyError;
  }

  if (!legacyMatch) {
    return null;
  }

  return {
    ...legacyMatch,
    normalized_address: noteKey.normalized_address || null,
    unit_number: noteKey.unit_number || null,
    applies_to_unit: Boolean(noteKey.unit_number)
  };
}

async function saveStopNote(supabase, accountId, stop, noteText, createAddressHash) {
  const normalizedNoteText = normalizeString(noteText);
  const noteKey = buildStopNoteKey(stop, createAddressHash);
  const existingNote = await loadStopNote(supabase, accountId, stop, createAddressHash);

  if (existingNote?.id && normalizedNoteText) {
    const { error } = await supabase
      .from('stop_notes')
      .update({
        note_text: normalizedNoteText,
        address_hash: noteKey.address_hash,
        normalized_address: noteKey.normalized_address || null,
        unit_number: noteKey.unit_number || null,
        display_address: noteKey.display_address,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingNote.id);

    if (error) {
      throw error;
    }
  } else if (existingNote?.id && !normalizedNoteText) {
    const { error } = await supabase
      .from('stop_notes')
      .delete()
      .eq('id', existingNote.id);

    if (error) {
      throw error;
    }
  } else if (normalizedNoteText) {
    const { error } = await supabase
      .from('stop_notes')
      .insert({
        account_id: accountId,
        address_hash: noteKey.address_hash,
        normalized_address: noteKey.normalized_address || null,
        unit_number: noteKey.unit_number || null,
        display_address: noteKey.display_address,
        note_text: normalizedNoteText
      });

    if (error) {
      throw error;
    }
  }

  return normalizedNoteText
    ? {
        note_text: normalizedNoteText,
        applies_to_unit: Boolean(noteKey.unit_number)
      }
    : null;
}

async function attachStopNotesToStops(supabase, accountId, stops, createAddressHash) {
  const stopList = stops || [];
  const keyedStops = stopList.map((stop) => ({
    stop,
    key: buildStopNoteKey(stop, createAddressHash)
  }));

  const normalizedAddresses = [...new Set(keyedStops.map(({ key }) => key.normalized_address).filter(Boolean))];
  const addressHashes = [...new Set(keyedStops.map(({ key }) => key.address_hash).filter(Boolean))];

  let noteRows = [];

  if (normalizedAddresses.length) {
    const { data, error } = await supabase
      .from('stop_notes')
      .select('id, account_id, address_hash, normalized_address, unit_number, display_address, note_text, updated_at')
      .eq('account_id', accountId)
      .in('normalized_address', normalizedAddresses);

    if (error) {
      throw error;
    }

    noteRows = noteRows.concat(data || []);
  }

  if (addressHashes.length) {
    const { data, error } = await supabase
      .from('stop_notes')
      .select('id, account_id, address_hash, normalized_address, unit_number, display_address, note_text, updated_at')
      .eq('account_id', accountId)
      .in('address_hash', addressHashes);

    if (error) {
      throw error;
    }

    const seenIds = new Set(noteRows.map((row) => row.id));
    noteRows = noteRows.concat((data || []).filter((row) => !seenIds.has(row.id)));
  }

  const exactNotes = new Map();
  const buildingNotes = new Map();
  const legacyNotes = new Map();

  for (const note of noteRows) {
    const normalizedAddress = normalizeString(note.normalized_address);
    const unitNumber = normalizeString(note.unit_number).toUpperCase() || null;
    const addressHash = normalizeString(note.address_hash);

    if (normalizedAddress && unitNumber) {
      exactNotes.set(`${normalizedAddress}::${unitNumber}`, note);
      continue;
    }

    if (normalizedAddress && !buildingNotes.has(normalizedAddress)) {
      buildingNotes.set(normalizedAddress, note);
    }

    if (addressHash && !legacyNotes.has(addressHash)) {
      legacyNotes.set(addressHash, note);
    }
  }

  return keyedStops.map(({ stop, key }) => {
    const exactKey = key.normalized_address && key.unit_number
      ? `${key.normalized_address}::${key.unit_number}`
      : null;
    const note = (exactKey && exactNotes.get(exactKey))
      || (key.normalized_address && buildingNotes.get(key.normalized_address))
      || legacyNotes.get(key.address_hash)
      || null;

    return {
      ...stop,
      has_note: Boolean(note?.note_text),
      note_text: note?.note_text || null,
      notes: note?.note_text || stop?.notes || null,
      note_scope: note ? (note.unit_number ? 'unit' : 'address') : null
    };
  });
}

module.exports = {
  attachStopNotesToStops,
  buildStopNoteKey,
  loadStopNote,
  saveStopNote
};
