# Phase 3 speech-to-text reliability report

Status: deterministic transcript-boundary testing complete; physical acoustic testing open.

Ready Route V1 uses device-native speech recognition and sends the resulting text through the same canonical retrieval and eligibility pipeline as typed input. Ready Route does not treat the transcription engine as operational authority and does not store speech audio in its backend.

## Completed checks

- All 192 maintained evaluation utterances pass with voice filler, repeated words, punctuation/case loss, and self-correction framing.
- Independent speech-like errors cover signature terminology, including `singer`/`signer` normalization, without relaxing the canonical boundary.
- Ambiguous or incomplete transcripts retain clarification/escalation behavior.
- A transcription cannot make noneligible knowledge definitive or override `READY_ROUTE_APPROVED` precedence.
- The discovered critical `indirect singer package` misclassification is fixed and permanently covered.

## Open acoustic matrix

Physical-device tests must cover iPhone and Android microphones, quiet and delivery-vehicle noise, clipped phrases, self-correction, numbers/codes, signature types, route/work-area identifiers, abbreviations, accents represented in the pilot cohort, permission denial, recognition cancellation, and no-network/platform-service behavior.

High-impact tokens should trigger confirmation only when the selected procedure would materially change and transcription confidence is available and low. The production device API's confidence behavior must be measured before adding confirmation prompts; unnecessary confirmation would make the primary interaction cumbersome.

## Current disposition

The text boundary is hardened, but speech-to-text reliability is not complete and is a pre-pilot blocker until the physical acoustic matrix is executed and material failures receive regressions or safe confirmation behavior.
