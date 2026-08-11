# Ready Route driver assistant V1 interface

Decision date: 2026-08-10.

## Primary screen

The V1 driver experience has one primary job: let a driver ask an operational question by voice or text. The home screen therefore contains only:

- the Ready Route wordmark;
- account access through the existing application shell;
- “What do you need help with?”;
- one large orange microphone labeled “Tap to ask”; and
- one text field labeled “Type your question” with a send control.

The final speech transcript is submitted automatically. Text questions are submitted with the send control. Both use the same authenticated Driver Help API and canonical-knowledge boundary.

## Deliberately absent

The primary screen does not contain Route Tools, bottom navigation, a code-reference browser, categories, suggested questions, examples, recent-question cards, or a second Ask/Help control. The driver can ask code questions through the same voice-or-text interaction.

Production help-only builds continue to use `EXPO_PUBLIC_DRIVER_HELP_ONLY=true`, which removes Route Tools from the application navigation. The remaining shell control is labeled Account and provides account/support access.

## Result states

- `ANSWER`: immediate verified steps first, followed by optional details, prohibitions, trace state, feedback, typed follow-up, and “Ask another question.”
- `CLARIFY`: one material question with compact choices when available, plus a text response path.
- `ESCALATE`: a clear statement that an approved answer is unavailable and the appropriate human escalation boundary.

No result state creates an operational answer from general model knowledge.

## Visual system

- Background: `#F7F5F1`
- Primary navy: `#173042`
- Primary action orange: `#FF6200`
- White cards and inputs
- Light borders: `#DDE5EB`
- Large touch targets and sunlight-readable type

The orange microphone is the dominant home-screen action. Orange is not used as a danger color.
