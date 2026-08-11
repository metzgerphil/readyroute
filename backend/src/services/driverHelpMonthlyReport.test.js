const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMetrics, buildMonthlyReportEmail, getPreviousUtcMonth } = require('./driverHelpMonthlyReport');

test('monthly report computes helpfulness only among rated answers and labels time as an estimate', () => {
  const metrics = buildMetrics(
    [{ response_mode: 'ANSWER' }, { response_mode: 'ANSWER' }, { response_mode: 'CLARIFY' }, { response_mode: 'ESCALATE' }],
    [{ rating: 'up' }, { rating: 'down' }],
    5
  );
  assert.equal(metrics.total_questions, 4);
  assert.equal(metrics.verified_answers, 2);
  assert.equal(metrics.helpful_rate, 0.5);
  assert.equal(metrics.estimated_manager_minutes_avoided, 10);
  const email = buildMonthlyReportEmail({ companyName: 'Example Co', monthLabel: 'July 2026', metrics });
  assert.match(email.html, /estimate, not measured time savings/i);
  assert.match(email.html, /5 minutes/i);
});

test('previous month uses exact UTC boundaries', () => {
  assert.deepEqual(getPreviousUtcMonth(new Date('2026-08-11T18:00:00Z')), {
    report_month: '2026-07-01',
    start_iso: '2026-07-01T00:00:00.000Z',
    end_iso: '2026-08-01T00:00:00.000Z',
    label: 'July 2026'
  });
});
