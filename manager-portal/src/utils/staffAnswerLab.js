export const ratingChoices = [
  ['CORRECT_COMPLETE', 'Correct and complete'],
  ['INCOMPLETE', 'Missing important information'],
  ['INCORRECT', 'Incorrect or wrong situation'],
  ['CLARIFICATION_NEEDED', 'Should clarify first'],
  ['UNSURE', 'Needs an operations expert'],
];
export function answerSections(result = {}) {
  const s = result.answer_structure || {};
  if (Array.isArray(s.sections) && s.sections.length) return s.sections;
  return [{ direct_answer: s.direct_answer || result.answer, steps: s.steps, watch_for: s.watch_for,
    procedure_steps: s.procedure_steps, documentation: s.documentation, prohibited_actions: s.prohibited_actions,
    escalation: s.escalation || s.escalation_requirements }];
}
export function mayContinue(result) {
  return Boolean(result?.session_id && (result.clarification_prompt || result.response_mode === 'CLARIFY' || result.partial_answer));
}
export function pendingRequest(question, sessionId, previous, id) {
  if (previous) return previous;
  return { request_id: id, question: question.trim(), ...(sessionId ? { session_id: sessionId } : {}) };
}
