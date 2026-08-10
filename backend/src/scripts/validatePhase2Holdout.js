const fs = require('fs');
const path = require('path');

const { buildImport, readJsonLines, readSourceInventory } = require('./importDriverKnowledge');
const { buildDriverHelpDecision } = require('../services/driverHelpRetrieval');

const ROOT = path.resolve(__dirname, '../../..');

function validate() {
  const records = readJsonLines(path.join(ROOT, 'knowledge/operations/records.jsonl'));
  const maintainedCases = readJsonLines(path.join(ROOT, 'knowledge/evaluations/driver-language-cases.jsonl'));
  const sources = readSourceInventory(path.join(ROOT, 'knowledge/sources/registry.jsonl'));
  const holdout = readJsonLines(path.join(__dirname, 'phase2DriverLanguageHoldout.jsonl'));
  const indexed = buildImport(records, new Date().toISOString(), maintainedCases, sources).knowledgeRows;
  const results = holdout.map((testCase) => {
    const decision = buildDriverHelpDecision(testCase.utterance, indexed);
    const topCandidate = decision.candidates?.[0]?.knowledge_id || null;
    const modeMatch = decision.response_mode === testCase.expected_mode;
    const recordMatch = testCase.top_match_optional || topCandidate === testCase.expected_knowledge_id;
    return { ...testCase, actual_mode: decision.response_mode, top_candidate: topCandidate, passed: modeMatch && recordMatch };
  });
  const summary = {
    cases: results.length,
    passed: results.filter((row) => row.passed).length,
    failed: results.filter((row) => !row.passed)
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.failed.length) process.exitCode = 2;
}

if (require.main === module) validate();

module.exports = { validate };
