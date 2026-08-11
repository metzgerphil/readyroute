const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');

function requireEnvironment(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid staff owner email is required.');
  }
}

async function provisionInitialStaffOwner({ supabase, email, fullName }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(fullName || '').trim();
  validateEmail(normalizedEmail);

  if (!normalizedName) {
    throw new Error('A staff owner full name is required.');
  }

  const { data: existingUser, error: lookupError } = await supabase
    .from('readyroute_staff_users')
    .select('id, email, full_name, role, is_active, password_hash')
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existingUser) {
    if (existingUser.role !== 'owner') {
      throw new Error('The requested email already belongs to a non-owner staff account. Use the authenticated staff administration flow.');
    }

    const updates = {};
    if (!existingUser.is_active) updates.is_active = true;
    if (!existingUser.password_hash) {
      updates.password_hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      updates.accepted_at = new Date().toISOString();
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('readyroute_staff_users')
        .update(updates)
        .eq('id', existingUser.id);
      if (updateError) throw updateError;
    }

    return { created: false, email: normalizedEmail, id: existingUser.id, role: 'owner' };
  }

  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  const now = new Date().toISOString();
  const { data: createdUser, error: insertError } = await supabase
    .from('readyroute_staff_users')
    .insert({
      accepted_at: now,
      email: normalizedEmail,
      full_name: normalizedName,
      invited_at: now,
      is_active: true,
      password_hash: passwordHash,
      role: 'owner'
    })
    .select('id, email, role')
    .single();

  if (insertError) {
    throw insertError;
  }

  return { created: true, email: createdUser.email, id: createdUser.id, role: createdUser.role };
}

async function main() {
  const email = requireEnvironment('STAFF_OWNER_EMAIL');
  const fullName = requireEnvironment('STAFF_OWNER_FULL_NAME');
  const supabase = createClient(
    requireEnvironment('SUPABASE_URL'),
    requireEnvironment('SUPABASE_SERVICE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const result = await provisionInitialStaffOwner({ supabase, email, fullName });
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Staff owner provisioning failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { normalizeEmail, provisionInitialStaffOwner, validateEmail };
