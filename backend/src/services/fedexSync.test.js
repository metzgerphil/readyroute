const test = require('node:test');
const assert = require('node:assert/strict');

const { createFedexSyncService } = require('./fedexSync');

class MockQueryBuilder {
  constructor(supabase, table) {
    this.supabase = supabase;
    this.table = table;
    this.operation = 'select';
    this.state = {
      table,
      filters: [],
      orders: [],
      limit: null,
      payload: undefined,
      columns: null,
      options: {}
    };
  }

  select(columns) {
    if (this.operation === 'insert' || this.operation === 'update' || this.operation === 'upsert') {
      this.state.returning = columns;
      return this;
    }

    this.operation = 'select';
    this.state.columns = columns;
    return this;
  }

  insert(payload) {
    this.operation = 'insert';
    this.state.payload = payload;
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.state.payload = payload;
    return this;
  }

  eq(column, value) {
    this.state.filters.push({ op: 'eq', column, value });
    return this;
  }

  in(column, values) {
    this.state.filters.push({ op: 'in', column, value: values });
    return this;
  }

  is(column, value) {
    this.state.filters.push({ op: 'is', column, value });
    return this;
  }

  order(column, options = {}) {
    this.state.orders.push({ column, options });
    return this;
  }

  limit(value) {
    this.state.limit = value;
    return this;
  }

  single() {
    return this.execute('single');
  }

  maybeSingle() {
    return this.execute('maybeSingle');
  }

  then(resolve, reject) {
    return this.execute('all').then(resolve, reject);
  }

  execute(mode) {
    return Promise.resolve(this.supabase.execute({
      table: this.table,
      operation: this.operation,
      mode,
      ...this.state
    }));
  }
}

class MockSupabase {
  constructor(handler) {
    this.handler = handler;
    this.calls = [];
  }

  from(table) {
    return new MockQueryBuilder(this, table);
  }

  execute(query) {
    this.calls.push(query);
    return this.handler(query, this.calls);
  }
}

test('triggerManualSync creates a skipped run when no connected FedEx account exists', async () => {
  const syncRuns = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'acct-1',
          company_name: 'Bridge Transportation',
          operations_timezone: 'America/Los_Angeles',
          dispatch_window_start_hour: 6,
          dispatch_window_end_hour: 11,
          manifest_sync_interval_minutes: 15
        },
        error: null
      };
    }

    if (query.table === 'fedex_accounts' && query.operation === 'select') {
      return { data: null, error: null };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'insert') {
      const inserted = {
        id: 'run-1',
        ...query.payload,
        details: query.payload.details || {}
      };
      syncRuns.push(inserted);
      return { data: inserted, error: null };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'update') {
      const runId = query.filters.find((filter) => filter.column === 'id')?.value;
      const existing = syncRuns.find((run) => run.id === runId);
      Object.assign(existing, query.payload);
      return { data: existing, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFedexSyncService({
    supabase,
    now: () => new Date('2026-04-24T14:00:00.000Z')
  });

  const result = await service.triggerManualSync({ accountId: 'acct-1' });

  assert.equal(result.background_sync_enabled, false);
  assert.equal(result.sync_engine_status, 'skipped');
  assert.equal(result.trigger, 'manual');
  assert.equal(result.run.error_summary, 'No connected FedEx account configured.');
  assert.equal(syncRuns.length, 1);
  assert.equal(syncRuns[0].run_status, 'skipped');
});

test('triggerManualSync completes with manifest counts when the adapter returns manifests', async () => {
  const syncRuns = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'acct-1',
          company_name: 'Bridge Transportation',
          operations_timezone: 'America/Los_Angeles',
          dispatch_window_start_hour: 6,
          dispatch_window_end_hour: 11,
          manifest_sync_interval_minutes: 15
        },
        error: null
      };
    }

    if (query.table === 'fedex_accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'fx-1',
          nickname: 'Default',
          account_number: '123456',
          connection_status: 'connected',
          is_default: true,
          fcc_username: 'bridge@example.com',
          fcc_password_encrypted: 'ciphertext'
        },
        error: null
      };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'insert') {
      const inserted = {
        id: 'run-1',
        ...query.payload,
        details: query.payload.details || {}
      };
      syncRuns.push(inserted);
      return { data: inserted, error: null };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'update') {
      const runId = query.filters.find((filter) => filter.column === 'id')?.value;
      const existing = syncRuns.find((run) => run.id === runId);
      Object.assign(existing, query.payload);
      return { data: existing, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFedexSyncService({
    supabase,
    now: () => new Date('2026-04-24T14:00:00.000Z'),
    adapter: {
      async pullDailyManifests() {
        return {
          manifest_count: 3,
          changed_route_count: 2,
          has_changes: true,
          summary: 'Pulled 3 FCC manifests.',
          details: {
            routes: ['810', '811', '823']
          }
        };
      }
    }
  });

  const result = await service.triggerManualSync({ accountId: 'acct-1', managerUserId: 'mgr-1' });

  assert.equal(result.background_sync_enabled, true);
  assert.equal(result.sync_engine_status, 'completed_with_changes');
  assert.equal(result.run.manifest_count, 3);
  assert.equal(result.run.changed_route_count, 2);
  assert.equal(result.run.initiated_by_manager_user_id, 'mgr-1');
});

test('runScheduledSync only runs accounts inside the active local window', async () => {
  const syncRuns = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'acct-active',
            company_name: 'Bridge West',
            operations_timezone: 'America/Los_Angeles',
            dispatch_window_start_hour: 6,
            dispatch_window_end_hour: 11,
            manifest_sync_interval_minutes: 15
          },
          {
            id: 'acct-before',
            company_name: 'Bridge East',
            operations_timezone: 'America/New_York',
            dispatch_window_start_hour: 10,
            dispatch_window_end_hour: 14,
            manifest_sync_interval_minutes: 15
          }
        ],
        error: null
      };
    }

    if (query.table === 'fedex_accounts' && query.operation === 'select') {
      const accountId = query.filters.find((filter) => filter.column === 'account_id')?.value;
      return {
        data: {
          id: `fx-${accountId}`,
          nickname: 'Default',
          account_number: '123456',
          connection_status: 'connected',
          is_default: true,
          fcc_username: 'bridge@example.com',
          fcc_password_encrypted: 'ciphertext'
        },
        error: null
      };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'insert') {
      const inserted = {
        id: `run-${syncRuns.length + 1}`,
        ...query.payload,
        details: query.payload.details || {}
      };
      syncRuns.push(inserted);
      return { data: inserted, error: null };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'update') {
      const runId = query.filters.find((filter) => filter.column === 'id')?.value;
      const existing = syncRuns.find((run) => run.id === runId);
      Object.assign(existing, query.payload);
      return { data: existing, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFedexSyncService({
    supabase,
    now: () => new Date('2026-04-24T13:00:00.000Z'),
    adapter: {
      async pullDailyManifests({ account }) {
        return {
          manifest_count: 1,
          changed_route_count: 0,
          has_changes: false,
          summary: `Pulled manifests for ${account.company_name}.`
        };
      }
    }
  });

  const result = await service.runScheduledSync();

  assert.equal(result.processed_accounts, 2);
  assert.equal(result.eligible_accounts, 1);
  assert.equal(result.completed_runs, 1);
  assert.equal(result.skipped_runs, 1);
  assert.equal(syncRuns.length, 1);
  assert.equal(syncRuns[0].account_id, 'acct-active');
});

test('triggerManualSync skips when the connected FedEx account is missing FCC credentials', async () => {
  const syncRuns = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'acct-1',
          company_name: 'Bridge Transportation',
          operations_timezone: 'America/Los_Angeles',
          dispatch_window_start_hour: 6,
          dispatch_window_end_hour: 11,
          manifest_sync_interval_minutes: 15
        },
        error: null
      };
    }

    if (query.table === 'fedex_accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'fx-1',
          nickname: 'Default',
          account_number: '123456',
          connection_status: 'connected',
          is_default: true,
          fcc_username: null,
          fcc_password_encrypted: null
        },
        error: null
      };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'insert') {
      const inserted = {
        id: 'run-1',
        ...query.payload,
        details: query.payload.details || {}
      };
      syncRuns.push(inserted);
      return { data: inserted, error: null };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'update') {
      const runId = query.filters.find((filter) => filter.column === 'id')?.value;
      const existing = syncRuns.find((run) => run.id === runId);
      Object.assign(existing, query.payload);
      return { data: existing, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFedexSyncService({
    supabase,
    now: () => new Date('2026-04-24T14:00:00.000Z')
  });

  const result = await service.triggerManualSync({ accountId: 'acct-1' });

  assert.equal(result.background_sync_enabled, false);
  assert.equal(result.sync_engine_status, 'skipped');
  assert.equal(result.run.error_summary, 'FCC credentials are missing for the default FedEx account.');
});

test('triggerManualSync stages adapter manifest pairs through the shared ingest service', async () => {
  const syncRuns = [];
  const stagedRoutes = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'acct-1',
          company_name: 'Bridge Transportation',
          operations_timezone: 'America/Los_Angeles',
          dispatch_window_start_hour: 6,
          dispatch_window_end_hour: 11,
          manifest_sync_interval_minutes: 15
        },
        error: null
      };
    }

    if (query.table === 'fedex_accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'fx-1',
          nickname: 'Default',
          account_number: '123456',
          connection_status: 'connected',
          is_default: true,
          fcc_username: 'bridge@example.com',
          fcc_password_encrypted: 'ciphertext'
        },
        error: null
      };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'insert') {
      const inserted = {
        id: 'run-1',
        ...query.payload,
        details: query.payload.details || {}
      };
      syncRuns.push(inserted);
      return { data: inserted, error: null };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'update') {
      const runId = query.filters.find((filter) => filter.column === 'id')?.value;
      const existing = syncRuns.find((run) => run.id === runId);
      Object.assign(existing, query.payload);
      return { data: existing, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFedexSyncService({
    supabase,
    now: () => new Date('2026-04-24T14:00:00.000Z'),
    manifestIngestService: {
      async stageManifestArtifacts(input) {
        stagedRoutes.push(input);
        return {
          route_id: `route-${stagedRoutes.length}`,
          total_stops: 101,
          sync_state: stagedRoutes.length === 1 ? 'staged_changed' : 'staged_stable',
          merged_into_existing_route: stagedRoutes.length === 1
        };
      }
    },
    adapter: {
      async pullDailyManifests() {
        return {
          manifest_count: 2,
          changed_route_count: 0,
          has_changes: false,
          summary: 'Pulled 2 FCC manifests.',
          manifest_pairs: [
            {
              manifest_file: {
                originalname: 'route-810.xls',
                buffer: Buffer.from('xls')
              },
              companion_gpx_file: {
                originalname: 'route-810.gpx',
                buffer: Buffer.from('gpx')
              },
              work_area_name: '810'
            },
            {
              manifest_file: {
                originalname: 'route-811.xls',
                buffer: Buffer.from('xls')
              },
              companion_gpx_file: {
                originalname: 'route-811.gpx',
                buffer: Buffer.from('gpx')
              },
              work_area_name: '811'
            }
          ]
        };
      }
    }
  });

  const result = await service.triggerManualSync({ accountId: 'acct-1', managerUserId: 'manager-1' });

  assert.equal(stagedRoutes.length, 2);
  assert.equal(result.sync_engine_status, 'completed_with_changes');
  assert.equal(result.run.changed_route_count, 1);
  assert.equal(result.run.details.ingest_results.length, 2);
  assert.equal(stagedRoutes[0].source, 'fedex_sync');
  assert.equal(stagedRoutes[0].managerUserId, 'manager-1');
});

test('syncRouteProgress applies FCC progress snapshots through the shared progress service', async () => {
  const syncRuns = [];
  const appliedProgress = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'acct-1',
          company_name: 'Bridge Transportation',
          operations_timezone: 'America/Los_Angeles',
          dispatch_window_start_hour: 6,
          dispatch_window_end_hour: 11,
          manifest_sync_interval_minutes: 15
        },
        error: null
      };
    }

    if (query.table === 'fedex_accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'fx-1',
          nickname: 'Default',
          account_number: '123456',
          connection_status: 'connected',
          is_default: true,
          fcc_username: 'bridge@example.com',
          fcc_password_encrypted: 'ciphertext'
        },
        error: null
      };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'insert') {
      const inserted = {
        id: 'run-1',
        ...query.payload,
        details: query.payload.details || {}
      };
      syncRuns.push(inserted);
      return { data: inserted, error: null };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'update') {
      const runId = query.filters.find((filter) => filter.column === 'id')?.value;
      const existing = syncRuns.find((run) => run.id === runId);
      Object.assign(existing, query.payload);
      return { data: existing, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFedexSyncService({
    supabase,
    now: () => new Date('2026-04-24T14:00:00.000Z'),
    fccProgressSyncService: {
      async applyRouteProgress(input) {
        appliedProgress.push(input);
        return {
          route_count: 1,
          completed_updates: 3,
          has_changes: true,
          routes: [{ route_id: 'route-823', status: 'updated', completed_updates: 3 }]
        };
      }
    },
    adapter: {
      async pullRouteProgress() {
        return {
          route_count: 1,
          completed_stop_count: 3,
          summary: 'Synced FCC progress for 1 work area.',
          details: {
            progress_only: true
          },
          progress_snapshots: [
            {
              work_area_name: '823',
              rows: [{ sid: '1002', is_completed: true }]
            }
          ]
        };
      }
    }
  });

  const result = await service.syncRouteProgress({ accountId: 'acct-1', managerUserId: 'mgr-1' });

  assert.equal(result.background_sync_enabled, true);
  assert.equal(result.sync_engine_status, 'completed_with_changes');
  assert.equal(result.trigger, 'progress_sync');
  assert.equal(appliedProgress.length, 1);
  assert.equal(appliedProgress[0].managerUserId, 'mgr-1');
  assert.equal(appliedProgress[0].progressSnapshots.length, 1);
  assert.equal(result.run.changed_route_count, 3);
  assert.equal(result.run.details.progress_result.completed_updates, 3);
});

test('runScheduledProgressSync checks every account for its local current day', async () => {
  const syncRuns = [];
  const pulledProgress = [];
  const appliedProgress = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'acct-west',
            company_name: 'Bridge West',
            operations_timezone: 'America/Los_Angeles',
            dispatch_window_start_hour: 6,
            dispatch_window_end_hour: 11,
            manifest_sync_interval_minutes: 15
          },
          {
            id: 'acct-east',
            company_name: 'Bridge East',
            operations_timezone: 'America/New_York',
            dispatch_window_start_hour: 6,
            dispatch_window_end_hour: 11,
            manifest_sync_interval_minutes: 15
          }
        ],
        error: null
      };
    }

    if (query.table === 'fedex_accounts' && query.operation === 'select') {
      const accountId = query.filters.find((filter) => filter.column === 'account_id')?.value;
      return {
        data: {
          id: `fx-${accountId}`,
          nickname: 'Default',
          account_number: accountId === 'acct-west' ? '123456' : '654321',
          connection_status: 'connected',
          is_default: true,
          fcc_username: 'bridge@example.com',
          fcc_password_encrypted: 'ciphertext'
        },
        error: null
      };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'insert') {
      const inserted = {
        id: `run-${syncRuns.length + 1}`,
        ...query.payload,
        details: query.payload.details || {}
      };
      syncRuns.push(inserted);
      return { data: inserted, error: null };
    }

    if (query.table === 'fedex_sync_runs' && query.operation === 'update') {
      const runId = query.filters.find((filter) => filter.column === 'id')?.value;
      const existing = syncRuns.find((run) => run.id === runId);
      Object.assign(existing, query.payload);
      return { data: existing, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFedexSyncService({
    supabase,
    now: () => new Date('2026-04-24T23:30:00.000Z'),
    fccProgressSyncService: {
      async applyRouteProgress(input) {
        appliedProgress.push(input);
        return {
          route_count: 1,
          completed_updates: input.accountId === 'acct-west' ? 2 : 0,
          has_changes: input.accountId === 'acct-west',
          routes: []
        };
      }
    },
    adapter: {
      async pullRouteProgress(input) {
        pulledProgress.push(input);
        return {
          route_count: 1,
          completed_stop_count: input.account.id === 'acct-west' ? 2 : 0,
          progress_snapshots: [{ work_area_name: '823', rows: [] }]
        };
      }
    }
  });

  const result = await service.runScheduledProgressSync();

  assert.equal(result.trigger, 'progress_sync');
  assert.equal(result.processed_accounts, 2);
  assert.equal(result.eligible_accounts, 2);
  assert.equal(result.changed_runs, 1);
  assert.equal(result.completed_runs, 1);
  assert.equal(pulledProgress.length, 2);
  assert.equal(appliedProgress.length, 2);
  assert.deepEqual(
    appliedProgress.map((input) => [input.accountId, input.workDate]),
    [
      ['acct-west', '2026-04-24'],
      ['acct-east', '2026-04-24']
    ]
  );
  assert.equal(syncRuns[0].trigger_source, 'progress_sync');
  assert.equal(syncRuns[0].details.route_sync_settings.dispatch_window_state, 'after_window');
});

test('runScheduledAutomationCycle runs manifests first and progress second', async () => {
  const calls = [];
  const service = createFedexSyncService({
    supabase: new MockSupabase(() => {
      throw new Error('supabase should not be reached by overridden methods');
    })
  });

  service.runScheduledSync = async (input) => {
    calls.push(['manifests', input]);
    return {
      processed_accounts: 2,
      changed_runs: 1,
      failed_runs: 0
    };
  };
  service.runScheduledProgressSync = async (input) => {
    calls.push(['progress', input]);
    return {
      processed_accounts: 2,
      changed_runs: 0,
      failed_runs: 1
    };
  };

  const result = await service.runScheduledAutomationCycle({ accountIds: ['acct-1'] });

  assert.deepEqual(calls, [
    ['manifests', { accountIds: ['acct-1'] }],
    ['progress', { accountIds: ['acct-1'] }]
  ]);
  assert.equal(result.trigger, 'automation_cycle');
  assert.equal(result.processed_accounts, 2);
  assert.equal(result.changed_runs, 1);
  assert.equal(result.failed_runs, 1);
});
