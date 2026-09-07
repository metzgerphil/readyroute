import { lazy, Suspense } from 'react';
import { answerSections } from '../utils/staffAnswerLab';
const WebVehicleBarcode = lazy(() => import('./WebVehicleBarcode'));

function content(value) {
  if (typeof value === 'string') return value;
  return value?.action || value?.label || value?.text || value?.question_excerpt || JSON.stringify(value);
}
function Lines({ title, values, ordered = false }) {
  const items = Array.isArray(values) ? values : values ? [values] : [];
  if (!items.length) return null;
  const List = ordered ? 'ol' : 'ul';
  return <div><strong>{title}</strong><List>{items.map((v, i) => <li key={i}>{content(v)}</li>)}</List></div>;
}
export default function StaffAnswerResult({ result = {}, frozen = false }) {
  return <article className="lab-answer">
    {result.partial_answer && <p className="lab-notice"><strong>Partial answer.</strong> Some parts of this situation still need clarification or verification.</p>}
    {answerSections(result).map((s, i) => <section key={i}>
      {s.title && <h4>{s.title}</h4>}
      {s.conditional_default && <p className="lab-notice">Conditional guidance: check the stated conditions before applying these instructions.</p>}
      {s.direct_answer && <p className="lab-preserve">{s.direct_answer}</p>}
      <Lines title="Steps" values={s.steps} ordered />
      <Lines title="Procedure" values={s.procedure_steps} ordered />
      <Lines title="Watch for" values={s.watch_for} />
      <Lines title="Documentation" values={s.documentation} />
      <Lines title="Do not" values={s.prohibited_actions} />
      <Lines title="Escalation" values={s.escalation} />
      <Lines title="Applies when" values={s.supporting_context?.applicability} />
      <Lines title="Conditions" values={s.supporting_context?.conditions} />
      <Lines title="Exceptions" values={s.supporting_context?.exceptions} />
      <Lines title="Additional documentation" values={s.supporting_context?.documentation} />
      {s.supporting_context?.complete_rule && <details><summary>Complete supporting rule</summary><p>{s.supporting_context.complete_rule}</p></details>}
    </section>)}
    <Lines title="Answer options" values={result.answer_structure?.options} />
    {result.answer_structure?.code_instruction && <p className="lab-notice">{content(result.answer_structure.code_instruction)}</p>}
    {result.clarification_prompt && <p className="lab-notice"><strong>Clarification needed:</strong> {result.clarification_prompt}</p>}
    <Lines title="Clarification options" values={result.clarification_options} />
    <Lines title="Still unresolved" values={result.unresolved_parts} />
    {result.escalation_message && <p className="lab-notice">{result.escalation_message}</p>}
    {result.more_info && <details><summary>More information</summary><p className="lab-preserve">{result.more_info}</p></details>}
    {result.barcode && <Suspense fallback={<p>Loading barcode…</p>}><WebVehicleBarcode barcode={result.barcode} /></Suspense>}
    {!!result.trace?.length && <details><summary>Supporting sources ({result.trace.length})</summary>{result.trace.map((t, i) => <p key={i}>{t.knowledge_id} · version {t.canonical_version || t.version || 'recorded'}{t.adjudication_id ? ` · ${t.adjudication_id}` : ''}{t.source_ids?.length ? ` · ${t.source_ids.join(', ')}` : ''}</p>)}</details>}
    {frozen && <details><summary>Inspect the saved answer record</summary><pre className="lab-raw">{JSON.stringify(result, null, 2)}</pre></details>}
  </article>;
}
