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
    try { await call('/reviews', request); setDraft(d => ({ ...d, pending: null })); setMessage('Saved to the shared review queue. No email or file upload is needed. Earlier reviews are preserved.'); onSaved?.(); }
    catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  return <form onSubmit={save}>{labels.map(label => <Rating key={label} label={label === 'answer' ? 'Review this answer' : `Answer ${label}`} value={ratings[label]} onChange={v => { change('ratings', { ...ratings, [label]: v }); }} />)}<label>Source or authority basis (your personally confirmed field procedure can be a source)<textarea required maxLength={5000} value={authority} onChange={e => { change('authority', e.target.value); }} /></label><label>Correction to your earlier review or expected answer, if any<textarea maxLength={5000} value={amendment} onChange={e => { change('amendment', e.target.value); }} /></label><button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save review'}</button>{message && <p role="status">{message}</p>}</form>;
}
function LiveTest({ staff, refresh, readOnly, version }) {
  const key = `readyroute:staff-${version}-pending:${staff.staff_user_id}`;
  const [pending, setPending] = useState(() => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } });
  const [question, setQuestion] = useState(pending?.question || '');
  const [result, setResult] = useState(null);
  const [session, setSession] = useState(pending?.session_id || null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [reviewVersion, setReviewVersion] = useState(0);
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
    <h2>Ready Route {version} testing</h2><p>Ask new questions and follow-ups using the staff answering engine. Completed tests and submitted reviews are saved for follow-through. Use fictional examples without customer names, addresses, or tracking numbers.</p>
    <form onSubmit={ask}><label>{session ? 'Follow-up for this situation' : 'Driver question'}<textarea required minLength={1} maxLength={500} value={question} disabled={busy || !!pending || readOnly} onChange={e => setQuestion(e.target.value)} /></label><div className="lab-actions"><button disabled={busy || readOnly || (!question.trim() && !pending)}>{busy ? 'Checking…' : pending ? 'Retry saved request' : session ? 'Send follow-up' : `Ask ${version}`}</button><button disabled={busy} type="button" onClick={newQuestion}>Start a new situation</button></div></form>
    {pending && !busy && <p>A request is saved for retry. Starting a new situation discards this retry link; an unfinished check may already have used AI.</p>}
    {message && <p role="alert" className="lab-notice">{message}</p>}
    {result && <><p>{result.staff_test?.browser_received_ms ? `Response received in ${(result.staff_test.browser_received_ms / 1000).toFixed(1)} seconds.` : result.staff_test?.server_ms ? `Server processing: ${(result.staff_test.server_ms / 1000).toFixed(1)} seconds.` : 'Saved answer.'}{mayContinue(result) ? ' Continue above to resolve the remaining details.' : ''}</p><StaffAnswerResult result={result} onClarification={value => ask(null, value)} disabled={busy || !!pending || readOnly} />{!readOnly && <SaveReview key={result.interaction_id} kind="live" caseId={result.interaction_id} onSaved={() => { setReviewVersion(v => v + 1); }} />}</>}
    <ReviewQueue staff={staff} version={reviewVersion} readOnly={readOnly} onRetest={q => { if (pending || busy) { setMessage('Finish or discard the pending request first.'); return; } newQuestion(); setQuestion(q); }} />
    <details><summary>Saved answer history ({history.length} loaded)</summary><p>All completed answers remain saved. Select one to inspect or resume it; conversations expire for follow-up after 30 minutes.</p>{history.map(h => <button className="lab-history" key={h.request_id} onClick={() => { if (pending || busy) { setMessage('Finish or discard the pending request before opening another conversation.'); return; } setResult(h.response); setSession(h.session_id); setQuestion(''); }}>{new Date(h.created_at).toLocaleString()} · {h.response?.answering_version || h.response?.interpretation_result?.answering_version || '2.0'} · {h.question || h.response?.answer?.slice(0,100) || h.response?.clarification_prompt || 'Saved situation'}</button>)}{olderAvailable && <button onClick={older}>Load older answers</button>}</details>
  </section>;
}
const reviewStatuses = { NEW: 'New', IN_REVIEW: 'Being reviewed', NEEDS_CLARIFICATION: 'Needs your clarification', FIXED_TESTED: 'Fixed and tested', READY_TO_RETEST: 'Ready to retest', VERIFIED: 'Verified', REOPENED: 'Reopened' };
function ReviewQueue({ staff, version, readOnly, onRetest }) {
  const [rows, setRows] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [more, setMore] = useState(false);
  const load = useCallback(async () => { setBusy(true); try { const data = await call('/review-queue'); setRows(data); setMore(data.length === 100); setError(''); } catch (e) { setError(e.message); } finally { setBusy(false); } }, []);
  useEffect(() => { void load(); }, [load, version]);
  async function older() { setBusy(true); try { const last = rows.at(-1); const data = await call('/review-queue?before=' + encodeURIComponent(last.created_at) + '&before_id=' + last.id); setRows(r => [...r, ...data]); setMore(data.length === 100); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <section className="lab-review-queue"><h2>Review progress</h2><p>Save your review here; no email or Markdown file is needed. Your original question, answer and review stay saved. Follow-up checks run on a schedule while the review computer is available; saving does not immediately change a live answer.</p><button disabled={busy} onClick={load}>Refresh review progress</button>{error && <p role="alert">{error}</p>}{!rows.length && !busy && !error && <p>No submitted reviews yet.</p>}
    {rows.map(r => { const latest = r.events.at(-1); return <details key={r.id}><summary>{reviewStatuses[latest?.status || 'NEW']} · {r.question || r.case_id} · {new Date(r.created_at).toLocaleString()}</summary>
      <p>Reviewer: {r.payload.identity?.staff_name || r.payload.identity?.name || r.payload.identity?.full_name || 'Staff reviewer'}</p>
      {Object.entries(r.payload.ratings || {}).map(([key, v]) => <p key={key}><strong>{key}: {v.verdict}</strong><br />{v.notes}</p>)}<p><strong>Authority:</strong> {r.payload.authority}</p>{r.payload.amendment && <p><strong>Correction:</strong> {r.payload.amendment}</p>}
      {r.events.map(e => <div key={e.id}><p><strong>{reviewStatuses[e.status]}</strong> · {new Date(e.created_at).toLocaleString()} · {e.actor.name}</p><p className="lab-preserve">{e.note}</p>{e.evidence && <p>Verification: {e.evidence}</p>}{e.release && <p>Tested version: {e.release}</p>}</div>)}
      {r.conversation?.length > 1 && <div><strong>Original conversation, in order</strong><ol>{r.conversation.map((turn, i) => <li key={i}>{turn.question}</li>)}</ol><p>For a follow-up issue, repeat the conversation in order rather than testing only the final reply.</p></div>}
      {r.response && <details><summary>Original saved answer</summary><StaffAnswerResult result={r.response} frozen /></details>}
      {r.kind === 'live' && r.question && <button onClick={() => onRetest(r.conversation?.[0]?.question || r.question)}>{r.conversation?.length > 1 ? 'Start a new test from the opening question' : 'Put this question in a new test'}</button>}
      {r.kind === 'live' && r.staff_id === staff.staff_user_id && !readOnly && <details><summary>Add clarification or correct this review</summary><SaveReview kind="live" caseId={r.case_id} onSaved={load} /></details>}
    </details>; })}{more && <button disabled={busy} onClick={older}>Load older reviews</button>}
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
  const mode = ['current', 'v2', 'review'].includes(params.get('mode')) ? params.get('mode') : 'v2';
  const [status, setStatus] = useState(null), [error, setError] = useState('');
  const refresh = useCallback(async () => { const value = await call('/status'); setStatus(value); setError(''); }, []);
  useEffect(() => { let active = true; call('/status').then(value => { if (active) setStatus(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  async function download() { try { const data = await call('/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'ready-route-staff-reviews.json'; a.click(); URL.revokeObjectURL(url); } catch (e) { setError(e.message); } }
  const version = status?.answering?.version || '2.0';
  const readOnly = status?.staff.staff_role === 'read_only';
  return <div className="staff-answer-lab"><header><h1>Ready Route answer testing</h1><p>Test answers and send feedback directly to the Ready Route review queue. Staff testing uses Ready Route {version}.</p></header><nav className="lab-tabs" aria-label="Answer testing mode">{[['v2',`Test ${version}`],['current','Legacy 1.0'],['review','Saved A/B comparison']].map(([v,label]) => <button aria-pressed={mode === v} key={v} onClick={() => setParams({ mode: v })}>{label}</button>)}</nav>
    {status && <aside className="lab-budget">Staff AI allowance: {usd(status.budget.ceiling_nano)} · available {usd(Math.max(0, status.budget.ceiling_nano - status.budget.spent_nano - status.budget.held_nano))} · used {usd(status.budget.spent_nano)} · reserved {usd(status.budget.held_nano)}.{status.budget.stopped ? ' Live AI paused.' : ''} Saved A/B review is free. This allowance covers staff testing; Legacy 1.0 uses its existing service. <button onClick={() => refresh().catch(e => setError(e.message))}>Refresh</button></aside>}
    {status && <p role="status">{status.answering?.version === '2.5' ? `Ready Route 2.5 is available for staff testing. Updated ${new Date(status.answering.released_at).toLocaleString()}.` : status.alignment?.state === 'matched' ? 'Phone engine match checked. Staff tests use separate saved history and the staff AI allowance.' : status.alignment?.state === 'different' ? 'The phone engine has changed since this staff release. Alignment needs review; saved feedback remains available.' : 'The phone engine match could not be checked right now. Saved feedback remains available.'}</p>}
    {error && <p role="alert">{error} <button onClick={() => refresh().catch(e => setError(e.message))}>Retry connection</button></p>}
    <div hidden={mode !== 'current'}><p>Legacy comparison only. This log is saved in this browser tab. Use Test {version} to submit shared reviews.</p><RraTestPage allowFeedback={false} apiBase="/staff/driver-help" /></div>
    {status && <><div hidden={mode !== 'v2'}><LiveTest version={version} key={status.staff.staff_user_id + version} staff={status.staff} readOnly={readOnly} refresh={refresh} /></div><div hidden={mode !== 'review'}><Comparison key={status.staff.staff_user_id} status={status} refresh={refresh} readOnly={readOnly} /></div><Sources /><button onClick={download}>Download my saved reviews</button></>}
    {!status && mode !== 'current' && !error && <p>Connecting to staff testing…</p>}
  </div>;
}
