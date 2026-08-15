import { useState } from 'react';

import api from '../services/api';

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

export default function RraTestPage() {
  const [question, setQuestion] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  const structure = answerStructure(result);
  const shadow = result?.interpretation_result || {};

  async function askQuestion(event, overrideQuestion = null) {
    event?.preventDefault?.();
    const nextQuestion = String(overrideQuestion || question).trim();
    if (nextQuestion.length < 2 || isSubmitting) return;

    setQuestion(nextQuestion);
    setIsSubmitting(true);
    setError('');
    setFeedback(null);
    setShowMore(false);
    try {
      const response = await api.post('/manager/driver-help/query', {
        question: nextQuestion,
        ...(sessionId ? { session_id: sessionId } : {})
      });
      setResult(response.data || null);
      setSessionId(response.data?.session_id || sessionId);
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
      await api.post(`/manager/driver-help/interactions/${result.interaction_id}/feedback`, { rating });
    } catch {
      setFeedback(null);
      setError('Feedback could not be saved. The test answer is still available.');
    }
  }

  function newSituation() {
    setQuestion('');
    setSessionId(null);
    setResult(null);
    setShowMore(false);
    setFeedback(null);
    setError('');
  }

  return (
    <main className="page rra-test-page">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Ready Route Answers</div>
          <h1>RRA Test Console</h1>
          <p>Ask a question the way a driver would. The driver answer stays deterministic while AI runs in shadow mode.</p>
        </div>
        {result ? <button className="secondary-button" onClick={newSituation} type="button">New situation</button> : null}
      </div>

      <section className="page-card rra-test-question-card">
        <form onSubmit={askQuestion}>
          <label htmlFor="rra-test-question">Driver question</label>
          <textarea
            autoFocus
            id="rra-test-question"
            maxLength={500}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Example: The pickup was canceled before I went there. What code do I use?"
            rows={4}
            value={question}
          />
          <div className="rra-test-form-footer">
            <span>{question.length}/500</span>
            <button className="primary-cta" disabled={isSubmitting || question.trim().length < 2} type="submit">
              {isSubmitting ? 'Checking approved records…' : 'Ask Ready Route'}
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

            <div className="rra-feedback-row">
              <span>Was this the right driver answer?</span>
              <button className={feedback === 'up' ? 'selected' : ''} disabled={Boolean(feedback)} onClick={() => sendFeedback('up')} type="button">Yes</button>
              <button className={feedback === 'down' ? 'selected' : ''} disabled={Boolean(feedback)} onClick={() => sendFeedback('down')} type="button">No</button>
            </div>
          </section>

          <section className="page-card rra-shadow-card">
            <div className="rra-card-kicker purple">Internal test only</div>
            <h2>AI shadow check</h2>
            {result.interpretation_mode === 'AI_SHADOW' ? (
              <dl className="rra-shadow-details">
                <div><dt>Proposed record</dt><dd>{shadow.proposed_knowledge_id || 'None'}</dd></div>
                <div><dt>Proposed result</dt><dd>{shadow.proposed_response_mode || 'None'}</dd></div>
                <div><dt>Confidence</dt><dd>{percent(shadow.confidence)}</dd></div>
                <div><dt>Record agreement</dt><dd className={shadow.record_agreement ? 'match' : 'different'}>{shadow.record_agreement ? 'Match' : 'Different'}</dd></div>
                <div><dt>Answer/clarify agreement</dt><dd className={shadow.response_mode_agreement ? 'match' : 'different'}>{shadow.response_mode_agreement ? 'Match' : 'Different'}</dd></div>
                <div><dt>AI response time</dt><dd>{Number.isFinite(shadow.latency_ms) ? `${shadow.latency_ms} ms` : '—'}</dd></div>
              </dl>
            ) : result.interpretation_mode === 'AI_SHADOW_FALLBACK' ? (
              <div className="rra-shadow-status warning">The AI returned no valid shadow result. The driver answer was unaffected.</div>
            ) : (
              <div className="rra-shadow-status">This question matched an exact data-authored rule, so AI interpretation was not needed.</div>
            )}
            <p className="rra-shadow-note">Shadow results never change the driver answer on this page.</p>
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
          ) : <p>Enter the missing detail in the question box above and ask again.</p>}
        </section>
      ) : null}

      {result?.response_mode === 'ESCALATE' ? (
        <section className="page-card warning-card">
          <h2>No approved answer</h2>
          <p>{result.escalation_message}</p>
        </section>
      ) : null}
    </main>
  );
}
