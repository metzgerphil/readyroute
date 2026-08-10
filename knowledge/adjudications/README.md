# Ready Route adjudications

Human adjudication turns an actionable ambiguity into one canonical Ready Route determination without erasing source history.

Add decisions to `records.json` and validate them against `../schema/adjudication.schema.json`. Each approval must identify the issue, prior interpretations, supporting and conflicting/superseded source IDs, determination, reasoning, approver, approval date, effective date when applicable, supersession, and conditions requiring reopening.

Allowed adjudication states are `APPROVED`, `SUPERSEDED`, and `REOPENED`. Only an active `APPROVED` record produces `READY_ROUTE_APPROVED` knowledge. New authoritative evidence that materially challenges the decision must change it to `REOPENED` until a new approval is recorded.

Do not use adjudication to manufacture missing FedEx procedure. It records an explicit Ready Route human decision and its evidence/reasoning.
