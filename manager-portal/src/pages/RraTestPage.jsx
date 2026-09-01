import { lazy, Suspense, useEffect, useState } from 'react';

import api from '../services/api';
import {
  appendRraTestLogEntry,
  buildRraTestLogEntry,
  formatRraTestLog,
  summarizeRraTestLogEntry
} from '../utils/rraTestLog';
import { buildRraTestQueryRequest } from '../utils/rraTestRequest';

const WebVehicleBarcode = lazy(() => import('../components/WebVehicleBarcode'));

const TEST_HISTORY_STORAGE_KEY = 'readyroute:rra-test-history:v1';

function percent(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : '—';
}

function answerStructure(result) {
  const structure = result?.answer_structure || {};
  return {
    directAnswer: structure.direct_answer || result?.answer || '',
    steps: Array.isArray(structure.steps) ? structure.steps : [],
    watchFor: structure.watch_for || '',
    procedureSteps: Array.isArray(structure.procedure_steps) ? structure.procedure_steps : [],
    documentation: Array.isArray(structure.documentation) ? structure.documentation : [],
    prohibitedActions: Array.isArray(structure.prohibited_actions) ? structure.prohibited_actions : [],
    escalationRequirements: Array.isArray(structure.escalation_requirements)
      ? structure.escalation_requirements
      : []
  };
}

function loadTestHistory() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(TEST_HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
}

export default function RraTestPage({ apiBase = '/manager/driver-help', allowFeedback = true }) {
  const [question, setQuestion] = useState('');
  const [situationQuestion, setSituationQuestion] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [sessionContext, setSessionContext] = useState(null);
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  const [testHistory, setTestHistory] = useState(loadTestHistory);
  const [copyStatus, setCopyStatus] = useState('');
  const structure = answerStructure(result);
  const shadow = result?.interpretation_result || {};
  const isFollowUp = result?.response_mode === 'CLARIFY';
  const isVehicleBarcodeWorkflow = result?.answer_type === 'VEHICLE_BARCODE';
  const minimumQuestionLength = isVehicleBarcodeWorkflow && isFollowUp ? 1 : 2;

  useEffect(() => {
    window.sessionStorage.setItem(TEST_HISTORY_STORAGE_KEY, JSON.stringify(testHistory));
  }, [testHistory]);

  async function askQuestion(event, overrideQuestion = null) {
    event?.preventDefault?.();
    const nextQuestion = String(overrideQuestion || question).trim();
    if (nextQuestion.length < minimumQuestionLength || isSubmitting) return;

    setQuestion(nextQuestion);
    if (!sessionId && !sessionContext) setSituationQuestion(nextQuestion);
    setIsSubmitting(true);
    setError('');
    setFeedback(null);
    setShowMore(false);
    try {
      const request = buildRraTestQueryRequest({
        apiBase,
        question: nextQuestion,
        sessionId,
        sessionContext
      });
      const response = await api.post(request.url, request.body);
      setResult(response.data || null);
      setSessionId(response.data?.session_id || sessionId);
      setSessionContext(response.data?.session_context || sessionContext);
      setTestHistory((entries) => appendRraTestLogEntry(
        entries,
        buildRraTestLogEntry(nextQuestion, response.data || {})
      ));
      if (response.data?.response_mode === 'CLARIFY') setQuestion('');
      setCopyStatus('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Ready Route Answers could not check the knowledge records right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function sendFeedback(rating) {
    if (!result?.interaction_id || feedback || isSubmitting) return;
    setFeedback(rating);
    try {
      await api.post(`${apiBase}/interactions/${result.interaction_id}/feedback`, { rating });
    } catch {
      setFeedback(null);
      setError('Feedback could not be saved. The test answer is still available.');
    }
  }

  function newSituation() {
    setQuestion('');
    setSituationQuestion('');
    setSessionId(null);
    setSessionContext(null);
    setResult(null);
    setShowMore(false);
    setFeedback(null);
    setError('');
  }

  async function copyTestLog(entries, successMessage) {
    try {
      await copyTextToClipboard(formatRraTestLog(entries));
      setCopyStatus(successMessage);
    } catch {
      setCopyStatus('Copy failed. Select the test details below and copy them manually.');
    }
  }

  function clearTestLog() {
    setTestHistory([]);
    setCopyStatus('Test log cleared.');
  }

  return (
    <main className="page rra-test-page">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Ready Route Answers</div>
          <h1>RRA Test Console</h1>
          <p>Ask a question the way a driver would. AI may interpret the wording, but every answer stays locked to a published Ready Route record.</p>
        </div>
        {result ? <button className="secondary-button" onClick={newSituation} type="button">New situation</button> : null}
      </div>

      <section className="page-card rra-test-question-card">
        <form onSubmit={askQuestion}>
          <label htmlFor="rra-test-question">{isFollowUp ? 'Your follow-up answer' : 'Driver question'}</label>
          {isFollowUp ? (
            <div className="rra-test-situation-summary">
              <strong>Original driver situation</strong>
              <p>{situationQuestion}</p>
              <span>Answer only the requested detail below. Ready Route will keep the original situation and earlier answers.</span>
            </div>
          ) : null}
          <textarea
            autoFocus
            id="rra-test-question"
            maxLength={500}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={isFollowUp
              ? (isVehicleBarcodeWorkflow
                ? 'Enter the vehicle number.'
                : 'Type the requested detail here, such as: 2387, yes, or no advance notice.')
              : 'Example: The pickup was canceled before I went there. What code do I use?'}
            rows={4}
            value={question}
          />
          <div className="rra-test-form-footer">
            <span>{question.length}/500</span>
            <button className="primary-cta" disabled={isSubmitting || question.trim().length < minimumQuestionLength} type="submit">
              {isSubmitting ? 'Checking approved records…' : isFollowUp ? 'Send follow-up' : 'Ask Ready Route'}
            </button>
          </div>
        </form>
      </section>

      {error ? <div className="page-card warning-card" role="alert">{error}</div> : null}

      {result?.response_mode === 'ANSWER' ? (
        <div className="rra-test-results-grid">
          <section className="page-card rra-driver-answer-card">
            <div className="rra-card-kicker">Driver sees this</div>
            <h2>Answer</h2>
            <p className="rra-direct-answer">{structure.directAnswer}</p>

            {result.barcode ? (
              <Suspense fallback={<p role="status">Preparing vehicle barcode…</p>}>
                <WebVehicleBarcode barcode={result.barcode} />
              </Suspense>
            ) : null}

            {structure.steps.length ? (
              <div className="rra-answer-section">
                <h3>Do this</h3>
                <ol>{structure.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              </div>
            ) : null}

            {structure.watchFor ? (
              <div className="rra-watch-for">
                <h3>Watch for</h3>
                <p>{structure.watchFor}</p>
              </div>
            ) : null}

            {result.more_info || structure.procedureSteps.length || structure.documentation.length
              || structure.prohibitedActions.length || structure.escalationRequirements.length ? (
                <div className="rra-more-info">
                  <button className="text-button" onClick={() => setShowMore((value) => !value)} type="button">
                    {showMore ? 'Hide More Info' : 'More Info'}
                  </button>
                  {showMore ? (
                    <div className="rra-more-info-content">
                      {result.more_info ? <p>{result.more_info}</p> : null}
                      {structure.procedureSteps.length ? <><h4>Full procedure</h4><ol>{structure.procedureSteps.map((step) => <li key={step}>{step}</li>)}</ol></> : null}
                      {structure.documentation.length ? <><h4>Documentation</h4><ul>{structure.documentation.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
                      {structure.prohibitedActions.length ? <><h4>Do not</h4><ul>{structure.prohibitedActions.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
                      {structure.escalationRequirements.length ? <><h4>Escalation</h4><ul>{structure.escalationRequirements.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
                      <h4>Knowledge trace</h4>
                      <p>{(result.trace || []).map((item) => `${item.knowledge_id} v${item.canonical_version}`).join(', ') || 'No knowledge record selected.'}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

            {allowFeedback && result.interaction_id ? <div className="rra-feedback-row">
              <span>Was this the right driver answer?</span>
              <button className={feedback === 'up' ? 'selected' : ''} disabled={Boolean(feedback)} onClick={() => sendFeedback('up')} type="button">Yes</button>
              <button className={feedback === 'down' ? 'selected' : ''} disabled={Boolean(feedback)} onClick={() => sendFeedback('down')} type="button">No</button>
            </div> : null}
          </section>

          <section className="page-card rra-shadow-card">
            <div className="rra-card-kicker purple">Internal test only</div>
            <h2>Grounded AI interpretation</h2>
            {['AI_SHADOW', 'GROUNDED_AI'].includes(result.interpretation_mode) ? (
              <dl className="rra-shadow-details">
                <div><dt>Mode</dt><dd>{result.interpretation_mode === 'GROUNDED_AI' ? 'Active in test console' : 'Shadow only'}</dd></div>
                <div><dt>Proposed record</dt><dd>{shadow.proposed_knowledge_id || 'None'}</dd></div>
                <div><dt>Proposed result</dt><dd>{shadow.proposed_response_mode || 'None'}</dd></div>
                <div><dt>Confidence</dt><dd>{percent(shadow.confidence)}</dd></div>
                <div><dt>Record agreement</dt><dd className={shadow.record_agreement ? 'match' : 'different'}>{shadow.record_agreement ? 'Match' : 'Different'}</dd></div>
                <div><dt>Answer/clarify agreement</dt><dd className={shadow.response_mode_agreement ? 'match' : 'different'}>{shadow.response_mode_agreement ? 'Match' : 'Different'}</dd></div>
                <div><dt>AI response time</dt><dd>{Number.isFinite(shadow.latency_ms) ? `${shadow.latency_ms} ms` : '—'}</dd></div>
              </dl>
            ) : ['AI_SHADOW_FALLBACK', 'DETERMINISTIC_FALLBACK'].includes(result.interpretation_mode) ? (
              <div className="rra-shadow-status warning">AI did not produce an active grounded selection. Ready Route used only a narrow deterministic rule where one was explicitly available.</div>
            ) : (
              <div className="rra-shadow-status">This question matched an exact data-authored rule, so AI interpretation was not needed.</div>
            )}
            <p className="rra-shadow-note">AI can select a published record in this test console, but it cannot write or alter the answer, steps, codes, or warnings.</p>
          </section>
        </div>
      ) : null}

      {result?.response_mode === 'CLARIFY' ? (
        <section className="page-card rra-clarify-card">
          <div className="rra-card-kicker">Ready Route needs one detail</div>
          <h2>{result.clarification_prompt}</h2>
          {(result.clarification_options || []).length ? (
            <div className="rra-clarification-options">
              {result.clarification_options.map((option) => (
                <button key={`${option.knowledge_id}-${option.label}`} onClick={(event) => askQuestion(event, option.query || option.label)} type="button">
                  {option.label}
                </button>
              ))}
            </div>
          ) : <p>Enter your answer in the same box above, then select Send follow-up.</p>}
        </section>
      ) : null}

      {result?.response_mode === 'ESCALATE' ? (
        <section className="page-card warning-card">
          <h2>No approved answer</h2>
          <p>{result.escalation_message}</p>
          {result.interpretation_mode === 'AI_FAIL_CLOSED' ? (
            <p><strong>Safety check:</strong> Grounded AI found no safe matching record, so Ready Route did not display a fuzzy fallback answer.</p>
          ) : null}
        </section>
      ) : null}

      {testHistory.length ? (
        <section className="page-card rra-test-history-card">
          <div className="rra-test-history-heading">
            <div>
              <div className="rra-card-kicker">Testing workspace</div>
              <h2>Running test log</h2>
              <p>{testHistory.length} question{testHistory.length === 1 ? '' : 's'} saved in this browser tab.</p>
            </div>
            <div className="rra-test-history-actions">
              <button
                className="secondary-button"
                onClick={() => copyTestLog([testHistory[testHistory.length - 1]], 'Latest result copied.')}
                type="button"
              >
                Copy latest result
              </button>
              <button
                className="primary-cta"
                onClick={() => copyTestLog(testHistory, 'Full test log copied.')}
                type="button"
              >
                Copy full test log
              </button>
              <button className="text-button" onClick={clearTestLog} type="button">Clear log</button>
            </div>
          </div>
          {copyStatus ? <p className="rra-copy-status" role="status">{copyStatus}</p> : null}
          <ol className="rra-test-history-list">
            {[...testHistory].reverse().map((entry, index) => (
              <li key={`${entry.recorded_at}-${entry.diagnostics?.interaction_id || index}`}>
                <div className="rra-test-history-item-heading">
                  <strong>{entry.question}</strong>
                  <span>{entry.response_mode || 'UNKNOWN'}</span>
                </div>
                <p>{summarizeRraTestLogEntry(entry)}</p>
                <details>
                  <summary>View diagnostic details</summary>
                  <pre>{formatRraTestLog([entry], entry.recorded_at)}</pre>
                </details>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
