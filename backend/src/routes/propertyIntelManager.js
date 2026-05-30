const express = require('express');

const defaultSupabase = require('../lib/supabase');
const { buildPropertyIntelKey, savePropertyIntel } = require('../services/propertyIntel');

function normalizePropertyIntelText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizePropertyIntelFlags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((flag) => normalizePropertyIntelText(flag).toLowerCase())
      .filter(Boolean)
  )];
}

function presentPropertyIntelRow(row) {
  return {
    id: row.id,
    normalized_address: row.normalized_address || null,
    display_address: row.display_address || row.normalized_address || null,
    property_name: row.property_name || null,
    property_type: row.property_type || null,
    building: row.building || null,
    access_code: row.access_code || null,
    access_code_confirmed_at: row.access_code_confirmed_at || null,
    access_code_source: row.access_code_source || null,
    access_note: row.access_note || null,
    parking_note: row.parking_note || null,
    entry_note: row.entry_note || null,
    business_hours: row.business_hours || null,
    shared_note: row.shared_note || null,
    warning_flags: normalizePropertyIntelFlags(row.warning_flags),
    updated_at: row.updated_at || null
  };
}

function createPropertyIntelManagerRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;

  router.get('/', async (req, res) => {
    try {
      const { data: rows, error } = await supabase
        .from('property_intel')
        .select('id, normalized_address, display_address, property_name, property_type, building, access_code, access_code_confirmed_at, access_code_source, access_note, parking_note, entry_note, business_hours, shared_note, warning_flags, updated_at')
        .eq('account_id', req.account.account_id)
        .order('display_address', { ascending: true });

      if (error) {
        console.error('Manager property intel list failed:', error);
        return res.status(500).json({ error: 'Failed to load access codes' });
      }

      return res.status(200).json({
        property_intel: (rows || []).map(presentPropertyIntelRow)
      });
    } catch (error) {
      console.error('Manager property intel list endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load access codes' });
    }
  });

  router.post('/', async (req, res) => {
    const displayAddress = normalizePropertyIntelText(req.body?.display_address || req.body?.address);

    if (!displayAddress) {
      return res.status(400).json({ error: 'Address is required.' });
    }

    try {
      const key = buildPropertyIntelKey({ address: displayAddress, address_line2: null });

      if (!key.normalized_address) {
        return res.status(400).json({ error: 'Address could not be normalized.' });
      }

      const saved = await savePropertyIntel(
        supabase,
        req.account.account_id,
        { address: displayAddress, address_line2: null, contact_name: req.body?.property_name || null },
        {
          property_name: req.body?.property_name,
          property_type: req.body?.property_type,
          building: req.body?.building,
          access_code: req.body?.access_code,
          access_code_source: req.body?.access_code_source || 'manager',
          access_note: req.body?.access_note,
          parking_note: req.body?.parking_note,
          entry_note: req.body?.entry_note,
          business_hours: req.body?.business_hours,
          shared_note: req.body?.shared_note,
          warning_flags: req.body?.warning_flags
        }
      );

      return res.status(201).json({
        property_intel: presentPropertyIntelRow({
          id: null,
          ...saved
        })
      });
    } catch (error) {
      console.error('Manager property intel create endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save access code' });
    }
  });

  router.patch('/:propertyIntelId', async (req, res) => {
    const propertyIntelId = req.params.propertyIntelId;

    try {
      const { data: existingRow, error: lookupError } = await supabase
        .from('property_intel')
        .select('id, account_id, access_code_confirmed_at')
        .eq('id', propertyIntelId)
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (lookupError) {
        console.error('Manager property intel lookup failed:', lookupError);
        return res.status(500).json({ error: 'Failed to load access code' });
      }

      if (!existingRow) {
        return res.status(404).json({ error: 'Access code record not found.' });
      }

      const accessCode = normalizePropertyIntelText(req.body?.access_code);
      const payload = {
        property_name: normalizePropertyIntelText(req.body?.property_name) || null,
        property_type: normalizePropertyIntelText(req.body?.property_type) || null,
        building: normalizePropertyIntelText(req.body?.building) || null,
        access_code: accessCode || null,
        access_code_confirmed_at: accessCode ? new Date().toISOString() : null,
        access_code_source: accessCode ? normalizePropertyIntelText(req.body?.access_code_source) || 'manager' : null,
        access_note: normalizePropertyIntelText(req.body?.access_note) || null,
        parking_note: normalizePropertyIntelText(req.body?.parking_note) || null,
        entry_note: normalizePropertyIntelText(req.body?.entry_note) || null,
        business_hours: normalizePropertyIntelText(req.body?.business_hours) || null,
        shared_note: normalizePropertyIntelText(req.body?.shared_note) || null,
        warning_flags: normalizePropertyIntelFlags(req.body?.warning_flags),
        updated_at: new Date().toISOString()
      };

      if (
        accessCode &&
        normalizePropertyIntelText(req.body?.access_code) === normalizePropertyIntelText(req.body?.original_access_code) &&
        existingRow.access_code_confirmed_at
      ) {
        payload.access_code_confirmed_at = existingRow.access_code_confirmed_at;
      }

      const { data: updatedRows, error: updateError } = await supabase
        .from('property_intel')
        .update(payload)
        .eq('id', propertyIntelId)
        .eq('account_id', req.account.account_id)
        .select('id, normalized_address, display_address, property_name, property_type, building, access_code, access_code_confirmed_at, access_code_source, access_note, parking_note, entry_note, business_hours, shared_note, warning_flags, updated_at');

      if (updateError) {
        console.error('Manager property intel update failed:', updateError);
        return res.status(500).json({ error: 'Failed to save access code' });
      }

      return res.status(200).json({
        property_intel: presentPropertyIntelRow((updatedRows || [])[0] || { id: propertyIntelId, ...payload })
      });
    } catch (error) {
      console.error('Manager property intel update endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save access code' });
    }
  });

  return router;
}

module.exports = createPropertyIntelManagerRouter();
module.exports.createPropertyIntelManagerRouter = createPropertyIntelManagerRouter;
