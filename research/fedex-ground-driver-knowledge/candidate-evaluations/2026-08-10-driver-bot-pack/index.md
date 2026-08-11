# FedEx P&D Driver Bot Knowledge Index

Last compiled: August 10, 2026

## How to use this file

- This file is organized as bot-ready questions and short, point-by-point answers.
- When two sources overlap, use the newer source first.
- If a local manager, station instruction, ISP agreement, or applicable law says something different, that controls over this file.

## Bot answer rules

- Give the `most specific answer possible`.
- If the correct answer depends on one missing detail, ask for it.
- Ask with `simple options`, not an open-ended question.
- State the immediate safe rule first when possible.
- Then offer the options that determine the exact path.
- Prefer `2-4 options` in a follow-up.
- After the driver picks an option, give exact steps for that option only.

## Response modes

### Quick mode

- Use when the driver appears rushed.
- Give the shortest safe operational answer.
- Ask a follow-up only if the answer would otherwise be wrong.
- Prefer:
- `Short answer`
- `One next action`
- `One follow-up if needed`

Example:

- Driver asks: `Can I leave this?`
- Quick mode:
- `Not yet. Does it need a signature? Yes / No / Not sure`

### Guided mode

- Use when the driver needs help identifying the situation.
- Walk the driver through one decision at a time.
- Prefer:
- `Immediate rule`
- `Clarifying question`
- `Options`
- `Exact branch answer`

Example:

- Driver asks: `Can I leave this?`
- Guided mode:
- `Maybe. First: does it need a signature?`
- `Choose one: Yes / No / Not sure`

### When to choose each mode

- Use `Quick mode` if:
- The question is short and urgent.
- The driver likely wants a fast answer.
- The risk is low once one detail is known.

- Use `Guided mode` if:
- The driver says `not sure`.
- The driver does not know the term or label.
- The topic is signature, hazmat, safety, or a code choice.
- The wrong answer could create a service or safety problem.

### Standard bot pattern

1. Give the immediate yes/no or safety rule.
2. Ask the smallest follow-up needed.
3. Offer short options.
4. Give the exact branch answer.

### Example pattern

- Driver asks: `Can I leave a package at the door if it needs a signature?`
- Bot should answer:
- `No, not by default. To give the exact next step, choose one: ISR / DSR / ASR.`

### Recommended follow-up option sets

- Signature type:
- `ISR`
- `DSR`
- `ASR`

- Stop type:
- `Residential`
- `Commercial`
- `Apartment / central receiving`

- Pickup type:
- `Listed pickup`
- `Unlisted pickup`
- `Call tag`
- `Drop box`

- Safety issue:
- `Accident`
- `Dog encounter`
- `Hazmat`
- `Security`

## Driver-first interaction design

### Core goal

- The bot should behave like a practical route helper, not a document search engine.
- Drivers may ask incomplete, rushed, or slang-heavy questions.
- The bot should infer the likely issue, narrow it fast, and give the next correct action.

### What the bot should assume about driver questions

- The question may be incomplete.
- The driver may not know the official term.
- The driver may only know what they see:
- A scanner prompt
- A label
- A door with no answer
- A dog
- A closed business
- A damaged package
- A call from a customer
- The driver may be asking under time pressure.

### What the bot should do with unclear questions

- First identify the likely decision category.
- Then ask the `smallest` clarifying question that changes the answer.
- Offer choices in driver language.
- Avoid asking the driver to type a long explanation unless absolutely necessary.

### Preferred answer order

1. Immediate safe rule
2. One clarifying question if needed
3. Short options
4. Exact steps
5. Escalation point if the driver needs station, CPC, AO/BC, police, or FedEx help

### Preferred tone

- Short
- Direct
- Calm
- Operational
- No long policy paragraphs
- No jargon unless the jargon helps the driver choose correctly

### Bad vs good answer style

- Bad:
- `That depends on several factors involving service type and delivery classification.`

- Good:
- `Don’t leave it yet. Is it ISR, DSR, or ASR?`

### If the driver says "not sure"

- The bot should not stop.
- The bot should ask the next easiest identifying question based on what the driver can see.

Example:

- Driver says: `Not sure if it needs a signature.`
- Bot should ask:
- `Do you see one of these?`
- `ISR`
- `DSR`
- `ASR`
- `Alcohol label`
- `A signature prompt in FORGE`
- `None of those`

## Not-sure helper flows

### If the driver says: `I don't know if it needs a signature`

- Bot should ask:
- `What do you see?`
- `ISR`
- `DSR`
- `ASR`
- `Alcohol label`
- `Signature prompt in FORGE`
- `None of those`

- If `ISR`
- Explain ISR path.

- If `DSR`
- Explain DSR path.

- If `ASR`
- Explain ASR path.

- If `Alcohol label`
- Treat it as `ASR` delivery rules.

- If `Signature prompt in FORGE`
- Treat it as signature-controlled and ask the driver what type is shown on screen if visible.

- If `None of those`
- Continue with stop-type questions:
- `Is it residential or commercial?`

### If the driver says: `I don't know if this is residential or commercial`

- Bot should ask:
- `Which sounds more like the stop?`
- `Home or private residence`
- `Business, office, store, school, hospital, warehouse, or mailroom`
- `Still not sure`

- If `Still not sure`
- Default to:
- `If obvious business activity is happening there, treat it as commercial.`

### If the driver says: `I don't know what this label means`

- Bot should ask:
- `What do you see on the label or screen?`
- `ISR / DSR / ASR`
- `Alcohol`
- `Hazmat / dangerous goods`
- `HAL / hold at location`
- `Call tag`
- `Not sure`

### If the driver says: `I don't know what code fits`

- Bot should ask:
- `What happened?`
- `Delivered`
- `Tried but couldn't finish`
- `Didn't attempt`
- `Pickup problem`

### If the driver says: `I don't know if I can take this package`

- Bot should ask:
- `What kind of package does it look like?`
- `Normal package`
- `Signature package`
- `Alcohol`
- `Hazmat`
- `Damaged or leaking`
- `Not sure`

### If the driver uses slang or partial wording

- Translate it internally before answering.

Common examples:

- `Can I leave this one?`
- Likely means driver release vs signature-required.

- `Nobody home`
- Likely means delivery attempt workflow.

- `Business closed`
- Could mean delivery exception, pickup exception, or Business Closure message.

- `This one needs ID`
- Likely means ASR or other ID-scan workflow.

- `It’s got a hazmat label`
- Could mean accepted transport rules, dangerous goods pickup block, or loading/paperwork rules.

- `Customer says hold it`
- Could mean HAL, future delivery request, or no-attempt request.

## Ambiguity handling map

### If the driver asks: `Can I leave this?`

- First ask:
- `Does it need a signature?`
- `Yes`
- `No`
- `Not sure`

- If `Yes`
- Ask:
- `Which type? ISR / DSR / ASR / Not sure`

- If `No`
- Ask:
- `Is it residential or commercial?`
- `Residential`
- `Commercial`
- `Not sure`

- If `Not sure`
- Ask:
- `What do you see?`
- `ISR/DSR/ASR`
- `Alcohol label`
- `Signature prompt`
- `Nothing special`

### If the driver asks: `Customer not home, what do I do?`

- First ask:
- `What kind of package is it?`
- `Signature-required`
- `Normal residential`
- `Commercial`
- `Alcohol`
- `Not sure`

### If the driver asks: `Business is closed`

- First ask:
- `Is this about a delivery, a pickup, or future closed dates?`
- `Delivery right now`
- `Pickup right now`
- `Customer says they will be closed on future dates`

### If the driver asks: `What code do I use?`

- First ask:
- `Did you complete the stop, attempt it but not finish, or make no attempt?`
- `Completed`
- `Attempted but not completed`
- `No attempt`

### If the driver asks: `This package looks wrong`

- First ask:
- `What looks wrong?`
- `Damaged packaging`
- `Hazmat label or paperwork issue`
- `Bad address`
- `Old labels or bad tape`
- `Something else`

### If the driver asks: `I can’t scan this`

- First ask:
- `What kind of problem is it?`
- `Barcode won’t scan`
- `FORGE won’t sync`
- `FORGE won’t log in`
- `Package not on manifest`

### If the driver asks: `I had an accident`

- First ask:
- `Any injuries or immediate traffic hazard?`
- `Yes`
- `No`

### If the driver asks: `Dog at the stop`

- First ask:
- `What is the dog doing?`
- `Just present`
- `Approaching`
- `Aggressive`
- `Bit me`

## Escalation rules

### Escalate to AO/BC or station when

- The vehicle is unsafe.
- There is an accident.
- There is a security incident.
- There is uncertain Hazmat acceptance.
- The package appears intercepted, prohibited, leaking, or dangerous.
- A local station process is required.

### Escalate to CPC when

- Pickup information is wrong.
- A customer change affects pickup service.
- A dangerous goods pickup is blocked in FORGE and needs guidance.
- A business closure, shipper-at-risk, or sales-lead message is needed.

### Escalate to police / emergency services when

- There are injuries.
- There is an active threat.
- A loaded vehicle is stolen.
- A crime or urgent roadway hazard is involved.

## Response templates the bot should reuse

### Template: yes/no with branch

- `Short answer: <yes/no/maybe>.`
- `To give the exact next step, choose one: <option 1> / <option 2> / <option 3>.`

### Template: safety first

- `First: <immediate safety action>.`
- `Then choose one: <option 1> / <option 2>.`

### Template: code lookup

- `I can give the right code. Which situation is this?`
- `<option 1>`
- `<option 2>`
- `<option 3>`

### Template: not sure path

- `No problem. What do you see?`
- `<visible clue 1>`
- `<visible clue 2>`
- `<visible clue 3>`

## High-value driver scenarios to optimize for

- Signature-needed and nobody home
- Can I leave this package?
- What code do I use?
- Business closed
- Pickup not ready
- Wrong address
- Damaged package
- Hazmat label or paperwork issue
- Dog at stop
- Accident
- FORGE login or delayed login
- Package not on manifest
- Call tag handling
- Customer asking where the package is
- Customer wants future close dates or no attempt
- Driver says `not sure what I'm looking at`

## FedEx term helper section

### HAL

- Meaning: `Hold at Location`
- Use it when: a package is being delivered to an approved hold location instead of the original recipient address.
- Driver should know:
- It is not the same as an ordinary future-delivery request.
- If HAL cannot be completed, related exception coding may apply.

### RTH

- Meaning: `Redirect to Hold at Location`
- Use it when: the shipment is redirected to a hold location.
- Driver should know:
- It is related to HAL but is specifically a redirect workflow.

### PRC

- Meaning: `Package Research Case`
- Use it when: a customer is asking where their package is or wants more detail than basic tracking provides.
- Driver should know:
- It often comes through as a message or case with stop details.

### CPC

- Meaning: `Customer Pickup Coordination`
- Use it when: pickup details, pickup changes, business closures, shipper-at-risk, or related pickup support is needed.

### FCC

- Meaning: `FedEx Customer Connection`
- Use it when: AOs/BCs need to manage manifests, pickups, messaging, and service-area coordination.

### FAD

- Meaning: `FedEx Authenticated Delivery`
- Use it when: the package requires the newer authenticated-delivery workflow in FORGE.
- Driver should know:
- QR-code and restriction rules may apply in newer FORGE versions.

### DVIR

- Meaning: `Daily Vehicle Inspection Report`
- Use it when: a vehicle is used for route operations.
- Driver should know:
- If vehicles are changed during the day, every vehicle used still needs the proper DVIR handling.

### SRA

- Meaning: `Shipment Release Authorization`
- Use it when: an approved release authorization form is part of the workflow.
- Driver should know:
- It is not the same as a normal driver release decision.

### OP-200

- Meaning: `Shipment Status Door Tag`
- Use it when: leaving a delivery-attempt notice or completing approved signature workflows tied to the door tag.

### OP-201

- Meaning: business release waiver on file at station.
- Use it when: a commercial delivery may be allowed to be released without a normal signature.
- Driver should know:
- Without a valid `OP-201`, commercial deliveries should not be driver released.

### PPOD

- Meaning: `Picture Proof of Delivery`
- Use it when: photo proof is required for the delivery workflow.

### PPODA

- Meaning: `Picture Proof of Delivery Attempt`
- Use it when: the attempt workflow requires a photo-supported attempt record.

## Driver utterance patterns

### If the driver says: `Can I leave this?`

- Bot should respond:
- `Maybe. First: does it need a signature?`
- `Choose one: Yes / No / Not sure`

### If the driver says: `Nobody home`

- Bot should respond:
- `Don't leave it yet. What kind of package is it?`
- `Choose one: Signature-required / Normal residential / Commercial / Alcohol / Not sure`

### If the driver says: `Can front desk take it?`

- Bot should respond:
- `Is it signature-required?`
- `Choose one: Yes / No / Not sure`

### If the driver says: `What code do I use?`

- Bot should respond:
- `Which happened?`
- `Choose one: Completed / Attempted but not completed / No attempt`

### If the driver says: `Business closed`

- Bot should respond:
- `Is this about right now or future closed dates?`
- `Choose one: Closed right now / Future closed dates`

### If the driver says: `Pickup not ready`

- Bot should respond:
- `Use pickup exception code 10: Pickup Not Ready - Dispatch Again.`

### If the driver says: `Wrong address`

- Bot should respond:
- `Do you mean the label is wrong, or you still can't find the place?`
- `Choose one: Label is wrong / Can't locate it`

### If the driver says: `Can't scan it`

- Bot should respond:
- `What kind of scan problem is it?`
- `Choose one: Barcode won't scan / FORGE won't sync / FORGE won't log in / Package not on manifest`

### If the driver says: `Not on manifest`

- Bot should respond:
- `Is this a delivery package or a pickup situation?`
- `Choose one: Delivery package / Pickup situation`

### If the driver says: `Dog here`

- Bot should respond:
- `What is the dog doing?`
- `Choose one: Just present / Approaching / Aggressive / Bit me`

### If the driver says: `Accident`

- Bot should respond:
- `Any injuries or immediate traffic hazard?`
- `Choose one: Yes / No`

### If the driver says: `Hazmat`

- Bot should respond:
- `What kind of hazmat issue is it?`
- `Choose one: Pickup acceptance / Paperwork / Loading or transport / Leaking or damaged / Alaska or Hawaii restriction`

### If the driver says: `Can I take this?`

- Bot should respond:
- `What kind of package is it?`
- `Choose one: Normal package / Signature package / Alcohol / Hazmat / Not sure`

### If the driver says: `Customer wants it held`

- Bot should respond:
- `Do you mean hold for a future date, hold at location, or no attempt today?`
- `Choose one: Future date / Hold at location / No attempt today / Not sure`

### If the driver says: `This one needs ID`

- Bot should respond:
- `Is it an ASR or another ID-check workflow?`
- `Choose one: ASR / High-risk or scanner ID prompt / Not sure`

### If the driver says: `Package shows delivered but customer says it isn't there`

- Bot should respond:
- `Is this a direct customer complaint or a PRC / FORGE message?`
- `Choose one: Direct customer complaint / PRC or FORGE message / Not sure`

### If the driver says: `Stop shipment` or `intercept`

- Bot should respond:
- `Did FORGE say the package was intercepted and should be returned to the station?`
- `Choose one: Yes / No / Not sure`

### If the driver says: `Customer asking where the package is`

- Bot should respond:
- `Is this a tracking question or a package research case message?`
- `Choose one: Customer asking me in person / PRC or message in FORGE / Not sure`

### If the driver says: `Closed business, no package`

- Bot should respond:
- `If this is a pickup with no packages, use pickup exception code 11: Closed - Attempted, No Packages.`

### If the driver says: `Can I leave with neighbor?`

- Bot should respond:
- `Only if the package allows indirect delivery. Is it ISR, DSR, ASR, or not sure?`

### If the driver says: `Alcohol package`

- Bot should respond:
- `Adult Signature Required applies. No driver release, no indirect delivery, and verify ID.`

### If the driver says: `Can I put it in mailbox?`

- Bot should respond:
- `No. Never leave a package in a U.S. mailbox.`

### If the driver says: `Leaking package`

- Bot should respond:
- `Do not handle it if unsafe. Pull over when safe and contact a FedEx station representative immediately.`

### If the driver says: `Vehicle stolen`

- Bot should respond:
- `Call local law enforcement immediately, then GSOC at 1-800-872-8025, then notify station management/security.`

## Source priority used for this index

### Highest priority

1. `FORGE 3.3.0 Combined Application Support Guide: Service Provider` dated `July 23, 2026`
2. `On the Road Reference Guide OP-117` last updated `December 15, 2025`
3. `Customer Experience Quick Reference MGB-119` revised `November 6, 2025`
4. `Independent Service Provider Agreement Equipment Terms` dated `November 21, 2025`
5. `Vehicle Appearance and Brand Promotion FAQ` dated `January 2, 2026`
6. `Dog Bite Prevention` dated `April 6, 2026`
7. `SRS / SRI FAQ` revised `August 2025`

### Supporting sources

- `FORGE P&D Application Guide` dated `April 1, 2025`
- `FORGE Delayed Login`, `FORGE Call Tags`, `FORGE Business Closure`, `FORGE Download Pickup List`, `FORGE Settings`
- `OP-130`, `OP-132`, `OP-135` accident forms dated `August-September 2025`
- `FedEx_Driver_Bot_Scenarios.xlsx`

### Rule for older duplicates

- If an older PDF and a newer PDF cover the same topic, this index follows the newer one.
- The scenario spreadsheet was used only when it did not conflict with newer official PDFs.

---

## Delivery and signature questions

### Decision path: package at the door

- If the driver asks:
- `Can I leave this?`
- `Can I drop this one?`
- `Can I leave it at the door?`

- Bot should answer:
- `Maybe. First: does it need a signature?`
- `Choose one: Yes / No / Not sure`

- If `Yes`
- Move to the signature-type question.

- If `No`
- Ask:
- `Is it residential or commercial?`
- `Residential`
- `Commercial`
- `Not sure`

- If `Not sure`
- Ask:
- `What do you see?`
- `ISR/DSR/ASR`
- `Alcohol label`
- `Signature prompt`
- `Nothing special`

### What are the three signature service types?

- `Indirect Signature Required (ISR)`
- Signature can come from someone at the delivery address.
- Signature can also come from someone at a neighboring address if a door tag is left at the original address.
- A signature may also be provided on approved forms such as `OP-200`, `OP-200CB`, or `OP-200SP`.

- `Direct Signature Required (DSR)`
- Signature must be in person from someone at the delivery address.
- No neighbor substitute.

- `Adult Signature Required (ASR)`
- The person accepting must be `21+`.
- Get an in-person signature.
- Scan the recipient’s government-issued ID when required.
- If barcode scan fails or they refuse scan, date of birth may be manually entered only where FORGE allows it.
- If they refuse to provide ID at all, do not deliver.

### Can I leave a signature-required package without a signature?

- No.
- Do not driver release it.
- Do not leave it unattended.
- Leave a shipment status door tag if the delivery cannot be completed.

### Bot-ready answer: Can I leave a package at the door if it needs a signature?

- No, not by default.
- Do not driver release it.
- Do not leave it unattended.
- To give the exact next step, choose one:
- `ISR`
- `DSR`
- `ASR`

#### If the driver chooses `ISR`

- Check whether someone at the address can sign.
- If not, an indirect option may be possible if allowed.
- A neighbor signature may be used only if ISR rules are met.
- If indirect delivery is completed:
- Get the signature.
- Record the indirect delivery address.
- Leave a shipment status door tag at the original address.
- If indirect delivery is not completed:
- Do not leave the package.
- Apply the correct attempt code.

#### If the driver chooses `DSR`

- Signature must come from someone at the delivery address.
- No neighbor substitute.
- Do not leave the package.
- Leave a shipment status door tag.
- Apply the correct attempt code.

#### If the driver chooses `ASR`

- A `21+` adult must be present.
- Complete the ID check and in-person signature.
- No indirect delivery.
- No driver release.
- Do not leave the package.
- Leave a shipment status door tag.
- Apply the correct attempt code.

### What are the alcohol delivery rules?

- `ASR` is required every time.
- Verify age with valid ID.
- Do not deliver to a visibly intoxicated person.
- No indirect delivery.
- No driver release.
- No release using a signed door tag.

### What should I do if nobody is available for a signature-required package?

- Do not leave the package.
- Complete the delivery attempt in FORGE.
- Leave a shipment status door tag at the delivery point.
- Use the correct status code for the situation.

### Decision path: nobody answered

- If the driver asks:
- `Nobody home`
- `No one answered`
- `Customer isn't there`

- Bot should answer:
- `What kind of stop is it?`
- `Signature-required`
- `Normal residential`
- `Commercial`
- `Alcohol`
- `Not sure`

- If `Signature-required`
- Use the signature branch above.

- If `Normal residential`
- Ask:
- `Is there a secure, weather-protected place out of public view?`
- `Yes`
- `No`

- If `Yes`
- Residential driver release may be allowed if no signature service applies.

- If `No`
- Do not leave the package.
- Use the correct code and follow station process.

- If `Commercial`
- Do not driver release unless a valid `OP-201` waiver applies.

- If `Alcohol`
- Do not leave it.
- Follow `ASR` rules.

### Bot-ready answer: What do I do if I need a signature and nobody is home?

- Do not leave the package.
- Complete the delivery attempt in FORGE.
- Leave a shipment status door tag.
- To give the exact path, choose one:
- `ISR`
- `DSR`
- `ASR`

#### If `ISR`

- Check whether indirect delivery can be completed under ISR rules.
- If yes:
- Deliver to the valid indirect location.
- Get the signature there.
- Record the indirect address.
- Leave and scan a shipment status door tag at the original address.
- If no:
- Do not leave the package.
- Apply the correct status code.
- Reattempt on the next service day if attempts remain.

#### If `DSR`

- Do not leave it with a neighbor.
- Do not driver release it.
- Leave a shipment status door tag.
- Apply the correct status code.
- Reattempt on the next service day if attempts remain.

#### If `ASR`

- Do not leave it with a neighbor.
- Do not driver release it.
- A qualified `21+` adult must be present with ID.
- Leave a shipment status door tag.
- Apply the correct status code.
- Reattempt on the next service day if attempts remain.

### How many delivery attempts are required when a package cannot be driver released?

- Attempt delivery on `three different service days`.

### Can a signature-required apartment, hospital, hotel, university, or gated site be completed at a central receiving area?

- Yes, if someone is available there to sign.
- All normal signature requirements still apply.
- This is especially relevant for central receiving or mailroom type locations.

### Decision path: front desk or mailroom

- If the driver asks:
- `Can front desk sign?`
- `Can the mailroom take it?`
- `Can I leave it with central receiving?`

- Bot should answer:
- `Is it signature-required?`
- `Yes`
- `No`
- `Not sure`

- If `Yes`
- A central receiving area may take it if someone is available there to sign and all normal signature rules are met.

- If `No`
- Follow normal placement or release rules for that stop type.

- If `Not sure`
- Ask whether the package shows `ISR`, `DSR`, `ASR`, or a signature prompt.

### Decision path: locker delivery

- If the driver asks:
- `Can I leave in locker`
- `Can I use this locker`

- Bot should answer:
- `What kind of locker is it?`
- `Third-party locker system`
- `Building or mailroom locker`
- `Not sure`

- If `Third-party locker system`
- Follow the allowed locker-release workflow only if the package type permits it.

- If `Building or mailroom locker`
- Do not assume it is automatically allowed.
- Check whether the package is signature-required and whether the location is functioning as central receiving.

- If `Not sure`
- Ask whether the locker is an approved system or just part of the building.

### What counts as a commercial delivery vs. residential delivery?

- `Residential` means a home or private residence with no apparent business activity.
- `Commercial` means everything else.
- If business activity is apparent, treat it as commercial even if someone also lives there.

### When can I driver release a package?

- Only if all of these are true:
- It is addressed to a home or private residence.
- It has a single-family entryway.
- It has no signature-required service.
- It can be left at a secure location at the primary entrance, unless customer instructions specify another reasonable location.
- It is out of public view.
- It is protected from weather.
- It is not placed in a USPS mailbox.
- It follows reasonable customer instructions.

### Bot-ready answer: Can I driver release this package?

- Maybe, but I need the package type or stop type.
- Choose one:
- `Residential, no signature service`
- `Commercial`
- `Signature-required`
- `Alcohol or controlled substance`
- `Hazmat`

#### If `Residential, no signature service`

- Driver release is allowed only if all residential conditions are met.
- Leave it in a secure location.
- Keep it out of public view.
- Protect it from weather.
- Follow reasonable customer instructions.
- Do not use a USPS mailbox.

#### If `Commercial`

- Do not driver release unless a valid `OP-201` waiver applies.

#### If `Signature-required`

- Do not driver release.

#### If `Alcohol or controlled substance`

- Do not driver release.

#### If `Hazmat`

- Do not driver release.

### What can never be driver released?

- Any signature-required package.
- Alcohol.
- Controlled substances.
- Hazardous materials, including limited quantities.
- Commercial deliveries, unless a signed `OP-201` waiver is on file.
- Anything left in a U.S. mailbox.

### What should I do if there is no safe place to driver release?

- Do not leave the package.
- Try indirect delivery if that option is allowed.
- Otherwise code the package correctly and leave a shipment status door tag.
- Return it per normal process.

### How do I complete an indirect delivery?

- Record the address where the package was left.
- Get a signature from the person at that indirect location.
- Complete and scan the shipment status door tag.
- Leave the door tag at the original address.

### What are the customer expectations for package placement?

- Leave packages in a secure location.
- Keep them out of public view.
- Protect them from weather.
- Follow reasonable customer instructions.
- Knock or ring unless instructions say not to.
- Deliver to the correct address.
- Never throw or mishandle packages.

### Decision path: disputed delivery complaint

- If the driver asks:
- `Customer says it shows delivered but they don't have it`
- `Marked delivered but isn't there`

- Bot should answer:
- `Is this a direct customer complaint or a PRC / FORGE message?`
- `Direct customer complaint`
- `PRC or FORGE message`
- `Not sure`

- If `Direct customer complaint`
- Keep the response factual.
- Do not guess or promise an outcome.
- Escalate through the normal package-research or station process.

- If `PRC or FORGE message`
- Use the case details and follow the package-research workflow.

- If `Not sure`
- Ask whether the driver is being asked in person or responding to a system message.

### What should the delivery photo show?

- Show the package in the exact place it was left.
- Include nearby surroundings so the location is clear.
- Keep the package visible in frame.
- Do not include the customer or bystanders if possible.
- Do not include label details or street address if avoidable.
- Residential driver release photos are required where the workflow calls for them.

### How do I fill out a service cross or door tag?

- Include the status code.
- Include your name or initials.
- Include the time.
- Include the date.
- Include the work area number.

---

## Status code questions

### Code handling rule for the bot

- The bot should support both question styles:
- `Which code do I use?`
- `What does code 027 mean?`

- If the driver gives a code number:
- Explain what the code means.
- State whether it is delivery, pickup, completed, attempted, or no-attempt.
- Give the exact situation where it should be used.
- Give one short warning if drivers often confuse it with another code.

- If the driver describes a situation without a code:
- Narrow it to the correct code using options.
- Return only the best-fit code unless the situation truly has multiple valid paths.

### Decision path: code lookup

- If the driver asks:
- `What code do I use?`
- `What do I sheet this as?`

- Bot should answer:
- `Which happened?`
- `Completed`
- `Attempted but not completed`
- `No attempt`

- If `Completed`
- Ask:
- `Which result?`
- `Business delivery`
- `Residential signature`
- `Residential driver release`
- `Indirect delivery`
- `Call tag pickup`

- If `Attempted but not completed`
- Ask:
- `Why not completed?`
- `Wrong address`
- `Couldn't locate`
- `Customer not in`
- `Refused`
- `Security delay`
- `Inspection required`

- If `No attempt`
- Ask:
- `Why no attempt?`
- `Wrong route`
- `Package not on van`
- `Holding package`
- `Weather`
- `Customer request`

### Decision path: what does this code mean?

- If the driver asks:
- `What is code 027?`
- `What does 004 mean?`
- `When do I use 079?`

- Bot should answer in this format:
- `Code <number> = <plain-English meaning>.`
- `Use it when: <exact situation>.`
- `Type: <delivery completed / delivery attempted not completed / no attempt / pickup exception / transfer / other>.`
- `Do not use it for: <most common confusion>, if needed.`

### Uniform code template

- Every code answer should use this exact shape:
- `Code <number>`
- `Meaning:`
- `Use it when:`
- `Do not use it when:`
- `Often confused with:`

### Delivery not attempted codes

#### Code `011`
- Meaning: Non-residential recipient closed on Saturday.
- Use it when: a non-residential delivery cannot be completed because the recipient is closed on Saturday.
- Do not use it when: it is a normal weekday closure.
- Often confused with: `004`, which is non-residential recipient not in.

#### Code `012`
- Meaning: Package sorted to wrong route.
- Use it when: the package was operationally sorted to the wrong route.
- Do not use it when: the package is on your manifest but physically missing from your van.
- Often confused with: `016`, which is package on manifest, not on van.

#### Code `015`
- Meaning: Holding package.
- Use it when: the package is being held instead of delivered that day.
- Do not use it when: no attempt was made for some other reason.
- Often confused with: `100`, which is customer request no attempt made.

#### Code `016`
- Meaning: Package on manifest, not on van.
- Use it when: the package shows on the manifest but is not actually on the vehicle.
- Do not use it when: the package was sorted to the wrong route.
- Often confused with: `012`, which is wrong route.

#### Code `017`
- Meaning: Misdelivered package picked up.
- Use it when: a misdelivered package is picked up from the wrong location.
- Do not use it when: you are completing delivery to the correct recipient.
- Often confused with: `018`, which is misdelivered package delivered to correct recipient.

#### Code `027`
- Meaning: Package not delivered - no attempt.
- Use it when: no delivery attempt was made.
- Do not use it when: the customer specifically requested that no attempt be made.
- Often confused with: `100`, which is customer request no attempt made.

#### Code `079`
- Meaning: Enroute package transfer.
- Use it when: a package or stop is transferred enroute between vehicles or routes.
- Do not use it when: the workflow specifically calls for internal FedEx transfer coding.
- Often confused with: `095`, which is intra-FedEx transfer.

#### Code `081`
- Meaning: Contractor refused package.
- Use it when: the contractor refuses the package.
- Do not use it when: the recipient refused the package.
- Often confused with: `006`, which is package refused by recipient.

#### Code `082`
- Meaning: Local weather delay.
- Use it when: weather prevents delivery.
- Do not use it when: the real issue was security, address, or access.
- Often confused with: `001`, which is security delay.

#### Code `083`
- Meaning: Delivery restricted / local holiday.
- Use it when: a local holiday restriction prevents delivery.
- Do not use it when: the customer requested future delivery.
- Often confused with: `034`, which is inventory or request future delivery.

#### Code `095`
- Meaning: Intra-FedEx transfer.
- Use it when: the package is being moved under an internal FedEx transfer workflow.
- Do not use it when: it is a standard route-to-route enroute transfer.
- Often confused with: `079`, which is enroute package transfer.

#### Code `100`
- Meaning: Customer request - no attempt made.
- Use it when: the customer requested that no attempt be made.
- Do not use it when: no attempt was made for operational reasons.
- Often confused with: `027`, which is no attempt without a customer request.

### Delivery attempted but not completed codes

#### Code `001`
- Meaning: Increased security / customer security delay.
- Use it when: security restrictions or access controls prevent delivery.
- Do not use it when: weather or address issues are the real problem.
- Often confused with: `082` for weather and `003` for unable to locate.

#### Code `002`
- Meaning: Incorrect recipient address.
- Use it when: the label address is wrong.
- Do not use it when: the address may be correct but you still cannot find the place.
- Often confused with: `003`, which is unable to locate.

#### Code `003`
- Meaning: Unable to locate - recipient address.
- Use it when: the address may be right but the location still cannot be found.
- Do not use it when: the label address itself is wrong.
- Often confused with: `002`, which is incorrect recipient address.

#### Code `004`
- Meaning: Non-residential recipient not in.
- Use it when: a commercial or other non-residential recipient is not available.
- Do not use it when: the stop is residential.
- Often confused with: `007`, which is residential recipient not in.

#### Code `006`
- Meaning: Package refused by recipient.
- Use it when: the recipient refuses the package.
- Do not use it when: the contractor refuses the package.
- Often confused with: `081`, which is contractor refused package.

#### Code `007`
- Meaning: Residential recipient not in, unable to indirect or driver release.
- Use it when: a residential recipient is not in and the package cannot be indirectly delivered or driver released.
- Do not use it when: the stop is commercial.
- Often confused with: `004`, which is non-residential recipient not in.

#### Code `010`
- Meaning: Inspection required.
- Use it when: inspection is required before delivery can be completed.
- Do not use it when: the problem is really damage, address, or recipient availability unless inspection is the actual blocker.
- Often confused with: no single common code, but it is often miscoded as a general exception.

#### Code `030`
- Meaning: Retail refusal / O.S.A.
- Use it when: a retail refusal or O.S.A. workflow applies.
- Do not use it when: it is a normal recipient refusal at a standard stop.
- Often confused with: `006`, which is package refused by recipient.

#### Code `034`
- Meaning: Inventory / request future delivery.
- Use it when: the package is being inventoried or the customer requested future delivery.
- Do not use it when: the customer requested no attempt that day.
- Often confused with: `100`, which is customer request no attempt made.

#### Code `250`
- Meaning: Unable to hold at location.
- Use it when: a requested hold-at-location cannot be completed.
- Do not use it when: the package is simply being held or the stop failed for another reason.
- Often confused with: `015`, which is holding package.

### Delivery attempted and completed codes

#### Code `009`
- Meaning: Delivery to a business.
- Use it when: a normal business delivery is completed.
- Do not use it when: the business delivery was completed specifically as a driver release.
- Often confused with: `021`, which is business driver release.

#### Code `013`
- Meaning: Residential delivery with signature.
- Use it when: a residential delivery is completed with signature.
- Do not use it when: the package was driver released.
- Often confused with: `014`, which is residence driver release.

#### Code `014`
- Meaning: Residence driver release.
- Use it when: a residential delivery is completed by driver release.
- Do not use it when: the package was indirectly delivered to another person or location.
- Often confused with: `019`, which is indirect delivery.

#### Code `018`
- Meaning: Misdelivered package delivered to correct recipient.
- Use it when: a previously misdelivered package is delivered to the correct recipient.
- Do not use it when: you are only picking up the misdelivered package.
- Often confused with: `017`, which is misdelivered package picked up.

#### Code `019`
- Meaning: Indirect delivery.
- Use it when: delivery is completed through an allowed indirect-delivery path.
- Do not use it when: the package was simply driver released at the original residence.
- Often confused with: `014`, which is residence driver release.

#### Code `021`
- Meaning: Business driver release.
- Use it when: a business delivery is completed as a driver release where allowed.
- Do not use it when: it was a normal business delivery with standard completion.
- Often confused with: `009`, which is delivery to a business.

#### Code `025`
- Meaning: Tendered to U.S. Postal Service.
- Use it when: the package is handed off to USPS.
- Do not use it when: it is handed to another carrier.
- Often confused with: `028`, which is tendered to connecting line carrier.

#### Code `026`
- Meaning: RTS package - delivered to shipper.
- Use it when: a return-to-shipper package is delivered back to the shipper.
- Do not use it when: it is just a normal return scenario without RTS workflow.
- Often confused with: no single common code, but drivers sometimes misuse generic completion codes.

#### Code `028`
- Meaning: Tendered to connecting line carrier.
- Use it when: the package is handed off to another carrier.
- Do not use it when: the handoff is to USPS or an internal FedEx transfer.
- Often confused with: `025` for USPS and `095` for intra-FedEx transfer.

#### Code `029`
- Meaning: Call tag package pickup.
- Use it when: a call tag package is successfully picked up.
- Do not use it when: the call tag is cancelled for suspected fraud.
- Often confused with: `106`, which is all call tags cancelled: suspected fraud.

### Pickup exception codes

#### Code `01`
- Meaning: Missed pickup - DNA.
- Use it when: a pickup was missed and no attempt was made.
- Do not use it when: the pickup was attempted but not ready.
- Often confused with: `10`, which is pickup not ready.

#### Code `10`
- Meaning: Pickup not ready - dispatch again.
- Use it when: the pickup was attempted but the shipment was not ready.
- Do not use it when: the stop was closed or there were no packages available.
- Often confused with: `11`, which is closed - attempted, no packages.

#### Code `11`
- Meaning: Closed - attempted, no packages.
- Use it when: the pickup stop was closed or no packages were available after an attempt.
- Do not use it when: the stop is a residential pickup and the customer is simply not home.
- Often confused with: `15`, which is residential pickup, not home.

#### Code `14`
- Meaning: Weather.
- Use it when: weather prevented the pickup.
- Do not use it when: you mean the delivery weather code.
- Often confused with: delivery code `082`, which is local weather delay.

#### Code `15`
- Meaning: Residential pickup, not home.
- Use it when: a residential pickup customer is not home.
- Do not use it when: a commercial stop is closed or has no packages.
- Often confused with: `11`, which is closed - attempted, no packages.

#### Code `16`
- Meaning: Holiday.
- Use it when: a holiday prevents the pickup.
- Do not use it when: you mean the delivery-side local holiday restriction.
- Often confused with: delivery code `083`, which is delivery restricted / local holiday.

#### Code `17`
- Meaning: Hazmat - pickup not made.
- Use it when: a hazmat-related issue prevents the pickup.
- Do not use it when: the issue is really wrong address or not ready.
- Often confused with: `25`, which is wrong address, and `10`, which is pickup not ready.

#### Code `21`
- Meaning: Express pickup - cancel.
- Use it when: an Express pickup is cancelled under that workflow.
- Do not use it when: it is a standard non-Express pickup cancellation.
- Often confused with: `24`, which is pickup cancelled - no attempt made.

#### Code `24`
- Meaning: Pickup cancelled - no attempt made.
- Use it when: the pickup was cancelled and no attempt was made.
- Do not use it when: the stop was actually attempted.
- Often confused with: `10` or `11`, which both imply an attempt happened.

#### Code `25`
- Meaning: Wrong address - pickup not made.
- Use it when: the pickup address is wrong.
- Do not use it when: the address may be right but the customer is unavailable.
- Often confused with: `15`, which is residential pickup not home, and `11`, which is closed - attempted, no packages.

#### Code `26`
- Meaning: Pickup not scanned.
- Use it when: the pickup should have occurred but was not scanned.
- Do not use it when: another real pickup exception better describes what happened.
- Often confused with: `10`, `11`, or `24` when drivers try to backfill a missed workflow.

### Canada and transfer-related codes

#### Code `251`
- Meaning: Tendered to Canada Post.
- Use it when: the shipment is tendered to Canada Post.
- Do not use it when: the handoff is to USPS or another carrier.
- Often confused with: `252`, which is PO Box or rural-route Canada Post.

#### Code `252`
- Meaning: PO Box or rural route Canada Post.
- Use it when: the package is handed off through the Canada Post PO Box or rural-route path.
- Do not use it when: it is an ordinary Canada Post tender.
- Often confused with: `251`, which is standard Canada Post tender.

#### Code `253`
- Meaning: Air restricted interline.
- Use it when: the package is moved under air-restricted interline handling.
- Do not use it when: it is a normal connecting line carrier handoff.
- Often confused with: `028`, which is tendered to connecting line carrier.

### Call tag special code

#### Code `106`
- Meaning: All call tags cancelled: suspected fraud.
- Use it when: the call tag workflow requires cancellation of all call tags at the stop for suspected fraud.
- Do not use it when: the call tag package was successfully picked up.
- Often confused with: `029`, which is call tag package pickup.

### Newer FORGE Express pickup codes

#### Code `351`
- Meaning: Future delivery requested.
- Use it when: the customer requests a future delivery date during the Express pickup workflow.
- Do not use it when: you are coding a standard Ground delivery future-date issue.
- Often confused with: `034`, which is inventory / request future delivery on the delivery side.

#### Code `352`
- Meaning: Package received after A/C or shuttle departure.
- Use it when: an Express pickup is received after cutoff in that workflow.
- Do not use it when: the issue is simply pickup not ready or a missed pickup.
- Often confused with: `10`, which is pickup not ready.

#### Code `353`
- Meaning: Improper or missing regulatory paperwork.
- Use it when: an Express international pickup has incomplete regulatory paperwork.
- Do not use it when: you are using the general service-provider Hazmat pickup-not-made code.
- Often confused with: `17`, which is Hazmat - pickup not made.

#### Code `354`
- Meaning: Country or city not served.
- Use it when: the Express zero-package pickup workflow says the destination is not served.
- Do not use it when: the stop failed for a normal address or readiness issue.
- Often confused with: `25`, which is wrong address - pickup not made.

#### Code `355`
- Meaning: Exceeds service limits.
- Use it when: the Express zero-package pickup workflow shows service limits were exceeded.
- Do not use it when: the issue is address, cancellation, or paperwork.
- Often confused with: `356`, which is incorrect pickup info.

#### Code `356`
- Meaning: Incorrect pickup info.
- Use it when: the Express zero-package pickup workflow shows the pickup information is incorrect.
- Do not use it when: the issue is service limits or country/city not served.
- Often confused with: `355`, which is exceeds service limits.

#### Code `357`
- Meaning: Attempted pickup left behind.
- Use it when: the Express zero-package pickup workflow says the pickup was attempted but left behind.
- Do not use it when: no attempt was made.
- Often confused with: `24`, which is pickup cancelled - no attempt made.

#### Code `358`
- Meaning: Counter-user-specific code enabled in newer FORGE guidance.
- Use it when: that exact counter-user workflow applies.
- Do not use it when: you are working a standard service-provider route stop.
- Often confused with: other Express-special workflow codes, because it is not a general route code.

### What code do I use for a normal business delivery?

- `009` Delivery to a Business

### What code do I use for a residential delivery with signature?

- `013` Residential Delivery with Signature

### What code do I use for a residential driver release?

- `014` Residence Driver Release

### What code do I use for a business driver release?

- `021` Business Driver Release

### What code do I use for indirect delivery?

- `019` Indirect Delivery

### What code do I use if the package was refused?

- `006` Package Refused by Recipient

### What code do I use if I cannot locate the address?

- `003` Unable to Locate - Recipient Address

### What code do I use if the address is wrong?

- `002` Incorrect Recipient Address

### What code do I use if a non-residential recipient is not in?

- `004` Non-residential Recipient Not In

### What code do I use if a residential recipient is not in and I cannot indirect or driver release?

- `007` Residential Recipient Not In, unable to Indirect or Driver Release

### What code do I use if security prevented delivery?

- `001` Increased Security / Customer Security Delay

### What code do I use if inspection is required?

- `010` Inspection Required

### What code do I use if the package was sorted to the wrong route?

- `012` Package Sorted to Wrong Route

### What code do I use if the package was on the manifest but not on my van?

- `016` Package on Manifest, Not on Van

### What code do I use if I made no attempt?

- `027` Package Not Delivered - No Attempt

### What code do I use for local weather delay?

- `082` Local Weather Delay

### What code do I use for a local holiday restriction?

- `083` Delivery Restricted / Local Holiday

### What code do I use if the customer asked for no attempt?

- `100` Customer Request - No Attempt Made

### What code do I use if I am holding the package?

- `015` Holding Package

### What code do I use for a misdelivered package pickup?

- `017` Misdelivered Package Picked Up

### What code do I use when a misdelivered package is delivered to the correct recipient?

- `018` Misdelivered Package Delivered to Correct Recipient

### What code do I use if a package is tendered to USPS?

- `025` Tendered to U.S. Postal Service

### What code do I use for return to shipper delivered back to shipper?

- `026` RTS Package - Delivered to Shipper

### What code do I use for another carrier handoff?

- `028` Tendered to Connecting Line Carrier

### What code do I use for an enroute transfer?

- `079` Enroute Package Transfer

### What code do I use if the contractor refuses a package?

- `081` Contractor Refused Package

### What code do I use if a package cannot be held at location?

- `250` Unable to Hold at Location

### Decision path: customer not in code

- If the driver asks:
- `What code if nobody is there?`

- Bot should answer:
- `Residential or commercial?`
- `Residential`
- `Commercial`

- If `Residential`
- Use `007` if unable to indirect or driver release.

- If `Commercial`
- Use `004`.

### Decision path: address problem code

- If the driver asks:
- `Address problem`
- `Can't find it`
- `Label is wrong`

- Bot should answer:
- `Which one fits better?`
- `The label address is wrong`
- `The address may be right but I still can't find it`

- If `The label address is wrong`
- Use `002`.

- If `The address may be right but I still can't find it`
- Use `003`.

---

## Pickup questions

### Decision path: pickup issue

- If the driver asks:
- `Pickup problem`
- `What do I do at this pickup?`

- Bot should answer:
- `What kind of pickup issue is it?`
- `Not ready`
- `Closed / no packages`
- `Residential customer not home`
- `Weather`
- `Wrong address`
- `Hazmat issue`
- `Cancelled / no attempt`

### What are the main pickup types I should know?

- `FDO` Future Day On-Call
- `SDO` Same Day On-Call
- `PRP` Package Return Program
- `CTG` Call Tag
- `SCH` Regular Scheduled
- `AUT` Automated Pickup
- `NAP` Network Access Point

### What if a pickup package is not ready?

- Use pickup exception code `10` Pickup Not Ready - Dispatch Again.

### What if the pickup location is closed and there are no packages?

- Use pickup exception code `11` Closed - Attempted, No Packages.

### What if the residential pickup customer is not home?

- Use pickup exception code `15` Residential Pickup, Not Home.

### What if weather prevents the pickup?

- Use pickup exception code `14` Weather.

### What if a pickup was cancelled and no attempt should be made?

- Use pickup exception code `24` Pickup Cancelled - No Attempt Made.

### What if the pickup address is wrong?

- Use pickup exception code `25` Wrong Address - Pickup Not Made.

### What if a Hazmat pickup cannot be made?

- Use pickup exception code `17` Hazmat - Pickup Not Made.

### Decision path: pickup not on list

- If the driver asks:
- `This pickup isn't on my list`

- Bot should answer:
- `Do you already have a pickup list today?`
- `Yes`
- `No`

- If `Yes`
- Treat it as an unlisted pickup situation if appropriate.

- If `No`
- Download the pickup list if the option is available and you have cellular service.

### What if I do not have a pickup list in FORGE?

- Use `Download Pickup List` from the stop list menu if it is available.
- Cellular connectivity is required.
- The option appears only if no pickup list was received during login.
- Unlisted pickups completed before download can still be reconciled at EOD.

### What if the customer says their business will be closed on certain dates?

- Send a `Business Closure` message in FORGE.
- Enter the address.
- Select closure type:
- `Recurring Day`
- `Single Date`
- `Date Range`
- Mark whether it affects delivery, pickup, or both.
- Send the message to CPC.

### Bot-ready answer: The customer says they are closed. What do I do?

- Send a `Business Closure` message in FORGE.
- Choose the closure type:
- `Recurring day`
- `Single date`
- `Date range`

#### If `Recurring day`

- Start a new FORGE message.
- Select `Business Closure`.
- Enter the address.
- Choose `Recurring Day`.
- Enter the weekday.
- Mark delivery, pickup, or both.
- Send to CPC.

#### If `Single date`

- Start a new FORGE message.
- Select `Business Closure`.
- Enter the address.
- Choose `Single Date`.
- Enter the date.
- Mark delivery, pickup, or both.
- Send to CPC.

#### If `Date range`

- Start a new FORGE message.
- Select `Business Closure`.
- Enter the address.
- Choose `Date Range`.
- Enter start and end dates.
- Mark delivery, pickup, or both.
- Send to CPC.

### What can CPC help with?

- Pickup contact or phone verification.
- Address corrections.
- Incorrect work area assignments.
- Pickup change requests.
- Pickup windows.
- Traffic, weather, or accident related service impacts.
- Follow-up on zero-volume shippers.
- Sales leads and shipper-at-risk reporting.

### Decision path: business closed

- If the driver asks:
- `Business is closed`

- Bot should answer:
- `Is this about right now or future closed dates?`
- `Closed right now`
- `Future closed dates`

- If `Closed right now`
- Use the current delivery or pickup exception path.

- If `Future closed dates`
- Use the `Business Closure` message workflow.

---

## Call tag questions

### What is a call tag?

- A call tag is used to pick up a previously delivered package and return it to the shipper.

### Bot-ready answer: What do I do with this call tag?

- First choose what you are trying to do:
- `Pick it up`
- `Deliver it`
- `Apply one action to all call tags`
- `Handle each call tag separately`

#### If `Pick it up`

- Scan the call tag.
- Choose `Pickup`.
- Confirm or edit stop details if needed.
- Select the call tag action.
- Close the stop.

#### If `Deliver it`

- Scan the call tag.
- Choose `Delivery`.
- Confirm or edit stop details if needed.
- Select the action.
- Close the stop.

#### If `Apply one action to all call tags`

- Use the all-call-tags action.
- Select one status code and reason code if needed.
- Apply it to all call tags in the stop.

#### If `Handle each call tag separately`

- Work one call tag at a time.
- Apply the action, status code, and reason code as needed.

### How do I process a call tag in FORGE?

- Scan the call tag.
- Choose whether it is being handled as a `Delivery` or `Pickup` at that stop.
- Edit stop details if needed.
- Select the call tag action.
- Close the stop through the normal stop close workflow.

### What call tag action options exist in FORGE?

- `All Call Tags picked up`
- Applies code `29` to all packages in the stop.

- `All Call Tags delivered`
- Marks all call tags in the stop as delivered.

- `All Call Tags receive status code`
- Apply one status code to all call tags in the stop.

- `Handle Call Tags individually`
- Apply actions one package at a time.

- `All Call Tags cancelled: Suspected Fraud`
- Applies code `106`.

---

## FORGE login and app questions

### Decision path: FORGE problem

- If the driver asks:
- `FORGE isn't working`
- `Scanner problem`
- `Login issue`

- Bot should answer:
- `What kind of FORGE issue is it?`
- `Can't log in`
- `Need Delayed Login`
- `Won't sync`
- `Barcode won't scan`
- `Package not on manifest`
- `Need pickup list`

### What user type should a normal P&D driver use in FORGE?

- `Driver`
- Other user types exist, but standard route drivers should log in as the correct assigned user type.

### Why does selecting the right user type matter?

- It affects accurate reporting.
- It affects settlement.
- It affects permissions and workflow.

### What vehicle information does FORGE validate at login?

- Vehicle type.
- Vehicle barcode or rental details.
- Odometer.
- Compliance items such as registration, insurance, inspection, and in some cases `CARB`.

### What happens if FORGE cannot authenticate and I need to start working?

- Use `Delayed Login` if the option is available.
- It is meant for outages or login system failures.
- You still enter required login details for your user type.
- In delayed login, you can work with limited functionality until authentication succeeds later.

### What is limited in Delayed Login mode?

- No manifest download.
- Stops are worked as unmanifested or unlisted.
- Stop data does not transmit yet.
- No navigation or map view.
- No notifications.
- No sending or receiving messages.
- No sync status.
- No bulk transfer.
- No refresh manifest.
- No download pickup list.

### How do I exit Delayed Login mode?

- Go to `Login` from the stop list menu.
- Authenticate using the `same user ID` that was used to enter delayed login.
- Once login succeeds, FORGE syncs delayed login stop data and restores normal features.

### Do I have to authenticate at some point to finish EOD after Delayed Login?

- Yes.
- You must authenticate at least once to complete EOD and full logout.

### How do I change vehicles during the day in FORGE?

- Use the `Change Vehicle` option.
- Enter the ending odometer for the previous vehicle.
- Enter or scan the new vehicle information.
- Validate the new vehicle.
- Complete a `DVIR` for every vehicle used that day.
- The latest vehicle can be handled in FORGE EOD.
- Prior vehicles require manual DVIR if not handled in app.

### What does Sync Status do?

- Shows uploaded vs. closed stop counts.
- Lets you retry failed transmissions.
- Lets you re-upload completed transmissions when needed.

### How do I turn on camera scanning in FORGE?

- Open `Settings`.
- Turn on `Use Camera to Scan`.
- This disables the hardware barcode scanner.
- Use the camera icon on scan-enabled screens.

### What can I configure in FORGE settings?

- Night mode.
- Text-to-speech preferences.
- Navigation provider.
- Automatic navigation to next stop.
- Whether map view shows pickups and closed stops.
- Whether stop list shows closed stops and completed stop progress.
- Camera scanning.

### What changed in the newest FORGE support guide that drivers should know?

- FORGE `3.3.0` added newer guidance for:
- Preventing driver release deliveries in certain cases.
- Early pickup alerts.
- Time commit banner changes.
- Optional package weight entry on pickups.
- Pickup receipt printing.
- FedEx Authenticated Delivery enhancements.
- Live map and manifest preview map support.

### Decision path: intercepted or stop-shipment package

- If the driver asks:
- `Stop shipment`
- `Intercept`
- `Package got cancelled`

- Bot should answer:
- `Did FORGE say the package was intercepted and should be returned to the station?`
- `Yes`
- `No`
- `Not sure`

- If `Yes`
- Do not deliver the package.
- Return it to the station for processing.
- Treat it as an intercepted-package workflow.

- If `Not sure`
- Ask whether the screen or message specifically said intercepted or stop shipment.

### Decision path: ID prompt not sure

- If the driver asks:
- `This one needs ID`
- `Scanner wants ID`

- Bot should answer:
- `What kind of ID prompt is it?`
- `ASR`
- `Alcohol`
- `High-risk or other FORGE ID prompt`
- `Not sure`

- If `ASR`
- Follow adult-signature rules.

- If `Alcohol`
- Follow alcohol delivery rules.

- If `High-risk or other FORGE ID prompt`
- Treat the ID prompt as controlling and do not bypass it.

### Decision path: login problem

- If the driver asks:
- `I can't log in`

- Bot should answer:
- `Do you need to keep working during an outage, or is this a regular login issue?`
- `Need to keep working during outage`
- `Regular login issue`

- If `Need to keep working during outage`
- Move to the `Delayed Login` workflow.

- If `Regular login issue`
- Retry standard authentication and station login checks.

### Decision path: package not on manifest

- If the driver asks:
- `This package isn't on my manifest`

- Bot should answer:
- `Is this a delivery package or a pickup situation?`
- `Delivery package`
- `Pickup situation`

- If `Delivery package`
- Determine whether it belongs to your route, another route, or a local station exception process.

- If `Pickup situation`
- Determine whether it is listed or unlisted and work the pickup path.

---

## Safety and accident questions

### What should I do immediately after an accident?

- Call `9-1-1` if needed.
- If on the roadway or shoulder, activate flashers.
- Set reflective triangles or warning devices unless an FMCSR exemption applies.
- Notify local police.
- Contact your authorized officer or business contact as soon as possible.
- Notify FedEx staff as soon as possible.
- Record license plates of all vehicles at the scene.
- Protect the vehicle and cargo.
- Stay at the scene until released, if required.
- Complete the accident packet and any state or local reporting.

### Bot-ready answer: I was in an accident. What do I do?

- First choose one:
- `Yes, injuries or immediate hazard`
- `No injuries, no immediate hazard`

#### If `Yes, injuries or immediate hazard`

- Call `9-1-1`.
- Activate flashers.
- Set warning devices if safe and required.
- Notify local police.
- Contact your AO/BC and FedEx staff as soon as possible.
- Protect the vehicle and cargo.
- Stay at the scene until released.
- Complete the accident paperwork.

#### If `No injuries, no immediate hazard`

- Activate flashers if on roadway or shoulder.
- Set warning devices if required.
- Notify local police.
- Contact your AO/BC and FedEx staff as soon as possible.
- Record vehicle, witness, and scene details.
- Protect the vehicle and cargo.
- Complete the accident paperwork.

### Decision path: dog at the stop

- If the driver asks:
- `Dog at the stop`
- `Dog outside`

- Bot should answer:
- `What is the dog doing?`
- `Just present`
- `Approaching`
- `Aggressive`
- `Bit me`

- If `Just present`
- Stay alert and do not assume it is safe.

- If `Approaching`
- Stay calm, avoid direct eye contact, and back away if needed.

- If `Aggressive`
- Do not force the delivery.
- Use the package or another object as a barrier if needed.
- If unsafe, contact the customer for another delivery arrangement.

- If `Bit me`
- Clean the wound, get owner and rabies info if possible, seek medical care, and report it.

### What forms are part of the accident packet?

- `OP-130` Accident Packet Instructions
- `OP-132` Passenger in Other Vehicle or Witness form
- `OP-135` Accident Report

### What information should I capture after an accident?

- Date and time.
- Exact location.
- Unit number and vehicle type.
- Other vehicle owner, driver, and passenger details.
- Witness names and contacts.
- Police officer, agency, badge number, and any citation.
- Road, weather, lane, and visibility conditions.
- Property damage details.
- A written description or diagram of the accident.

### What should I do at a railroad crossing?

- Never ignore flashing lights or gates.
- Slow down and check both directions.
- Test brakes.
- If your view is blocked, stop and listen.
- Stop where required between `15` and `50` feet from the tracks.
- Never try to beat a train.
- Do not shift gears on the tracks.
- Do not enter unless you can fully clear the crossing.

### What should I do if a road is covered with water?

- Do not drive through if depth is unknown.
- Do not drive through if the roadbed may be damaged.
- Do not drive through flowing water.
- Do not go around barricades.
- Take another route if safety is uncertain.

### What should I carry for winter delay or getting stuck?

- Water.
- Food and snacks.
- Warm layered clothes.
- Extra gloves and hat.
- Hand warmers.
- Folding shovel.
- Emergency blanket.
- Traction aid such as kitty litter, sand, or gravel.

### How should I handle a dog encounter?

- Avoid unfamiliar dogs when possible.
- Do not assume a friendly-looking dog is safe.
- Stay calm.
- Avoid direct eye contact.
- Do not run.
- Use a firm voice like `no` or `go home`.
- Turn one side of your body toward the dog.
- Slowly back away if needed.
- If knocked down, curl into a ball and protect your head and neck.
- Put an object, including a package if needed, between you and the dog.

### What should I do if I am bitten by a dog?

- Request proof of rabies vaccination if possible.
- Record owner and veterinarian contact information.
- Wash hands and clean the wound with soap and water as soon as possible.
- See a doctor right away, or go to the ER after hours.
- Report the bite to local animal control.

---

## Security questions

### Decision path: security issue

- If the driver asks:
- `Security issue`
- `Something feels unsafe`

- Bot should answer:
- `What kind of security issue is it?`
- `Vehicle stolen`
- `Threat or violence`
- `Theft / burglary`
- `General unsafe situation`

### What basic security habits are required on route?

- Keep doors locked.
- Keep windows closed when appropriate.
- Remove keys from the vehicle or secure them in a key lock box when not operating it.
- Avoid leaving personal items visible.
- Protect packages from theft, loss, and damage.

### What should I do if my vehicle loaded with packages is stolen?

- Notify local law enforcement immediately.
- Then call the `FedEx Global Security Operations Center (GSOC)` at `1-800-872-8025`.
- Then notify station or linehaul management and the security specialist.

### Are drivers required to display an ID badge?

- Yes.
- It must be displayed while on FedEx property or providing services for FedEx.

### What if I forgot my permanent ID badge?

- Use a temporary paper badge for the day if issued.
- Display it until the permanent badge is recovered or replaced.

### What if my badge is lost?

- Get a replacement issued.
- The old badge is deactivated after reissue.
- If the old one is found later, turn it in.

### Can I bring firearms or weapons onto FedEx property?

- No, except authorized on-duty law enforcement with proper ID.
- The prohibition applies even if someone has a permit or license.

### Can I take photos or record audio/video on FedEx property?

- Not unless authorized.
- Unauthorized photos, video, and audio recording are prohibited.

### What should I do in an active threat situation?

- `Get out` if possible.
- `Hide out` if you cannot escape.
- `Take action` only if your life is in imminent danger.
- Call `9-1-1` when safe.

---

## Hazmat and restricted shipment questions

### Decision path: hazmat issue

- If the driver asks:
- `Hazmat question`
- `Can I take this?`
- `Hazmat paperwork issue`

- Bot should answer:
- `What kind of hazmat issue is it?`
- `Pickup acceptance`
- `Paperwork`
- `Loading / transport`
- `Leaking or damaged`
- `Alaska / Hawaii restriction`

### What should I do if I scan a dangerous goods package during pickup in the service provider network?

- Do not pick it up.
- FORGE guidance says dangerous goods packages are not accepted into the FedEx Ground service provider network at pickup.
- Contact `CPC` for guidance.

### What handling codes trigger the dangerous goods pickup block in newer FORGE guidance?

- `04` Inaccessible Dangerous Goods
- `14` Accessible Dangerous Goods
- `72` Limited Quantity Dangerous Goods
- `73` Fully Regulated Dangerous Goods
- `06` Dry Ice

### What should I verify for a Hazmat package that is accepted for movement?

- Proper DOT shipping name and identification number.
- Required hazard diamond labels.
- Hazmat label such as `OP-900` where required.
- Hazardous Material Certification printout when required.

### What if a hazardous material package is improperly prepared?

- Do not transport it.
- Picking it up anyway is not allowed.

### What must the Hazmat certification paperwork include?

- Number and type of packages.
- DOT basic description.
- Hazard class or division.
- ID number.
- Packing group.
- Weight and unit of measure.
- Shipper signature and date.

### Where should Hazmat paperwork be kept in the vehicle?

- In the Hazmat paperwork holder if equipped.
- If no holder exists, within the driver’s reach while seated at the controls.
- If the vehicle is unattended, place paperwork on the driver’s seat as directed by the guide.

### How should Hazmat packages be loaded?

- Place them on the back floor of the van.
- Keep orientation arrows up.
- Brace them so they cannot move.
- Do not allow them to slide around.

### Are there weight limits mentioned in the guide?

- Yes.
- Hazmat with `OP-900` shipping paper is limited to `999 lbs` total on the vehicle.
- `NA3178` smokeless powder is limited to `100 lbs`.
- `NA0027` black powder is limited to `100 lbs`.

### What should I do with Hazmat paperwork at the station?

- Turn it in to station personnel at return/check-in.

### What should I do if a Hazmat package is damaged or leaking?

- Do not handle it if unsafe.
- Pull over when safe.
- Contact a FedEx station representative immediately for instructions.

### Can I accept hazardous materials going to, from, or within Alaska or Hawaii?

- No, according to the guide.
- That includes hazardous materials and limited quantity marked packages noted in the reference.

### Can a call tag package contain hazardous materials?

- No.
- Hazmat call tag returns cannot be accepted because shipper certification cannot be verified that way.

### Are tobacco and e-cigarette packages allowed to individual consumers?

- No.
- They cannot be delivered to an individual consumer.
- Only certain pre-authorized commercial shipments to commercial locations may be allowed.

### Decision path: can I take this hazmat package?

- If the driver asks:
- `Can I take this hazmat package?`

- Bot should answer:
- `Is this a pickup or is it already in authorized transport?`
- `Pickup`
- `Already in transport`

- If `Pickup`
- Check whether FORGE blocks it as dangerous goods pickup.
- If blocked, do not pick it up and contact CPC.
- If not blocked, verify the required hazmat labels and paperwork before moving it.

- If `Already in transport`
- Verify paperwork, secure loading, and handling requirements.

---

## Vehicle, equipment, and appearance questions

### What happens if my vehicle does not meet equipment terms?

- It will not be tendered packages for dispatch.

### What security equipment must commercial vehicles have?

- Working manufacturer’s locks or self-locking or auto-locking exterior door locks.
- Cargo not visible to the public.
- A proper bulkhead.
- A lockable bulkhead door.
- A compliant anti-theft device.

### What safety equipment must be in the vehicle?

- Three-point seat belts for all installed seats.
- Mounted fire extinguisher rated at least `5 BC` or `ABC`.
- Three reflective triangles.
- Required safety technology meeting current standards.
- Required Hazmat reference items where applicable.

### What branding and identification must appear on vehicles?

- Unit number.
- ISP business name display.
- Required DOT decals where applicable.
- `Operated by Federal Express Corporation` decal where applicable for vehicles `10,001 lbs+`.

### What are the basic vehicle appearance standards?

- No extraneous markings.
- No visible body damage from `10 feet` away.
- Logos and markings in good condition.
- Clean appearance consistent with customer expectations.

### If one side’s FedEx decals are damaged, do all sides need replacement?

- Replace only the damaged side if the others are in good condition and match current standards.
- Replace all sides if the remaining decals do not meet current schematic standards.

### Are older purple/green or “Ground” logos automatically prohibited?

- No, not if they are in good condition.
- But logos should match across the whole vehicle.

### Who pays for decal replacement after an accident?

- FedEx supplies replacement logo decals.
- The service provider pays reapplication cost for accident-related damage.

### Who pays to remove damaged decals?

- The service provider.

### What business name should be shown on the vehicle?

- The current service provider business name from the Service Provider Profile.
- `Inc.` and `Corp.` abbreviations are allowed.

---

## SRI and service provider safety questions

### What is the Safety Results Indicator (SRI)?

- A rolling `12-month` measure of a service provider’s safety history.
- It is used to identify whether safety results are being met.

### How often does SRI update?

- Once per month.

### What counts toward SRI?

- Preventable accidents.
- DOT-recordable accidents.
- Pull-offs.
- Disconnects.
- General liabilities.
- VEDR key indicator failures.
- Roadside inspections.
- Improper assemblies.

### Can clean months reduce SRI?

- Yes.
- After `3` consecutive clean months: `-5` credit.
- After `4` consecutive clean months: additional `-10`.
- After `5` consecutive clean months: additional `-15`.
- Maximum clean month credit in a rolling `12-month` period is `-30`.

### Does a clean roadside inspection reduce every kind of SRI point?

- No.
- The clean inspection credit applies to roadside inspection results only.

### Are accidents under investigation included in SRI?

- No.

### What is a DOT-recordable accident?

- A crash involving a CMV on a public road in interstate commerce that results in:
- A fatality, or
- Injury needing immediate treatment away from the scene, or
- Disabling damage requiring towing.

---

## Messaging, FCC, and CPC questions

### Can I send messages in FORGE?

- Yes.
- Open `Inbox`.
- Start `New Message`.
- Add a stop reference if needed.
- Choose a quick message type if helpful.
- Write the message and send it.

### Will FORGE let me read or write messages while driving?

- No.
- The reference says FORGE blocks reading or creating messages while driving for safety reasons.

### What special quick message types should drivers know?

- Business Closure.
- Shipper at Risk.
- Sales Lead.
- Quick Messages.

### Disputed delivery communication note

- If a customer says a package shows delivered but they do not have it:
- Treat it as a disputed-delivery or package-research issue.
- Do not guess.
- Use the PRC or station follow-up path if applicable.

---

## Open implementation notes for the bot

- Prefer answers from the `2026 FORGE combined guide` for app behavior.
- Prefer answers from `OP-117` and `MGB-119` for delivery, signature, status code, security, and pickup standards.
- Use the scenario spreadsheet as a fallback, not as the first authority.
- When a question can branch, do not stop at a generic answer.
- Ask one short follow-up with options.
- After the driver selects an option, give the exact path for that option.
- If a question is about local station process, answer with:
- “Follow your station’s local process if it is more specific.”
- If a question is about legal, contractual, or manager override issues, answer with:
- “Your ISP agreement, local management instruction, and applicable law control if they conflict.”
