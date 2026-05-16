# ReadyRoute Manifest Customer Contact QA

Acceptance rule: if a manifest includes customer contact data, ReadyRoute must preserve it from parser to database to API to UI. If the manifest does not include contact data, ReadyRoute must show a clean empty state and never invent customer information.

## Test Data

Create two CSAs with different routes and visibly different contact data.

CSA A:
- Name: `CSA A Contact Test`
- Stop: `A Contact Stop`
- Contact: `A Contact`
- Phone: `555-111-1010`
- Email: `a-contact@example.com`
- Company: `A Company`
- Instructions: `A instructions only`

CSA B:
- Name: `CSA B Contact Test`
- Stop: `B Contact Stop`
- Contact: `B Contact`
- Phone: `555-222-2020`
- Email: `b-contact@example.com`
- Company: `B Company`
- Instructions: `B instructions only`

## Manifest Fixtures

Import or simulate manifests that cover these variants:

1. Contact name only
- Include `Contact Name = Contact Only`.
- Expected: parser and API return `contact_name`; UI shows the name and no fake phone action.

2. Contact name plus phone
- Include `Contact Name` and `Phone`.
- Expected: `primary_phone` is preserved and driver/manager UI shows a call action.

3. Contact name plus phone and alternate phone
- Include `Phone` and `Alternate Phone`.
- Expected: both `primary_phone` and `alternate_phone` are preserved.

4. Business or company
- Include `Business Name` or `Company Name`.
- Expected: business/company displays as contact context, but is never used as identity.

5. Email
- Include `Email Address`.
- Expected: `email` is preserved and manager/driver detail can open or copy email.

6. Instructions
- Include `Customer Instructions` or `Delivery Instructions`.
- Expected: instructions are preserved and shown near stop detail contact info.

7. Blank contact fields
- Include contact headers with blank values.
- Expected: parser stores null/empty values, import succeeds, UI stays clean.

8. Unusual phone formatting
- Include values like `+1 (555) 444-5555 x12` or `(555) 111-2222 ext. 9`.
- Expected: display value is preserved; call links use a dialable `tel:` value when possible.

9. Two CSA boundary fixture
- Import CSA A and CSA B manifests with distinct contact data above.
- Expected: CSA A users never see CSA B contact data, and CSA B users never see CSA A contact data.

## Backend Regression Checks

1. Parser headers
- Run parser tests.
- Confirm known aliases map to normalized fields:
  `contact_name`, `business_name`, `company_name`, `primary_phone`, `alternate_phone`, `email`, `customer_instructions`, `delivery_instructions`, `consignee`, `shipper`.

2. Parser aliases
- Confirm `Recipient`, `Customer`, `Telephone`, `Alt Phone`, `Email Address`, `Notes`, `Sender`, and `Consignee` are handled.

3. Ingest
- Upload a manifest with contact fields.
- Confirm inserted `stops` rows include the normalized contact fields.
- Confirm blank values do not overwrite existing non-empty contact values during merge/import refresh.

4. API authorization
- Assigned driver route/stop endpoints return contact fields only for assigned stops.
- Unassigned driver cannot fetch another route's contact data.
- Authorized manager route/stop endpoints return contact fields only for the selected CSA.
- Manager for CSA A cannot fetch CSA B contact fields.

5. Logs
- Search dev/prod logs for full phone numbers, full emails, and customer notes after import and API access.
- Expected: no sensitive contact values are logged.

## Driver App Checklist

1. Stop with phone
- Open a stop with `primary_phone`.
- Confirm `CUSTOMER CONTACT` appears near the top.
- Confirm the Call action opens a `tel:` link.

2. Stop without phone
- Open a stop with only `contact_name`.
- Confirm the contact name appears.
- Confirm no fake Call action appears.
- Confirm the UI says `No phone on manifest.`

3. Business/company
- Open a stop with `business_name` or `company_name`.
- Confirm the business/company appears under the contact name.

4. Instructions
- Open a stop with customer/delivery instructions.
- Confirm the instructions display near the contact info.

5. Existing flows
- Confirm Navigate still opens maps.
- Confirm Complete still works.
- Confirm Save current location as correct pin still works.
- Confirm Flag this road as problematic still works.

## Manager Portal Checklist

1. Stop drawer
- Open a route.
- Select a stop with full manifest contact data.
- Confirm the selected stop row shows contact, business/company, phone, alternate phone, email, consignee, shipper, and instructions.
- Confirm `tel:` and `mailto:` links are present when those fields exist.

2. Route map popup
- Click a stop pin with contact data.
- Confirm the popup shows concise contact info and a phone link when available.
- Click `Open stop details`.
- Confirm the same stop is selected in the stop drawer and full contact info is visible.

3. Route list cleanliness
- Confirm stop rows show only a subtle `CONTACT` indicator.
- Confirm rows do not display every phone/email unless the stop is selected.

4. Manifest review
- Open the manifest review page after import.
- Confirm routes with contact data show a contact-info count.
- Confirm first-stop previews show detected contact snippets when available.

5. Fleet map
- Click a mapped stop with contact data.
- Confirm only concise contact info appears.
- Confirm fleet-level views remain uncluttered.

6. CSA switching
- Select CSA A and open a stop with A contact data.
- Switch to CSA B.
- Confirm A contact data disappears during/after CSA B load.
- Open B route/stop and confirm only B contact data appears.
- Refresh while on CSA B and confirm B data remains selected by CSA id.

## Security Fail Conditions

Fail the release if any of these occur:
- Contact data from CSA A appears under CSA B.
- Contact data appears for a driver who is not assigned to that route/stop.
- Full phone numbers, emails, or customer notes are written to production logs.
- A blank manifest contact field overwrites a useful existing value.
- UI invents placeholders like `unknown`, fake phones, or fake emails.
- Customer contact data is used as an identity key.

