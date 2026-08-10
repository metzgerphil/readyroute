# Source review: SRC-GDRIVE-FILE-0007

## Review result

- Status: `FULLY_REVIEWED`
- Method: page-marked text extraction plus visual review of all five pages
- Document label: FORGE 2.5.0; filename revision 6/10/25
- Scope: entering, operating in, exiting, and ending the day from Delayed Login

## Decision and sequence map

- Delayed Login is offered after repeated network/authentication failures, currently described as three failures in 30 minutes, or through Settings during a PurpleID outage.
- Ground entry requires station number, station WAN password, FedEx badge scan, user/station authorization, vehicle validation, and on-duty time.
- While delayed, all stops are unmanifested/unlisted; stop data does not transmit; maps/navigation, messages, notifications, sync, manifest refresh, pickup-list download, transfers, and other named functions are unavailable.
- Exit requires authentication with the same user ID used to enter. Successful authentication downloads the manifest, transmits delayed stop data, merges completed and received stops, and restores functions.
- End of day cannot complete without at least one successful authentication. The complete-logout action remains disabled until required EOD steps are complete.

## Safety and answer constraints

- The source enables continued work during an outage; it does not authorize guessing package details that would normally come from the manifest.
- Never advise a different badge/user to exit delayed mode.
- The 30-minute trigger is explicitly described as a current implementation detail and is version-sensitive.

