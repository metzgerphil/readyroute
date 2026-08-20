const path = require('path');

const {
  buildAnswerStructure,
  buildDriverHelpDecision,
  buildPresentedAnswer,
  formatDriverCodeTerminology,
  getMatchingQuestionPattern
} = require('../services/driverHelpRetrieval');
const {
  buildImport,
  buildPublicationGateIndex,
  readJsonLines,
  readSourceInventory
} = require('./importDriverKnowledge');

const ROOT = path.resolve(__dirname, '../../..');

function validate() {
  const records = readJsonLines(path.join(ROOT, 'knowledge/operations/records.jsonl'));
  const cases = readJsonLines(path.join(ROOT, 'knowledge/evaluations/driver-language-cases.jsonl'));
  const sources = readSourceInventory(path.join(ROOT, 'knowledge/sources/registry.jsonl'));
  const gates = buildPublicationGateIndex(records);
  const indexed = buildImport(records, new Date(0).toISOString(), cases, sources, gates).knowledgeRows;
  const publicationReady = indexed.filter((record) => record.is_published === true);
  const failures = [];

  for (const record of publicationReady) {
    if (!['SOURCE_VERIFIED', 'READY_ROUTE_APPROVED'].includes(record.status)) {
      failures.push({ knowledge_id: record.knowledge_id, failure: 'published status is not eligible' });
    }
    if (!record.version || !(record.source_ids || []).length || !record.canonical_schema_version) {
      failures.push({ knowledge_id: record.knowledge_id, failure: 'canonical version/source/schema trace is incomplete' });
    }
    if (record.status === 'READY_ROUTE_APPROVED' && !record.adjudication_id) {
      failures.push({ knowledge_id: record.knowledge_id, failure: 'approved record lacks adjudication trace' });
    }
    const structure = buildAnswerStructure(record);
    const canonicalProcedure = (record.required_procedure || [])
      .map((step) => formatDriverCodeTerminology(step.action, record));
    const canonicalProhibitions = (record.prohibited_actions || [])
      .map((item) => formatDriverCodeTerminology(item, record));
    if (JSON.stringify(structure.procedure_steps) !== JSON.stringify(canonicalProcedure)) {
      failures.push({ knowledge_id: record.knowledge_id, failure: 'procedure structure differs from canonical procedure' });
    }
    if (JSON.stringify(structure.documentation) !== JSON.stringify(record.required_documentation || [])) {
      failures.push({ knowledge_id: record.knowledge_id, failure: 'documentation structure differs from canonical record' });
    }
    if (JSON.stringify(structure.prohibited_actions) !== JSON.stringify(canonicalProhibitions)) {
      failures.push({ knowledge_id: record.knowledge_id, failure: 'prohibition structure differs from canonical record' });
    }
  }

  const directCases = cases.filter((testCase) => (
    ['DIRECT_SOURCE_GROUNDED_ANSWER', 'ALTERNATE_DOCUMENTATION'].includes(testCase.response_mode)
    && (testCase.expected_knowledge_ids || []).every((id) => gates.get(id)?.isPublished)
  ));
  let tracedAnswers = 0;
  for (const testCase of directCases) {
    const decision = buildDriverHelpDecision(testCase.utterance, indexed);
    if (decision.response_mode !== 'ANSWER' || decision.selected_records.length !== 1) {
      failures.push({ case_id: testCase.case_id, failure: 'direct case did not produce exactly one traced answer' });
      continue;
    }
    const selected = decision.selected_records[0];
    const pattern = getMatchingQuestionPattern(testCase.utterance, selected);
    const expectedAnswer = pattern?.answer_override?.direct_answer
      ? formatDriverCodeTerminology(pattern.answer_override.direct_answer, selected)
      : buildPresentedAnswer(selected);
    if (decision.answer !== expectedAnswer
      || decision.more_info !== (selected.more_info_answer || null)) {
      failures.push({ case_id: testCase.case_id, failure: 'answer or More Info lacks a selected canonical or approved question-pattern trace' });
      continue;
    }
    tracedAnswers += 1;
  }

  const summary = {
    canonical_records: indexed.length,
    publication_ready_records: publicationReady.length,
    approved_records_traced: publicationReady.filter((record) => record.status === 'READY_ROUTE_APPROVED').length,
    direct_answer_cases_traced: tracedAnswers,
    failures
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failures.length) process.exitCode = 2;
}

if (require.main === module) validate();

module.exports = { validate };
