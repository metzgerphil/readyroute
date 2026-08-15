# Ready Route Answers stability loop

Ready Route Answers uses an automated regression gate before adding operational knowledge or releasing answer-engine changes.

## What the gate checks

- Every curated driver question selects the intended canonical record and response mode.
- Three harmless wording variations are generated for every curated question.
- Multi-turn conversations retain the original situation and all accepted clarification answers.
- Unsupported questions fail closed without producing an operational answer.
- Every answer has one direct answer, one to four steps, an optional warning, and a canonical trace.
- Driver-facing code terminology uses `Code N`.
- The entire suite passes three consecutive times.

Run the gate from the repository root:

```sh
npm run knowledge:gate
```

The machine-readable runner can also write a report:

```sh
npm --prefix backend run knowledge:stability -- --report /tmp/rra-stability.json
```

## Failure handling

Failures are classified as retrieval, response-mode, clarification, conversation-context, answer-format, terminology, traceability, or unsupported-answer failures. Software and presentation failures may be repaired automatically by the development agent and retested. Missing, conflicting, or changed operational procedures must be sent for owner or source review; the test loop must never invent the missing instruction.

## Adding archived knowledge

1. Add a small reviewed batch to the authoring corpus.
2. Add clear, abbreviated, incomplete, ambiguous, safety-boundary, and multi-turn cases.
3. Regenerate the canonical release.
4. Run the complete stability gate, including all earlier cases.
5. Resolve every regression and rerun until three consecutive passes succeed.
6. Publish the batch only while the expansion gate is open.
