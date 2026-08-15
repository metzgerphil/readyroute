# Evaluations

Ready Route Answers uses a closed-loop stability gate before the active corpus can expand.

The gate covers canonical driver-language cases, harmless wording variations, multi-turn clarification conversations, out-of-corpus safety boundaries, canonical traceability, compact answer formatting, and three consecutive clean runs. Run it with `npm run knowledge:gate` from the repository root.

Every new published record must add representative clear, shorthand, incomplete, ambiguous, and safety-sensitive cases. Records with clarification requirements must also add a conversation scenario. Expansion remains blocked whenever the stability report contains a critical failure.
