# Validation workspace

The first v2 evaluation cases cover the selectively recovered records identified by the 2026-08-14 partner handoff. They test both direct answers and the important boundaries that must remain unresolved, including attempted-versus-unattempted pickup cancellation, unsupported SID handling, and version-sensitive Bulk Transfer guidance.

`conversation_scenarios.jsonl` defines complete clarification exchanges, not isolated prompts. `out_of_corpus_cases.jsonl` defines questions that must fail closed rather than being forced into an unrelated record. The stability gate automatically adds harmless casing, punctuation, and conversational wrappers to every driver-language case and requires three clean runs.

When importing another batch from the archived dataset, add or update its language cases and conversation scenarios before publication. Run `npm run knowledge:gate`; do not open the expansion gate until every critical failure is resolved without inventing operational content.
