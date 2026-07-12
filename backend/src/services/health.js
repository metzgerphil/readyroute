const { REQUIRED_SCHEMA_VERSION } = require('../config/schemaVersion');
const { getLaunchReadiness } = require('../config/launchReadiness');

function releaseCommit() {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.SOURCE_COMMIT ||
    process.env.GIT_COMMIT_SHA ||
    null
  );
}

async function readSchemaCompatibility(supabase) {
  try {
    const { data, error } = await supabase
      .from('readyroute_schema_state')
      .select('version,applied_at')
      .eq('id', true)
      .maybeSingle();

    if (error) throw error;

    const current = data?.version || null;
    return {
      required: REQUIRED_SCHEMA_VERSION,
      current,
      compatible: current === REQUIRED_SCHEMA_VERSION,
      checked_at: new Date().toISOString()
    };
  } catch (_error) {
    return {
      required: REQUIRED_SCHEMA_VERSION,
      current: null,
      compatible: false,
      checked_at: new Date().toISOString()
    };
  }
}

function createHealthService({ supabase }) {
  async function snapshot() {
    const schema = await readSchemaCompatibility(supabase);
    const launch = getLaunchReadiness(process.env);
    return {
      status: schema.compatible ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      release: { commit: releaseCommit() },
      schema,
      launch: {
        ready: launch.ready,
        modes: launch.modes,
        capabilities: launch.capabilities
      }
    };
  }

  return { snapshot };
}

module.exports = {
  createHealthService,
  readSchemaCompatibility,
  releaseCommit
};
