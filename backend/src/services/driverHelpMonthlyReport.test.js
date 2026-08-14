const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDriverMetrics,
  buildMetrics,
  buildMonthlyReportEmail,
  getPreviousUtcMonth
} = require('./driverHelpMonthlyReport');

test('monthly report computes helpfulness only among rated answers and labels time as an estimate', () => {
  const metrics = buildMetrics(
    [{ response_mode: 'ANSWER' }, { response_mode: 'ANSWER' }, { response_mode: 'CLARIFY' }, { response_mode: 'ESCALATE' }],
    [{ rating: 'up' }, { rating: 'down' }],
    5
  );
  assert.equal(metrics.total_questions, 4);
  assert.equal(metrics.verified_answers, 2);
  assert.equal(metrics.failed_questions, 1);
  assert.equal(metrics.success_rate, 0.5);
  assert.equal(metrics.helpful_rate, 0.5);
  assert.equal(metrics.estimated_manager_minutes_avoided, 10);
  const email = buildMonthlyReportEmail({ companyName: 'Example Co', monthLabel: 'July 2026', metrics });
  assert.match(email.html, /estimate, not measured time savings/i);
  assert.match(email.html, /5 minutes/i);
});

test('question success is measured by situation so clarification turns do not inflate volume', () => {
  const interactions = [
    { id: '1', session_id: 'session-1', driver_id: 'driver-1', response_mode: 'CLARIFY' },
    { id: '2', session_id: 'session-1', driver_id: 'driver-1', response_mode: 'ANSWER' },
    { id: '3', session_id: 'session-2', driver_id: 'driver-1', response_mode: 'ESCALATE' },
    { id: '4', session_id: 'session-3', driver_id: 'driver-2', response_mode: 'CLARIFY' }
  ];
  const feedback = [
    { interaction_id: '2', driver_id: 'driver-1', rating: 'up' },
    { interaction_id: 'prior-month-answer', driver_id: 'driver-1', rating: 'down' }
  ];
  const metrics = buildMetrics(interactions, feedback, 5);
  const drivers = buildDriverMetrics(interactions, feedback, [
    { id: 'driver-1', name: 'Driver One' },
    { id: 'driver-2', name: 'Driver Two' }
  ]);

  assert.equal(metrics.total_questions, 3);
  assert.equal(metrics.total_interactions, 4);
  assert.equal(metrics.verified_answers, 1);
  assert.equal(metrics.failed_questions, 1);
  assert.equal(metrics.clarification_only_questions, 1);
  assert.equal(metrics.success_rate, 1 / 3);
  assert.equal(metrics.feedback_response_rate, 1);
  assert.equal(metrics.helpful_rate, 1);
  assert.deepEqual(drivers.map((driver) => ({
    name: driver.driver_name,
    questions: driver.total_questions,
    success_rate: driver.success_rate
  })), [
    { name: 'Driver One', questions: 2, success_rate: 0.5 },
    { name: 'Driver Two', questions: 1, success_rate: 0 }
  ]);
});

test('previous month uses exact UTC boundaries', () => {
  assert.deepEqual(getPreviousUtcMonth(new Date('2026-08-11T18:00:00Z')), {
    report_month: '2026-07-01',
    start_iso: '2026-07-01T00:00:00.000Z',
    end_iso: '2026-08-01T00:00:00.000Z',
    label: 'July 2026'
  });
});
