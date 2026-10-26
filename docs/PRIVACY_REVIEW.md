# Publication privacy review

Reviewed on 2026-10-26 for the README refresh and new documentation screenshots.

## Screenshots

The new files under `docs/images/` were captured specifically for this fork:

- **Console home:** both address and console ID are masked.
- **Pairing:** uses a fictional example address, with empty PSN username,
  account-ID and pairing-code fields. No pairing was submitted for that example.
- **Stream settings:** contains quality preferences only.
- **Keyboard settings:** contains control bindings only.

The pictures were visually inspected. No real console ID, local/public IP,
PSN account ID, username, registration key, pairing code, game library, email,
or authentication page is shown. JPEG metadata was checked for EXIF data.
The banner is an original SVG illustration, not a screenshot of a game session.

One initial screenshot had an incorrect crop. It was replaced before staging
or publication; it was never included in a Git commit or uploaded to GitHub.

## Repository checks

The tracked source, pending additions and this fork's published commits were
checked locally against the owner's known console/network/account details.
The review also checks for accidentally tracked environment files, databases,
private keys, downloaded tools and personal screenshots.

Private `.env`, SQLite databases, `.tools` and build outputs are excluded from
Git. Ignore rules additionally cover environment variants, SQLite sidecars,
database files, private `.key` files and logs. `.env.example` contains blank
cloud/public URLs and configuration placeholders, not local account secrets.

GitHub's repository owner name and the author's GitHub **noreply** commit address
remain public attribution. No personal email address was used for these commits.
This review covers this fork's additions; it is not a forensic audit of every
historical asset or contributor in the upstream project's history.

## What masking means

The home screen hides console addresses and IDs by default; **Show details**
reveals both locally. SVG accessibility identifiers no longer include the
console address. Masking protects the visible page and ordinary screenshots;
it does not encrypt the app's saved registration data or remove information the
client needs to connect. Keep the browser profile and local database private.

Typing a PSN username in the pairing screen triggers an external lookup after
a pause. Use manual account-ID entry if you do not want that lookup. Registration
keys, pairing codes and database exports should never be added to a bug report.
