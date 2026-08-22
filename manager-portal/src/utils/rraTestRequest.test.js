import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRraTestQueryRequest } from './rraTestRequest.js';

test('staff RRA console uses the staff query endpoint and carries ephemeral context', () => {
  const sessionContext = { previous_question: 'Earlier staff test' };
  assert.deepEqual(buildRraTestQueryRequest({
    apiBase: '/staff/driver-help',
    question: 'What should I do?',
    sessionContext
  }), {
    url: '/staff/driver-help/query',
    body: {
      question: 'What should I do?',
      session_context: sessionContext
    }
  });
});

test('manager RRA console keeps its persisted session endpoint', () => {
  assert.deepEqual(buildRraTestQueryRequest({
    question: 'What should I do?',
    sessionId: 'manager-session'
  }), {
    url: '/manager/driver-help/query',
    body: {
      question: 'What should I do?',
      session_id: 'manager-session'
    }
  });
});
