const fs = require("node:fs");

const recordsPath = "research/fedex-ground-driver-knowledge/knowledge/records.jsonl";
const adjudicationsPath = "knowledge/adjudications/records.json";
const validationPath = "research/fedex-ground-driver-knowledge/validation/driver_language_cases.jsonl";
const conversationsPath = "research/fedex-ground-driver-knowledge/validation/conversation_scenarios.jsonl";
const prioritiesPath = "research/fedex-ground-driver-knowledge/validation/vlad_priority_51_cases.jsonl";
const inventoryPath = "research/fedex-ground-driver-knowledge/inventory/source_inventory.csv";

const readJsonl = (path) => fs.readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const writeJsonl = (path, values) => fs.writeFileSync(path, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
const evidence = (locator, summary) => [
  { source_id: "SRC-V2-VLAD-ROUND3-20260819", locator, evidence_summary: summary, reviewed_at: "2026-08-20" },
  { source_id: "SRC-V2-OWNER-ROUND3-APPROVAL-20260820", locator: "Approval scope", evidence_summary: "Phillip Metzger approved the explicit Round 3 operational corrections and directed that they supersede conflicting approved corpus interpretations.", reviewed_at: "2026-08-20" },
];

const records = readJsonl(recordsPath);
const byId = (id) => {
  const record = records.find((candidate) => candidate.knowledge_id === id);
  if (!record) throw new Error(`Missing knowledge record ${id}`);
  return record;
};
const round3Update = (record, changes, locator, summary) => Object.assign(record, changes, {
  version: Math.max(Number(record.version) || 1, 2),
  evidence: [...record.evidence.filter((item) => !item.source_id.includes("ROUND3")), ...evidence(locator, summary)],
  source_date_or_version: "Vlad Round 3 2026-08-19; owner-approved 2026-08-20",
  knowledge_status: "HUMAN_REVIEW_REQUIRED",
  review_notes: "Round 3 operational correction approved by Phillip Metzger on 2026-08-20 and published through a scoped READY_ROUTE_APPROVED adjudication.",
  updated_at: "2026-08-20",
});

round3Update(byId("KNO-DEL-MISLOAD-AFTERDISPATCH-001"), {
  authoritative_rule: "For a wrong-route package discovered after dispatch, do not deliver it. Apply Code 012, cross it with Code 012, the date, and work area number, remove the SID sticker, and return it to the station.",
  required_procedure: [
    { step: 1, action: "Do not deliver the wrong-route package." },
    { step: 2, action: "Apply Code 012." },
    { step: 3, action: "Cross it with Code 012, the date, and work area number." },
    { step: 4, action: "Remove the SID sticker." },
    { step: 5, action: "Return the package to the station." },
  ],
  prohibited_actions: ["Do not deliver a package that belongs to another route under this after-dispatch condition."],
  escalation_requirements: [],
  concise_ready_route_answer: "Do not deliver it. Apply Code 012, cross it with Code 012, the date, and your work area number, remove the SID sticker, and return it to the station.",
  more_info_answer: "This is the approved after-dispatch wrong-route procedure.",
}, "Section A, Q1 remaining gap", "Reaffirms that the Code 012 procedure explicitly ends with SID removal and station return.");

round3Update(byId("KNO-DEL-BUS-CLOSED-001"), {
  authoritative_rule: "When a non-residential recipient is unavailable and no authorized release path exists, use Code 011 for an applicable weekend closure or Code 004 otherwise. Complete, scan, and leave the door tag; cross the package; remove the SID sticker; and return it to the station.",
  required_procedure: [
    { step: 1, action: "Confirm the stop is non-residential and no authorized release path is available." },
    { step: 2, action: "Use Code 011 for an applicable weekend closure; otherwise use Code 004." },
    { step: 3, action: "Complete, scan, and leave the door tag at the main entrance." },
    { step: 4, action: "Cross the package with the matching code, date, and work area number." },
    { step: 5, action: "Remove the SID sticker." },
    { step: 6, action: "Return the package to the station." },
  ],
  prohibited_actions: ["Do not use Code 004 for a residential stop.", "Do not leave the package without an authorized release path."],
  concise_ready_route_answer: "Use Code 011 for an applicable weekend closure or Code 004 otherwise. Complete the door tag, cross the package, remove the SID, and return it to the station.",
  more_info_answer: "This return procedure applies when no authorized non-residential release path is available.",
}, "Section B, Q8", "Supplies the complete closed-business procedure, including SID removal and station return.");

const predispatchRule = "Before dispatch, whether or not the wrong-work-area package appears on the driver's manifest, the station handles the correction: a package handler or QA scans it and loads it to the correct work area. A new driver who is unsure should ask the BC or manager.";
const predispatchSteps = [
  { step: 1, action: "Confirm the discrepancy was found before dispatch." },
  { step: 2, action: "Give the package to a package handler or QA for the station correction." },
  { step: 3, action: "The package handler or QA scans it and loads it to the correct work area." },
  { step: 4, action: "If you are unsure where to take it, ask your BC or manager." },
];
round3Update(byId("KNO-FORGE-MANIFEST-PREVIEW-001"), {
  canonical_situation: "A wrong-work-area package is found before dispatch",
  normalized_description: "Before dispatch, the station corrects and loads a package assigned to the wrong work area whether or not it appears on the driver's manifest.",
  authoritative_rule: predispatchRule,
  applicability: ["Before dispatch", "Package is assigned to the wrong work area"],
  conditions: ["The station correction applies whether or not the package is on the driver's manifest"],
  exceptions: ["After-dispatch wrong-route packages use Code 012", "A separately and explicitly directed Bulk Transfer workflow is outside this scenario"],
  required_procedure: predispatchSteps,
  required_documentation: ["Correct work-area scan"],
  prohibited_actions: ["Do not make the driver perform Bulk Transfer as the default correction for this scenario.", "Do not use the after-dispatch Code 012 procedure before dispatch."],
  escalation_requirements: ["A new or unsure driver asks the BC or manager"],
  clarification_requirements: ["Was the package discovered before or after dispatch?"],
  driver_question_variants: ["Package from another route before dispatch", "Wrong work area package before dispatch", "Misload before leaving station", "Package is not on my manifest before dispatch"],
  concise_ready_route_answer: "Before dispatch, the station handles it whether or not it is on your manifest. Give it to a package handler or QA so they can scan and load it to the correct work area. If you are unsure, ask your BC or manager.",
  more_info_answer: "This supersedes the prior default recommendation to use Bulk Transfer for a pre-dispatch wrong-work-area package.",
}, "Section D, before-dispatch misload procedure", "Replaces prior predispatch variants with the station-handled correction.");

round3Update(byId("KNO-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001"), {
  canonical_situation: "Station handling of a wrong-work-area package before dispatch",
  normalized_description: "The station corrects a predispatch wrong-work-area package through package-handler or QA scanning and loading.",
  authoritative_rule: predispatchRule,
  applicability: ["Before dispatch", "Package is assigned to the wrong work area"],
  conditions: ["The process applies whether or not the package is on the driver's manifest"],
  exceptions: ["After dispatch uses the Code 012 procedure"],
  required_procedure: predispatchSteps,
  required_documentation: ["Correct work-area scan"],
  prohibited_actions: ["Do not treat a driver-to-driver handoff without the station scan as completion.", "Do not default this scenario to driver-operated Bulk Transfer."],
  escalation_requirements: ["Ask the BC or manager when unsure"],
  clarification_requirements: ["Has dispatch occurred?"],
  driver_question_variants: ["Wrong work area package before dispatch", "Who handles a misload before dispatch", "Package is not on my manifest before dispatch"],
  concise_ready_route_answer: "Before dispatch, give the package to a package handler or QA so the station can scan and load it to the correct work area. This applies whether or not it is on your manifest. Ask your BC or manager if you are unsure.",
  more_info_answer: null,
}, "Section D, before-dispatch misload procedure", "Supersedes the narrower driver-to-driver handoff interpretation.");

round3Update(byId("KNO-DEL-SRA-001"), {
  authoritative_rule: "For an ISR package released using a signed door tag on file, choose ALT, then Shipment Status Tag; scan the OP-200/OP-200SP, write On File, enter the recipient initial and last name, and turn in the physical door tag at check-in. Other SRA paths remain separate.",
  required_procedure: [
    { step: 1, action: "Choose ALT, then Shipment Status Tag." },
    { step: 2, action: "Scan the OP-200/OP-200SP door tag." },
    { step: 3, action: "Write On File on the door tag." },
    { step: 4, action: "Enter the recipient initial and last name." },
    { step: 5, action: "Turn in the physical door tag at check-in." },
  ],
  required_documentation: ["Scanned OP-200/OP-200SP marked On File", "Recipient initial and last name", "Physical door tag returned at check-in"],
  driver_question_variants: [...new Set([...byId("KNO-DEL-SRA-001").driver_question_variants, "ISR signed door tag on file", "What do I do with the ISR door tag"] )],
  concise_ready_route_answer: "For the ISR signed-door-tag path, choose ALT, then Shipment Status Tag; scan the OP-200/OP-200SP, write On File, enter the recipient initial and last name, and turn in the physical door tag at check-in.",
}, "Section B, Q6", "Confirms the exact ISR signed-door-tag On File procedure and physical tag disposition.");

const newRecords = [
  {
    knowledge_id: "KNO-DEL-INVENTORY-FUTURE-034-001", version: 1,
    canonical_situation: "A customer requests future delivery because the business is doing inventory",
    normalized_description: "The delivery is deferred at the customer's request because of inventory.",
    authoritative_rule: "Apply Code 034, cross the package with the work-area number, date, and Code 034, and remove the SID sticker.",
    applicability: ["Customer requests future delivery", "Reason is inventory"], conditions: [], exceptions: [],
    required_procedure: [{ step: 1, action: "Apply Code 034." }, { step: 2, action: "Cross the package with the work-area number, date, and Code 034." }, { step: 3, action: "Remove the SID sticker." }],
    required_documentation: ["Code 034", "Package crossing with work-area number and date"], prohibited_actions: ["Do not substitute another status code for this stated condition."], escalation_requirements: [], clarification_requirements: [],
    related_knowledge_ids: [], taxonomy_paths: ["TAX-DELIVERY", "TAX-DELIVERY/TAX-STATUS-CODE"],
    driver_question_variants: ["Customer wants future delivery because they're doing inventory what code", "Inventory request future delivery", "What do I do for Code 034"],
    concise_ready_route_answer: "Apply Code 034. Cross the package with your work-area number, the date, and Code 034, then remove the SID sticker.", more_info_answer: null,
    evidence: evidence("Section B, Q2", "Confirms Code 034 and the package crossing and SID-removal procedure."), source_date_or_version: "Vlad Round 3 2026-08-19; owner-approved 2026-08-20", knowledge_status: "HUMAN_REVIEW_REQUIRED", review_notes: "Published through a scoped READY_ROUTE_APPROVED adjudication.", created_at: "2026-08-20", updated_at: "2026-08-20",
  },
  {
    knowledge_id: "KNO-FORGE-CSA-001", version: 1,
    canonical_situation: "A driver asks what CSA means",
    normalized_description: "CSA is a scanner-login term for the driver's Contracting Service Area.",
    authoritative_rule: "CSA means Contracting Service Area. Each CSA has its own personal number entered at scanner login; it is typically saved automatically after the first entry.",
    applicability: ["Driver asks what CSA means", "Scanner login requests CSA"], conditions: [], exceptions: [],
    required_procedure: [{ step: 1, action: "Enter the personal number for your Contracting Service Area at scanner login when requested." }, { step: 2, action: "The scanner typically saves it automatically after the first entry." }],
    required_documentation: [], prohibited_actions: ["Do not route a CSA definition question to the HAL workflow."], escalation_requirements: [], clarification_requirements: [], related_knowledge_ids: [], taxonomy_paths: ["TAX-FORGE"],
    driver_question_variants: ["What is CSA", "What is it CSA", "What does CSA mean", "CSA scanner login"],
    concise_ready_route_answer: "CSA means Contracting Service Area. Each CSA has its own personal number entered at scanner login, and it is typically saved automatically after you enter it once.", more_info_answer: null,
    evidence: evidence("Section D, CSA definition", "Defines CSA and explains the personal scanner-login number and usual automatic saving."), source_date_or_version: "Vlad Round 3 2026-08-19; owner-approved 2026-08-20", knowledge_status: "HUMAN_REVIEW_REQUIRED", review_notes: "Published through a scoped READY_ROUTE_APPROVED adjudication.", created_at: "2026-08-20", updated_at: "2026-08-20",
  },
];
for (const record of newRecords) if (!records.some((item) => item.knowledge_id === record.knowledge_id)) records.push(record);
writeJsonl(recordsPath, records);

const adjudications = JSON.parse(fs.readFileSync(adjudicationsPath, "utf8"));
const supersede = (id) => { const item = adjudications.find((candidate) => candidate.adjudication_id === id); if (item) item.status = "SUPERSEDED"; };
[
  "ADJ-20260815-OWNER-MISLOAD-AFTERDISPATCH-001", "ADJ-20260819-VLAD-BUS-CLOSED-001",
  "ADJ-20260815-OWNER-MANIFEST-PREVIEW-001", "ADJ-20260819-VLAD-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001",
].forEach(supersede);
const approval = (id, knowledgeId, issue, determination, previous, overrides, supersedes = []) => ({
  adjudication_id: id, knowledge_id: knowledgeId, status: "APPROVED", issue_reviewed: issue,
  canonical_determination: determination, previous_interpretations: [previous],
  supporting_source_ids: ["SRC-V2-VLAD-ROUND3-20260819", "SRC-V2-OWNER-ROUND3-APPROVAL-20260820"],
  conflicting_or_superseded_source_ids: [],
  reasoning: "Phillip Metzger explicitly approved Vlad's Round 3 operational correction and directed that it control over conflicting approved corpus content.",
  approved_by: "Phillip Metzger, Ready Route product owner", approval_date: "2026-08-20", effective_date: "2026-08-20", supersedes,
  reopen_conditions: ["Phillip or Vlad revises this procedure.", "A later applicable operational update materially conflicts with it."], canonical_overrides: overrides,
});
const approvals = [
  approval("ADJ-20260820-ROUND3-MISLOAD-AFTERDISPATCH-001", "KNO-DEL-MISLOAD-AFTERDISPATCH-001", "The complete Code 012 return procedure.", "Do not deliver; use Code 012; cross the package; remove SID; return to station.", "The prior approval had the same procedure but visible answer overrides could omit the final return actions.", { authoritative_rule: byId("KNO-DEL-MISLOAD-AFTERDISPATCH-001").authoritative_rule, required_procedure: byId("KNO-DEL-MISLOAD-AFTERDISPATCH-001").required_procedure, prohibited_actions: byId("KNO-DEL-MISLOAD-AFTERDISPATCH-001").prohibited_actions, escalation_requirements: [], concise_driver_answer: byId("KNO-DEL-MISLOAD-AFTERDISPATCH-001").concise_ready_route_answer }, ["ADJ-20260815-OWNER-MISLOAD-AFTERDISPATCH-001"]),
  approval("ADJ-20260820-ROUND3-BUS-CLOSED-001", "KNO-DEL-BUS-CLOSED-001", "The complete closed-business station-return procedure.", "Use 011 for an applicable weekend closure or 004 otherwise; door tag; cross; remove SID; return to station.", "The prior active approval contained the return actions, but some delivered answer structures omitted them.", { authoritative_rule: byId("KNO-DEL-BUS-CLOSED-001").authoritative_rule, required_procedure: byId("KNO-DEL-BUS-CLOSED-001").required_procedure, prohibited_actions: byId("KNO-DEL-BUS-CLOSED-001").prohibited_actions, concise_driver_answer: byId("KNO-DEL-BUS-CLOSED-001").concise_ready_route_answer }, ["ADJ-20260819-VLAD-BUS-CLOSED-001"]),
  approval("ADJ-20260820-ROUND3-PREDISPATCH-MISLOAD-001", "KNO-FORGE-MANIFEST-PREVIEW-001", "Who handles a wrong-work-area package before dispatch.", predispatchRule, "The prior approval recommended driver-operated Manifest Preview or Bulk Transfer paths.", { authoritative_rule: predispatchRule, applicability: byId("KNO-FORGE-MANIFEST-PREVIEW-001").applicability, conditions: byId("KNO-FORGE-MANIFEST-PREVIEW-001").conditions, exceptions: byId("KNO-FORGE-MANIFEST-PREVIEW-001").exceptions, required_procedure: predispatchSteps, required_documentation: ["Correct work-area scan"], prohibited_actions: byId("KNO-FORGE-MANIFEST-PREVIEW-001").prohibited_actions, escalation_requirements: byId("KNO-FORGE-MANIFEST-PREVIEW-001").escalation_requirements, clarification_requirements: byId("KNO-FORGE-MANIFEST-PREVIEW-001").clarification_requirements, concise_driver_answer: byId("KNO-FORGE-MANIFEST-PREVIEW-001").concise_ready_route_answer }, ["ADJ-20260815-OWNER-MANIFEST-PREVIEW-001"]),
  approval("ADJ-20260820-ROUND3-PREDISPATCH-STATION-HANDOFF-001", "KNO-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001", "The corrected station-owned predispatch handoff.", predispatchRule, "The prior approval focused on driver-to-driver handoff and treated Bulk Transfer as a separate correction path.", { authoritative_rule: predispatchRule, applicability: byId("KNO-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001").applicability, conditions: byId("KNO-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001").conditions, exceptions: byId("KNO-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001").exceptions, required_procedure: predispatchSteps, required_documentation: ["Correct work-area scan"], prohibited_actions: byId("KNO-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001").prohibited_actions, escalation_requirements: byId("KNO-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001").escalation_requirements, clarification_requirements: byId("KNO-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001").clarification_requirements, concise_driver_answer: byId("KNO-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001").concise_ready_route_answer }, ["ADJ-20260819-VLAD-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001"]),
  approval("ADJ-20260820-ROUND3-ISR-ONFILE-001", "KNO-DEL-SRA-001", "The ISR signed-door-tag On File procedure.", byId("KNO-DEL-SRA-001").authoritative_rule, "The source record described a non-barcoded SRA path without preserving the exact OP-200/OP-200SP wording from Round 3.", { authoritative_rule: byId("KNO-DEL-SRA-001").authoritative_rule, required_procedure: byId("KNO-DEL-SRA-001").required_procedure, required_documentation: byId("KNO-DEL-SRA-001").required_documentation, prohibited_actions: byId("KNO-DEL-SRA-001").prohibited_actions, concise_driver_answer: byId("KNO-DEL-SRA-001").concise_ready_route_answer }),
  approval("ADJ-20260820-ROUND3-CODE034-001", "KNO-DEL-INVENTORY-FUTURE-034-001", "The procedure for inventory/request future delivery.", byId("KNO-DEL-INVENTORY-FUTURE-034-001").authoritative_rule, "Only the Code 034 reference definition was previously available; no operational record was reachable.", { authoritative_rule: byId("KNO-DEL-INVENTORY-FUTURE-034-001").authoritative_rule, required_procedure: byId("KNO-DEL-INVENTORY-FUTURE-034-001").required_procedure, required_documentation: byId("KNO-DEL-INVENTORY-FUTURE-034-001").required_documentation, prohibited_actions: byId("KNO-DEL-INVENTORY-FUTURE-034-001").prohibited_actions, concise_driver_answer: byId("KNO-DEL-INVENTORY-FUTURE-034-001").concise_ready_route_answer }),
  approval("ADJ-20260820-ROUND3-CSA-001", "KNO-FORGE-CSA-001", "The meaning and scanner-login use of CSA.", byId("KNO-FORGE-CSA-001").authoritative_rule, "The corpus lacked a CSA glossary record and could misroute the question to HAL.", { authoritative_rule: byId("KNO-FORGE-CSA-001").authoritative_rule, required_procedure: byId("KNO-FORGE-CSA-001").required_procedure, prohibited_actions: byId("KNO-FORGE-CSA-001").prohibited_actions, concise_driver_answer: byId("KNO-FORGE-CSA-001").concise_ready_route_answer }),
];
for (const item of approvals) {
  const index = adjudications.findIndex((existing) => existing.adjudication_id === item.adjudication_id);
  if (index === -1) adjudications.push(item);
  else adjudications[index] = item;
}
fs.writeFileSync(adjudicationsPath, `${JSON.stringify(adjudications, null, 2)}\n`);

const cases = readJsonl(validationPath);
for (const testCase of cases) {
  const id = testCase.expected_knowledge_ids?.[0];
  if (!testCase.answer_override || !["KNO-DEL-BUS-CLOSED-001", "KNO-DEL-MISLOAD-AFTERDISPATCH-001"].includes(id)) continue;
  const record = byId(id);
  testCase.answer_override.direct_answer = record.concise_ready_route_answer;
  testCase.answer_override.steps = id === "KNO-DEL-BUS-CLOSED-001"
    ? [
        record.required_procedure[0].action,
        record.required_procedure[1].action,
        `${record.required_procedure[2].action} ${record.required_procedure[3].action}`,
        `${record.required_procedure[4].action} ${record.required_procedure[5].action}`,
      ]
    : [
        `${record.required_procedure[0].action} ${record.required_procedure[1].action}`,
        record.required_procedure[2].action,
        `${record.required_procedure[3].action} ${record.required_procedure[4].action}`,
      ];
}
const addCase = (item) => {
  const index = cases.findIndex((existing) => existing.case_id === item.case_id);
  if (index === -1) cases.push(item);
  else cases[index] = item;
};
addCase({ case_id: "ROUND3-CODE034-001", utterance: "Customer wants future delivery because they're doing inventory, what code?", semantic_variations: ["inventory asked for future delivery what code", "customer doing inventory wants delivery later"], expected_knowledge_ids: ["KNO-DEL-INVENTORY-FUTURE-034-001"], must_clarify: [], must_not_do: ["return only a code definition", "omit SID removal"], case_type: "ROUND3_APPROVED_DIRECT", information_sufficiency: "SUFFICIENT", response_mode: "DIRECT_SOURCE_GROUNDED_ANSWER" });
addCase({ case_id: "ROUND3-CSA-001", utterance: "What is CSA?", semantic_variations: ["What is it CSA?", "what does CSA mean at scanner login"], expected_knowledge_ids: ["KNO-FORGE-CSA-001"], must_clarify: [], must_not_do: ["ask whether this is a HAL package"], case_type: "ROUND3_APPROVED_GLOSSARY", information_sufficiency: "SUFFICIENT", response_mode: "DIRECT_SOURCE_GROUNDED_ANSWER" });
addCase({ case_id: "ROUND3-GENERIC-SIGNATURE-TYPE-001", utterance: "I have a package with the signature, but there is a signed door tag, what should I do?", expected_knowledge_ids: ["KNO-DEL-SIG-ASR-001"], must_clarify: ["What signature service does FORGE show: ISR, DSR, or ASR?"], must_not_do: ["ask only whether valid government ID was presented", "assume ASR"], case_type: "ROUND3_ROUTING_CLARIFIER", information_sufficiency: "CONDITIONALLY_SUFFICIENT", response_mode: "ASK_MINIMUM_CLARIFICATION" });
addCase({ case_id: "ROUND3-ISR-ONFILE-001", utterance: "I have an ISR package with a signed door tag on file, what should I do?", expected_knowledge_ids: ["KNO-DEL-SRA-001"], must_clarify: [], must_not_do: ["ask which signature service applies", "route to general door-tag placement"], case_type: "ROUND3_APPROVED_DIRECT", information_sufficiency: "SUFFICIENT", response_mode: "DIRECT_SOURCE_GROUNDED_ANSWER", answer_override: { direct_answer: "Use the On File path: ALT, then Shipment Status Tag. Scan the OP-200/OP-200SP, write On File, enter the name, and turn in the tag at check-in.", steps: byId("KNO-DEL-SRA-001").required_procedure.slice(0, 3).map((step) => step.action).concat(`${byId("KNO-DEL-SRA-001").required_procedure[3].action} ${byId("KNO-DEL-SRA-001").required_procedure[4].action}`), watch_for: "Use this On File path for the stated ISR signed-door-tag situation." } });
writeJsonl(validationPath, cases);

const conversations = readJsonl(conversationsPath);
const isr = conversations.find((item) => item.scenario_id === "CONV-P51-ISR-DOORTAG-001");
if (isr) {
  isr.description = "The exact Round 3 ISR signed-door-tag follow-up retains context and routes to the On File procedure.";
  isr.turns = [
    { input: "I have a package with the signature, but there is a signed door tag, what should I do?", expected_mode: "CLARIFY", expected_knowledge_id: "KNO-DEL-SIG-ASR-001", clarification_contains: "signature service" },
    { input: "ISR", expected_mode: "ANSWER", expected_knowledge_id: "KNO-DEL-SIG-ISR-001" },
    { input: "What do I do with the door tag?", expected_mode: "ANSWER", expected_knowledge_id: "KNO-DEL-SRA-001", expected_direct_answer: "Choose ALT, then Shipment Status Tag." },
  ];
}
writeJsonl(conversationsPath, conversations);

const priorities = readJsonl(prioritiesPath);
const q39 = priorities.find((item) => item.priority_case_id === "VLAD-P51-39");
if (q39) Object.assign(q39, { expected_mode: "ANSWER", expected_knowledge_ids: ["KNO-DEL-INVENTORY-FUTURE-034-001"], expected_reference_ids: [], authority_source_ids: ["SRC-V2-VLAD-ROUND3-20260819", "SRC-V2-OWNER-ROUND3-APPROVAL-20260820"], status: "CANONICALIZED_2026-08-20", notes: "Round 3 adds the full approved Code 034 procedure." });
writeJsonl(prioritiesPath, priorities);

let inventory = fs.readFileSync(inventoryPath, "utf8");
const inventoryRows = [
  'SRC-V2-VLAD-ROUND3-20260819,Ready Route v2 intake,,ReadyRoute Round 3 Regression Test Results,MARKDOWN,text/markdown,research/fedex-ground-driver-knowledge/sources/v2-intake-2026-08-20/vlad/ReadyRoute_Round3_Regression_Results.md,2026-08-19,2026-08-20,2026-08-19,Round 3,Regression observations and operational corrections,Ready Route product and engineering,ACCESSIBLE,INTAKE_REVIEWED,HIGH_RELEVANCE,,,,,research/fedex-ground-driver-knowledge/sources/v2-intake-2026-08-20/vlad/ReadyRoute_Round3_Regression_Results.md,"Only explicit operational corrections are authoritative; test observations are diagnostic and recommendations are engineering guidance.",Preserved from Vlad Round 3 and reviewed after owner approval.,2026-08-20,NATIVE,Preserved markdown bytes',
  'SRC-V2-OWNER-ROUND3-APPROVAL-20260820,Ready Route v2 intake,,Ready Route owner approval Round 3 operational corrections,MARKDOWN,text/markdown,docs/ready-route-owner-approval-round3-knowledge-2026-08-20.md,2026-08-20,2026-08-20,2026-08-20,Owner approval,Owner approval and supersession directive,Ready Route knowledge governance,ACCESSIBLE,FULLY_REVIEWED,HIGH_RELEVANCE,,,,SRC-V2-VLAD-ROUND3-20260819,docs/ready-route-owner-approval-round3-knowledge-2026-08-20.md,"Applies only to operational facts and procedures explicitly supplied in Round 3.",Phillip directed Round 3 corrections to control over conflicting approved corpus content.,2026-08-20,NATIVE,Owner statement preserved in task and approval note',
];
for (const row of inventoryRows) if (!inventory.includes(row.split(",")[0])) inventory += `${inventory.endsWith("\n") ? "" : "\n"}${row}\n`;
fs.writeFileSync(inventoryPath, inventory);

console.log("Round 3 intake applied.");
