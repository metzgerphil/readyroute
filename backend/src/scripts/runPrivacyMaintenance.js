require('dotenv').config();

const supabase = require('../lib/supabase');

async function main() {
  const [retention, deletions] = await Promise.all([
    supabase.rpc('run_driver_help_retention'),
    supabase.rpc('process_due_driver_account_deletions')
  ]);
  if (retention.error) throw retention.error;
  if (deletions.error) throw deletions.error;
  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'ReadyRoute privacy maintenance completed',
    retention: retention.data,
    account_deletions_completed: deletions.data
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    severity: 'ERROR',
    message: 'ReadyRoute privacy maintenance failed',
    error: error.message
  }));
  process.exit(1);
});
