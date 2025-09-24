---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-projections': patch
'@codeforbreakfast/eventsourcing-protocol-default': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
'@codeforbreakfast/eventsourcing-transport-contracts': patch
'@codeforbreakfast/eventsourcing-transport-inmemory': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-websocket': patch
---

Improved CI validation to prevent release failures. The changeset validation now:

- Detects when code changes are made without changesets (preventing npm republish failures)
- Checks if package versions already exist on npm
- Provides clear guidance on creating changesets with consumer-focused messages
- Distinguishes between code changes (requiring changesets) and documentation-only changes (optional)
