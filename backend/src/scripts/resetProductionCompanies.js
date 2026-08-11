const { createClient } = require('@supabase/supabase-js');

const REQUIRED_CONFIRMATION = 'DELETE_ALL_READY_ROUTE_COMPANIES';
const ACCOUNT_STORAGE_BUCKETS = [
  'driver-documents',
  'vehicle-inspection-photos',
  'pod-photos',
  'support-attachments'
];

function requireEnvironment(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertResetAuthorized(mode, confirmation) {
  if (mode !== 'reset') return;
  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`Reset requires the exact confirmation ${REQUIRED_CONFIRMATION}.`);
  }
}

function buildAccountDeleteQuery(accountIds) {
  const ids = accountIds.map((value) => {
    const id = String(value || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error('Refusing to construct a company reset query with an invalid account ID.');
    }
    return `'${id}'::uuid`;
  });
  if (!ids.length) return null;
  return `set statement_timeout = '120s'; delete from public.accounts where id in (${ids.join(', ')});`;
}

async function deleteAccountRows({ accessToken, projectRef, accountIds }) {
  const query = buildAccountDeleteQuery(accountIds);
  if (!query) return;
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  if (!response.ok) throw new Error(`Production database reset failed (${response.status}): ${await response.text()}`);
}

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

async function listStorageFiles(storageBucket, prefix) {
  const files = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await storageBucket.list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    const entries = data || [];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) files.push(path);
      else files.push(...await listStorageFiles(storageBucket, path));
    }
    if (entries.length < limit) break;
    offset += limit;
  }
  return files;
}

async function removeAccountStorage(supabase, accountIds) {
  const removed = {};
  for (const bucketName of ACCOUNT_STORAGE_BUCKETS) {
    const bucket = supabase.storage.from(bucketName);
    const paths = [];
    for (const accountId of accountIds) paths.push(...await listStorageFiles(bucket, accountId));
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await bucket.remove(paths.slice(index, index + 100));
      if (error) throw error;
    }
    removed[bucketName] = paths.length;
  }
  return removed;
}

async function getSnapshot(supabase) {
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, company_name, manager_email, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const [managerCount, driverCount, questionCount] = await Promise.all([
    countRows(supabase, 'manager_users'),
    countRows(supabase, 'drivers'),
    countRows(supabase, 'driver_help_interactions')
  ]);
  return {
    company_count: (accounts || []).length,
    companies: (accounts || []).map(({ id, company_name, created_at }) => ({ id, company_name, created_at })),
    manager_count: managerCount,
    driver_count: driverCount,
    question_count: questionCount
  };
}

async function resetProductionCompanies({ supabase, mode, confirmation, accessToken, projectRef }) {
  assertResetAuthorized(mode, confirmation);
  const before = await getSnapshot(supabase);
  if (mode !== 'reset') return { mode: 'audit', before };

  const accountIds = before.companies.map((account) => account.id);
  await deleteAccountRows({ accessToken, projectRef, accountIds });
  const removedStorageObjects = await removeAccountStorage(supabase, accountIds);
  const after = await getSnapshot(supabase);
  if (after.company_count || after.manager_count || after.driver_count || after.question_count) {
    throw new Error(`Company reset verification failed: ${JSON.stringify(after)}`);
  }
  return { mode: 'reset', before, removed_storage_objects: removedStorageObjects, after };
}

async function main() {
  const mode = String(process.env.RESET_COMPANIES_MODE || 'audit').trim().toLowerCase();
  if (!['audit', 'reset'].includes(mode)) throw new Error('RESET_COMPANIES_MODE must be audit or reset.');
  const supabase = createClient(
    requireEnvironment('SUPABASE_URL'),
    requireEnvironment('SUPABASE_SERVICE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const result = await resetProductionCompanies({
    supabase,
    mode,
    confirmation: String(process.env.RESET_COMPANIES_CONFIRM || '').trim(),
    accessToken: mode === 'reset' ? requireEnvironment('SUPABASE_ACCESS_TOKEN') : null,
    projectRef: mode === 'reset' ? requireEnvironment('SUPABASE_PROJECT_REF') : null
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Company reset failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ACCOUNT_STORAGE_BUCKETS,
  REQUIRED_CONFIRMATION,
  assertResetAuthorized,
  buildAccountDeleteQuery,
  deleteAccountRows,
  listStorageFiles,
  resetProductionCompanies
};
