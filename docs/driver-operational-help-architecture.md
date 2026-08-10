# Ready Route Driver Operational Help Architecture

## Product boundary

Driver Operational Help becomes the primary driver experience while the existing routing workflow remains available as a background `Route Tools` surface. Existing authentication, company workspaces, driver profiles, manager access, Supabase, Stripe, notifications, and support infrastructure are reused.

The runtime must never create an operational instruction from general model knowledge. A driver answer is permitted only when it is backed by a published `VERIFIED` knowledge-record version.

## Runtime flow

1. A driver submits a short text or dictated situation.
2. The backend normalizes the language and ranks the complete indexed corpus using canonical situations, taxonomy, known driver-language variants, and record content. Nonverified records participate as blockers so an unresolved situation cannot fall through to an unrelated verified answer.
3. If no record clears the answer threshold, Ready Route withholds an answer, records the unanswered question, and directs the driver to management.
4. If several materially different records remain close, Ready Route asks the driver to select the applicable situation or provide the minimum missing detail.
5. If one verified record is sufficiently supported, Ready Route returns its approved concise answer and optional More Info text.
6. The interaction stores the exact knowledge ID, version, answer snapshot, retrieval score, and response mode.
7. Feedback is stored against the interaction. Feedback never edits or republishes knowledge automatically.

## Data ownership

### Global, versioned knowledge

- `driver_help_knowledge_records`: authoritative structured records and driver-facing answer representations.
- `driver_help_knowledge_sources`: source identity, version/date, and internal location metadata.
- `driver_help_knowledge_record_sources`: exact record-to-source evidence mappings.

Only a controlled import/review process may publish knowledge. All record statuses may be indexed for safe classification, but the driver API can answer only when the selected record has `status = 'VERIFIED'` and `is_published = true`. Publication additionally requires complete production evidence capture and claim-to-fragment trace readiness; VERIFIED records that fail either independent gate remain indexed blockers and cannot answer.

### Account-scoped product data

- `driver_help_sessions`: conversational context for one authenticated driver or manager preview actor.
- `driver_help_interactions`: immutable question, retrieval, and answer snapshots.
- `driver_help_feedback`: one authenticated actor rating per interaction, with optional comment.
- `driver_help_unanswered_questions`: questions that did not produce an approved answer.

All account-scoped records include `account_id`, `actor_type`, and `actor_id`. Real driver activity also carries a foreign-keyed `driver_id`; manager mobile previews are explicitly labeled as manager activity and never impersonate a driver row. Manager reads are restricted by the existing authenticated CSA workspace.

## Retrieval policy

V1 uses deterministic hybrid lexical ranking over the indexed corpus. It favors validated driver-language patterns, exact question variants, and canonical-situation phrases, then token and phrase overlap. Validated patterns also preserve whether a known utterance is sufficient to answer, requires clarification, or must escalate. Conversation context may boost the previously selected record but cannot make a nonverified record answerable.

Response modes:

- `ANSWER`: one published verified record clears the threshold.
- `CLARIFY`: multiple materially different verified candidates remain close.
- `ESCALATE`: no approved record is sufficiently supported.

The architecture permits a future embedding index or language model, but those components may only rank records or render facts already present in selected verified records. Status gating remains deterministic and server-side.

## Initial UI

The driver opens directly to Operational Help:

- large dictation affordance (V1 focuses the field for the phone keyboard's built-in dictation; native in-app recording/transcription remains provider- and privacy-gated);
- short question field;
- concise answer card;
- optional More Info expansion;
- contextual follow-up input;
- thumbs-up/down feedback;
- explicit management escalation state.

The existing route application remains accessible as `Route Tools` during transition. It is not deleted.

Managers receive a small Knowledge Activity page showing answer volume, unanswered questions, negative feedback, selected record/version, and the internal trace ID. Knowledge authoring and publication remain an internal controlled process, not a general manager permission.

## Billing boundary

The existing Stripe subscription is route-count based and must not be silently repurposed. Driver-month billing requires a separate activation ledger that records the first activation date for each driver and creates a nonrefundable calendar-month charge exactly once. Deactivation prevents future months but does not reverse a month already incurred. That billing change is intentionally separate from the initial knowledge runtime.

## Launch gates

- Publish only `VERIFIED` records that also pass production evidence-capture and exact claim-trace gates.
- Validate every imported record checksum and required source evidence.
- Pass retrieval tests built from the driver-language validation library.
- Confirm confidential-source retention and third-party processing terms before enabling external transcription or model providers.
- Complete product Terms of Service and liability review before commercial launch.
- Pilot with controlled contractor accounts and review unanswered/negative-feedback logs daily.
