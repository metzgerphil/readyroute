const displayText=t=>typeof t==='string'?t.replace(/\[OUT_OF_CORPUS\]/g,'Not covered by this answer:'):t;
// Mirror the phone's existing display contract; keep the original section for review.
export function staffPresentation(result, section) {
  const p = section?.driver_presentation;
  const supported = ['CONCISE_16_PRIVATE_V1', 'NUMBERED_16_PRIVATE_V1', 'ADAPTIVE_26_PRIVATE_V1'];
  if (!supported.includes(p?.contract)) return null;
  if (result?.response_mode !== 'ANSWER' && !(result?.response_mode === 'CLARIFY' && p?.card_id?.startsWith('rr25:') && p.coverage === 'VERIFIED_SECTION_ONLY')) return null;
  if (result.partial_answer && p.contract !== 'ADAPTIVE_26_PRIVATE_V1') return null;
  const numbered = p.contract === 'NUMBERED_16_PRIVATE_V1' || (p.contract === 'ADAPTIVE_26_PRIVATE_V1' && p.format === 'steps');
  return { listStyle: p.list_style || 'numbered', lead: numbered ? null : displayText(p.lead), steps: numbered ? p.steps.map(displayText) : [], notices: (p.notices || []).map(displayText), codes: p.codes || [], details: (p.details || []).map(displayText) };
}

// Only the new server-owned envelope opts in. Historical answer formats remain intact.
export function uniformStaffAnswer(result) {
  const a=result?.driver_answer;
  if(result?.answering_version!=='2.5'||a?.version!==1||a.format!=='bullets'||!Array.isArray(a.items)||a.items.some(x=>typeof x!=='string'||!x.trim()))return null;
  if(a.question!==null&&typeof a.question!=='string')return null;
  if(!Array.isArray(a.choices)||a.choices.some(x=>typeof x?.label!=='string'||typeof x?.query!=='string'))return null;
  return a;
}
