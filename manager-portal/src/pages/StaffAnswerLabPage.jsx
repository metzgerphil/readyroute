import { useCallback, useEffect, useState } from 'react';
import useStaffReviewDraft from '../utils/useStaffReviewDraft';
import { useSearchParams } from 'react-router-dom';
import RraTestPage from './RraTestPage';
import StaffAnswerResult from '../components/StaffAnswerResult';
import { staffAnswerLab as call } from '../services/staffAnswerLab';
import { mayContinue, pendingRequest, ratingChoices } from '../utils/staffAnswerLab';
import '../styles/staff-answer-lab.css';

const usd = n => `$${(Number(n || 0) / 1e9).toFixed(4)}`;
function Rating({ label, value = {}, onChange }) {
  return <fieldset><legend>{label}</legend><label>Assessment<select required value={value.verdict || ''} onChange={e => onChange({ ...value, verdict: e.target.value })}><option value="">Choose an assessment</option>{ratingChoices.map(([v, text]) => <option value={v} key={v}>{text}</option>)}</select></label><label>Why? Include missing steps, wrong assumptions, or why it is complete.<textarea required maxLength={5000} value={value.notes || ''} onChange={e => onChange({ ...value, notes: e.target.value })} /></label></fieldset>;
}
function SaveReview({ kind, caseId, defaults = {}, onSaved }) {
  const [draft, setDraft] = useStaffReviewDraft(`rating:${kind}:${caseId}`, { ratings: {}, authority: defaults.authority || '', amendment: '', pending: null });
  const { ratings, authority, amendment } = draft;
  const change = (field, value) => setDraft(d => ({ ...d, [field]: value, pending: null }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const labels = kind === 'comparison' ? ['A', 'B'] : ['answer'];
  async function save(e) {
    e.preventDefault(); if (busy) return; setBusy(true); setMessage('');
    const request = draft.pending || { id: crypto.randomUUID(), kind, case_id: caseId, ratings, authority, amendment };
    setDraft(d => ({ ...d, pending: request }));
    try { await call('/reviews', request); setDraft(d => ({ ...d, pending: null })); setMessage('Saved permanently. Earlier reviews are preserved.'); onSaved?.(); }
    catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  return <form onSubmit={save}>{labels.map(label => <Rating key={label} label={label === 'answer' ? 'Review this answer' : `Answer ${label}`} value={ratings[label]} onChange={v => { change('ratings', { ...ratings, [label]: v }); }} />)}<label>Source or authority basis<textarea required maxLength={5000} value={authority} onChange={e => { change('authority', e.target.value); }} /></label><label>Correction to your earlier review or expected answer, if any<textarea maxLength={5000} value={amendment} onChange={e => { change('amendment', e.target.value); }} /></label><button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save review'}</button>{message && <p role="status">{message}</p>}</form>;
}
function LiveTest({ staff, refresh, readOnly }) {
  const key = `readyroute:staff-v2-pending:${staff.staff_user_id}`;
  const [pending, setPending] = useState(() => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } });
  const [question, setQuestion] = useState(pending?.question || '');
  const [result, setResult] = useState(null);
  const [session, setSession] = useState(pending?.session_id || null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [olderAvailable, setOlderAvailable] = useState(false);
  const loadHistory = useCallback(async () => { const rows = await call('/history'); setHistory(rows); setOlderAvailable(rows.length === 50); }, []);
  useEffect(() => { loadHistory().catch(e => setMessage(e.message)); }, [loadHistory]);
  function savePending(value) { setPending(value); if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key); }
  async function ask(e, override) {
    e?.preventDefault(); if (busy) return;
    const request = pendingRequest(override || question, session, pending, crypto.randomUUID());
    if (!request.question) return;
    savePending(request); setQuestion(request.question); setBusy(true); setMessage('');
    try {
      const answer = await call('/query', request); setResult(answer); setSession(answer.session_id); savePending(null); setQuestion('');
      if (['BUDGET_BLOCKED', 'TRAFFIC_BUSY', 'PROVIDER_QUOTA_EXHAUSTED'].includes(answer.verification_status)) setMessage('Live AI is paused or busy. No verified answer was produced for this request. Saved reviews remain available.');
      // The answer is already saved. Refreshing side panels must not hold the form
      // or turn a history/network failure into an apparent failed answer/retry.
      void Promise.all([loadHistory(), refresh()]).catch(() => setMessage('Your answer is saved. History or usage could not refresh; use Refresh or reload to try again.'));
    } catch (err) { setMessage(err.message + ' Use Retry to keep the same request and avoid repeating a completed AI check.'); }
    finally { setBusy(false); }
  }
  function newQuestion() { savePending(null); setQuestion(''); setSession(null); setResult(null); setMessage(''); }
  async function older() {
    try { const rows = await call('/history?before=' + encodeURIComponent(history.at(-1).created_at)); setHistory(h => [...h, ...rows]); setOlderAvailable(rows.length === 50); } catch (e) { setMessage(e.message); }
  }
  return <section>
    <h2>2.0 Test</h2><p>Ask new questions and follow-ups. Answers use the preserved 2.0 candidate and its approved source snapshot. Use fictional examples without customer names, addresses, or tracking numbers.</p>
    <form onSubmit={ask}><label>{session ? 'Follow-up for this situation' : 'Driver question'}<textarea required minLength={1} maxLength={500} value={question} disabled={busy || !!pending || readOnly} onChange={e => setQuestion(e.target.value)} /></label><div className="lab-actions"><button disabled={busy || readOnly || (!question.trim() && !pending)}>{busy ? 'Checking…' : pending ? 'Retry saved request' : session ? 'Send follow-up' : 'Ask 2.0'}</button><button disabled={busy} type="button" onClick={newQuestion}>Start a new situation</button></div></form>
    {pending && !busy && <p>A request is saved for retry. Starting a new situation discards this retry link; an unfinished check may already have used AI.</p>}
    {message && <p role="alert" className="lab-notice">{message}</p>}
    {result && <><p>{result.staff_test?.browser_received_ms ? `Response received in ${(result.staff_test.browser_received_ms / 1000).toFixed(1)} seconds.` : result.staff_test?.server_ms ? `Server processing: ${(result.staff_test.server_ms / 1000).toFixed(1)} seconds.` : 'Saved answer.'}{mayContinue(result) ? ' Continue above to resolve the remaining details.' : ''}</p><StaffAnswerResult result={result} />{!readOnly && <SaveReview key={result.interaction_id} kind="live" caseId={result.interaction_id} />}</>}
    <details><summary>Saved 2.0 history ({history.length} loaded)</summary><p>All completed answers remain saved. Select one to inspect or resume it; conversations expire for follow-up after 30 minutes.</p>{history.map(h => <button className="lab-history" key={h.request_id} onClick={() => { if (pending || busy) { setMessage('Finish or discard the pending request before opening another conversation.'); return; } setResult(h.response); setSession(h.session_id); setQuestion(''); }}>{new Date(h.created_at).toLocaleString()} · {h.question || h.response?.answer?.slice(0,100) || h.response?.clarification_prompt || 'Saved situation'}</button>)}{olderAvailable && <button onClick={older}>Load older answers</button>}</details>
  </section>;
}
function Comparison({ status, refresh, readOnly }) {
  const [id, setId] = useState(() => status.cases.find(c => !status.progress.reviewed.includes(c)) || status.cases[0]);
  const [c, setCase] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useStaffReviewDraft('expectations', {});
  const draft = drafts[id] || {};
  const expected = draft.answer || '', authority = draft.authority || '', qualifications = draft.qualifications || '', independent = draft.independent || false;
  const changeExpected = (field, value) => setDrafts(d => ({ ...d, [id]: { ...d[id], [field]: value } }));
  const loadCase = useCallback(async () => { const value = await call('/cases/' + id); setCase(value); }, [id]);
  useEffect(() => { let active = true; call('/cases/' + id).then(v => { if (active) setCase(v); }).catch(e => { if (active) setMessage(e.message); }); return () => { active = false; }; }, [id]);
  const ready = c?.id === id;
  async function reveal(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { const value = await call(`/cases/${id}/expected`, { answer: expected, authority, qualifications, independent }); setCase({ ...c, ...value }); await refresh(); }
    catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  function select(next) { setId(next); setMessage(''); }
  return <section><h2>Review A/B</h2><p>Saved comparison · {status.progress.reviewed.length} of 224 cases reviewed by you · no AI cost.</p><p>Record what a correct answer should say before seeing A/B. Labels vary by case; writing style may still suggest a version. These are synthetic test questions, not a public accuracy score. AI assistance does not count as independent operational approval.</p><label>Question<select disabled={busy} value={id} onChange={e => select(e.target.value)}>{status.cases.map(v => <option key={v}>{v}{/* Case IDs have no version mapping. */}</option>)}</select></label>
    {!ready ? <p>Loading comparison…</p> : <><ol>{c.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
      {!c.expected ? <form onSubmit={reveal}><label>Expected answer, required steps, exceptions, or necessary clarification<textarea required maxLength={5000} value={expected} onChange={e => changeExpected('answer', e.target.value)} /></label><label>Source or authority basis (or explain what still needs verification)<textarea required maxLength={5000} value={authority} onChange={e => changeExpected('authority', e.target.value)} /></label><label>Your operations experience or reviewer qualifications<textarea required maxLength={1000} value={qualifications} onChange={e => changeExpected('qualifications', e.target.value)} /></label><label className="lab-check"><input type="checkbox" checked={independent} onChange={e => changeExpected('independent', e.target.checked)} />I did not implement the answer systems or inspect these outputs before forming this expectation.</label><button disabled={busy || readOnly}>{busy ? 'Saving…' : 'Save expectation and reveal A/B'}</button></form> : <><details><summary>Your expectation, saved before reveal</summary><p className="lab-preserve">{c.expected.payload.answer}</p><p>{c.expected.payload.authority}</p><p>Saved {new Date(c.expected.created_at).toLocaleString()}</p></details><div className="lab-comparison">{['A', 'B'].map(label => <div key={label}><h3>Answer {label}</h3>{c.answers?.[label]?.map((t, i) => <div key={i}><p><strong>Turn {i+1}:</strong> {t.question}</p>{!t.available && <p className="lab-notice">The answer service was unavailable.</p>}<StaffAnswerResult result={t.result} frozen /></div>)}</div>)}</div>{!readOnly && <SaveReview key={id} kind="comparison" caseId={id} defaults={c.expected.payload} onSaved={() => { refresh(); loadCase(); }} />}{!!c.reviews?.length && <details><summary>Saved review history ({c.reviews.length})</summary>{c.reviews.map(r => <div key={r.id}><p>{new Date(r.created_at).toLocaleString()}</p><pre className="lab-raw">{JSON.stringify(r.payload, null, 2)}</pre></div>)}</details>}<button onClick={() => select(status.cases[(status.cases.indexOf(id) + 1) % status.cases.length])}>Next case</button></>}
    </>}{message && <p role="alert">{message}</p>}</section>;
}
function Sources() {
  const [rows, setRows] = useState(null), [search, setSearch] = useState(''), [error, setError] = useState('');
  async function load(e) { if (e.currentTarget.open && !rows) try { setRows(await call('/sources')); } catch (err) { setError(err.message); } }
  return <details onToggle={load}><summary>Approved source records for review</summary><p>These are the 60 source records selected for the frozen comparison. Missing authority must be referred for review.</p><label>Find a source<input value={search} onChange={e => setSearch(e.target.value)} /></label>{error && <p>{error}</p>}{rows && Object.entries(rows).filter(([id, row]) => (id + ' ' + (row.canonical_situation || '') + ' ' + row.authoritative_rule).toLowerCase().includes(search.toLowerCase())).map(([id, row]) => <details key={id}><summary>{id} · version {row.version}</summary><pre className="lab-raw">{JSON.stringify(row, null, 2)}</pre></details>)}</details>;
}
export default function StaffAnswerLabPage() {
  const [params, setParams] = useSearchParams();
  const mode = ['current', 'v2', 'review'].includes(params.get('mode')) ? params.get('mode') : 'current';
  const [status, setStatus] = useState(null), [error, setError] = useState('');
  const refresh = useCallback(async () => { const value = await call('/status'); setStatus(value); setError(''); }, []);
  useEffect(() => { let active = true; call('/status').then(value => { if (active) setStatus(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  async function download() { try { const data = await call('/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'ready-route-staff-reviews.json'; a.click(); URL.revokeObjectURL(url); } catch (e) { setError(e.message); } }
  const readOnly = status?.staff.staff_role === 'read_only';
  return <div className="staff-answer-lab"><header><h1>Ready Route answer testing</h1><p>Staff testing and review. The driver application continues to use Current 1.0.</p></header><nav className="lab-tabs" aria-label="Answer testing mode">{[['current','Current 1.0'],['v2','2.0 Test'],['review','Review A/B']].map(([v,label]) => <button aria-pressed={mode === v} key={v} onClick={() => setParams({ mode: v })}>{label}</button>)}</nav>
    {status && <aside className="lab-budget">2.0 pilot AI cap: {usd(status.budget.ceiling_nano)} · used {usd(status.budget.spent_nano)} · reserved {usd(status.budget.held_nano)}.{status.budget.stopped ? ' Live AI paused.' : ''} Saved A/B review is free. This cap covers 2.0 staff AI only; Current 1.0 uses its existing service. <button onClick={() => refresh().catch(e => setError(e.message))}>Refresh</button></aside>}
    {error && <p role="alert">{error} <button onClick={() => refresh().catch(e => setError(e.message))}>Retry connection</button></p>}
    <div hidden={mode !== 'current'}><RraTestPage allowFeedback={false} apiBase="/staff/driver-help" /></div>
    {status && <><div hidden={mode !== 'v2'}><LiveTest key={status.staff.staff_user_id} staff={status.staff} readOnly={readOnly} refresh={refresh} /></div><div hidden={mode !== 'review'}><Comparison key={status.staff.staff_user_id} status={status} refresh={refresh} readOnly={readOnly} /></div><Sources /><button onClick={download}>Download my saved reviews</button></>}
    {!status && mode !== 'current' && !error && <p>Connecting to staff testing…</p>}
  </div>;
}
