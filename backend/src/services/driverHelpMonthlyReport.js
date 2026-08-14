const { sendResendEmail: defaultSendEmail } = require('./managerInviteEmail');

function getPreviousUtcMonth(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid report date is required');
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return {
    report_month: start.toISOString().slice(0, 10),
    start_iso: start.toISOString(),
    end_iso: end.toISOString(),
    label: start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  };
}

function groupQuestionSituations(interactions = []) {
  const groups = new Map();
  interactions.forEach((row, index) => {
    const key = row.session_id || `interaction:${row.id || index}`;
    const group = groups.get(key) || {
      driver_id: row.driver_id || null,
      interactions: [],
      response_modes: new Set()
    };
    group.interactions.push(row);
    group.response_modes.add(row.response_mode);
    if (!group.driver_id && row.driver_id) group.driver_id = row.driver_id;
    groups.set(key, group);
  });
  return [...groups.values()];
}

function buildMetrics(interactions = [], feedback = [], minutesPerAnswer = 5) {
  const situations = groupQuestionSituations(interactions);
  const successfulSituations = situations.filter((group) => group.response_modes.has('ANSWER')).length;
  const failedSituations = situations.filter((group) => (
    !group.response_modes.has('ANSWER') && group.response_modes.has('ESCALATE')
  )).length;
  const clarificationOnlySituations = situations.filter((group) => (
    !group.response_modes.has('ANSWER') && !group.response_modes.has('ESCALATE')
  )).length;
  const interactionIds = new Set(interactions.map((row) => row.id).filter(Boolean));
  const scopedFeedback = feedback.filter((row) => !row.interaction_id || interactionIds.has(row.interaction_id));
  const helpful = scopedFeedback.filter((row) => row.rating === 'up').length;
  const unhelpful = scopedFeedback.filter((row) => row.rating === 'down').length;
  const rated = helpful + unhelpful;
  const answerInteractions = interactions.filter((row) => row.response_mode === 'ANSWER').length;
  const driversAsking = new Set(situations.map((group) => group.driver_id).filter(Boolean)).size;
  return {
    total_questions: situations.length,
    total_interactions: interactions.length,
    verified_answers: successfulSituations,
    failed_questions: failedSituations,
    clarification_only_questions: clarificationOnlySituations,
    success_rate: situations.length ? successfulSituations / situations.length : null,
    clarifications: interactions.filter((row) => row.response_mode === 'CLARIFY').length,
    escalated_interactions: interactions.filter((row) => row.response_mode === 'ESCALATE').length,
    no_verified_answer: failedSituations,
    helpful_ratings: helpful,
    unhelpful_ratings: unhelpful,
    ratings_received: rated,
    helpful_rate: rated ? helpful / rated : null,
    feedback_response_rate: answerInteractions ? Math.min(rated / answerInteractions, 1) : null,
    drivers_asking: driversAsking,
    questions_per_driver: driversAsking ? situations.length / driversAsking : 0,
    minutes_per_answer_estimate: minutesPerAnswer,
    estimated_manager_minutes_avoided: successfulSituations * minutesPerAnswer
  };
}

function buildDriverMetrics(interactions = [], feedback = [], drivers = []) {
  const interactionIds = new Set(interactions.map((row) => row.id).filter(Boolean));
  const scopedFeedback = feedback.filter((row) => !row.interaction_id || interactionIds.has(row.interaction_id));
  const feedbackByDriver = scopedFeedback.reduce((map, row) => {
    const key = row.driver_id || 'unknown';
    const ratings = map.get(key) || [];
    ratings.push(row);
    map.set(key, ratings);
    return map;
  }, new Map());
  const situationsByDriver = groupQuestionSituations(interactions).reduce((map, group) => {
    const key = group.driver_id || 'unknown';
    const groups = map.get(key) || [];
    groups.push(group);
    map.set(key, groups);
    return map;
  }, new Map());
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]));

  return [...new Set([...situationsByDriver.keys(), ...feedbackByDriver.keys()])].map((driverId) => {
    const situations = situationsByDriver.get(driverId) || [];
    const ratings = feedbackByDriver.get(driverId) || [];
    const verified = situations.filter((group) => group.response_modes.has('ANSWER')).length;
    const failed = situations.filter((group) => (
      !group.response_modes.has('ANSWER') && group.response_modes.has('ESCALATE')
    )).length;
    const helpful = ratings.filter((row) => row.rating === 'up').length;
    const unhelpful = ratings.filter((row) => row.rating === 'down').length;
    const driver = driverById.get(driverId);
    return {
      driver_id: driverId === 'unknown' ? null : driverId,
      driver_name: driver?.name || driver?.email || 'Unknown driver',
      total_questions: situations.length,
      verified_answers: verified,
      failed_questions: failed,
      success_rate: situations.length ? verified / situations.length : null,
      helpful_ratings: helpful,
      unhelpful_ratings: unhelpful,
      helpful_rate: helpful + unhelpful ? helpful / (helpful + unhelpful) : null
    };
  }).sort((left, right) => (
    right.total_questions - left.total_questions || left.driver_name.localeCompare(right.driver_name)
  ));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function buildMonthlyReportEmail({ companyName, monthLabel, metrics }) {
  const helpful = metrics.helpful_rate == null ? 'No ratings yet' : `${Math.round(metrics.helpful_rate * 100)}% of rated answers`;
  const success = metrics.success_rate == null ? 'No questions yet' : `${Math.round(metrics.success_rate * 100)}%`;
  const hours = (metrics.estimated_manager_minutes_avoided / 60).toFixed(1);
  return {
    subject: `${monthLabel} Ready Route driver-help report`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#173042;line-height:1.55;max-width:620px">
      <h2>${escapeHtml(companyName)} · ${escapeHtml(monthLabel)}</h2>
      <p>Your drivers asked <strong>${metrics.total_questions}</strong> questions in Ready Route.</p>
      <ul>
        <li><strong>${metrics.verified_answers}</strong> questions reached a verified answer (<strong>${escapeHtml(success)}</strong> success rate)</li>
        <li><strong>${metrics.failed_questions}</strong> questions safely escalated because no verified answer was available</li>
        <li><strong>${metrics.clarification_only_questions}</strong> questions ended before a verified answer or escalation</li>
        <li><strong>${escapeHtml(helpful)}</strong> were marked helpful</li>
      </ul>
      <h3>Estimated manager time avoided: ${hours} hours</h3>
      <p style="color:#657582;font-size:13px">This is an estimate, not measured time savings. It assumes each verified Ready Route answer replaced one manager interruption averaging ${metrics.minutes_per_answer_estimate} minutes. Actual savings may differ.</p>
    </div>`
  };
}

function createDriverHelpMonthlyReportService({ supabase, now = () => new Date(), sendEmail = defaultSendEmail } = {}) {
  async function run({ force = false } = {}) {
    const period = getPreviousUtcMonth(now());
    const { data: accounts, error: accountError } = await supabase
      .from('accounts')
      .select('id, company_name, manager_email, driver_help_monthly_report_enabled, driver_help_minutes_per_answer_estimate')
      .eq('driver_help_monthly_report_enabled', true);
    if (accountError) throw accountError;

    const results = [];
    for (const account of accounts || []) {
      const { data: managers, error: managerError } = await supabase
        .from('manager_users')
        .select('email, is_active, accepted_at')
        .eq('account_id', account.id)
        .eq('is_active', true);
      if (managerError) throw managerError;
      const recipients = [...new Set([
        account.manager_email,
        ...(managers || []).filter((manager) => manager.accepted_at).map((manager) => manager.email)
      ].filter(Boolean).map((email) => String(email).trim().toLowerCase()))];

      const [{ data: interactions, error: interactionError }, { data: feedback, error: feedbackError }] = await Promise.all([
        supabase.from('driver_help_interactions').select('id, session_id, driver_id, response_mode, created_at').eq('account_id', account.id).gte('created_at', period.start_iso).lt('created_at', period.end_iso),
        supabase.from('driver_help_feedback').select('id, interaction_id, driver_id, rating, created_at').eq('account_id', account.id).gte('created_at', period.start_iso).lt('created_at', period.end_iso)
      ]);
      if (interactionError || feedbackError) throw interactionError || feedbackError;
      const metrics = buildMetrics(interactions || [], feedback || [], Number(account.driver_help_minutes_per_answer_estimate || 5));

      for (const recipient of recipients) {
        const { data: prior, error: priorError } = await supabase
          .from('driver_help_monthly_report_deliveries')
          .select('id, delivery_status')
          .eq('account_id', account.id)
          .eq('report_month', period.report_month)
          .eq('recipient_email', recipient)
          .maybeSingle();
        if (priorError) throw priorError;
        if (prior?.delivery_status === 'sent' && !force) {
          results.push({ account_id: account.id, recipient, status: 'duplicate_skipped' });
          continue;
        }

        const message = buildMonthlyReportEmail({ companyName: account.company_name, monthLabel: period.label, metrics });
        let delivery;
        try {
          delivery = await sendEmail({ to: recipient, ...message });
        } catch (_error) {
          delivery = { delivered: false, skipped: false };
        }
        const status = delivery.delivered ? 'sent' : delivery.skipped ? 'skipped' : 'failed';
        const { error: deliveryError } = await supabase.from('driver_help_monthly_report_deliveries').upsert({
          account_id: account.id,
          report_month: period.report_month,
          recipient_email: recipient,
          metrics,
          delivery_status: status,
          provider_message_id: delivery.provider_id || null,
          delivered_at: delivery.delivered ? now().toISOString() : null,
          updated_at: now().toISOString()
        }, { onConflict: 'account_id,report_month,recipient_email' });
        if (deliveryError) throw deliveryError;
        results.push({ account_id: account.id, recipient, status });
      }
    }
    return { period, results };
  }

  return { run };
}

module.exports = {
  buildDriverMetrics,
  buildMetrics,
  buildMonthlyReportEmail,
  createDriverHelpMonthlyReportService,
  getPreviousUtcMonth,
  groupQuestionSituations
};
