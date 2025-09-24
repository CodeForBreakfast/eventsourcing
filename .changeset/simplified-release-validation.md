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

Simplified release validation using changesets' native tools. The CI now validates:

- Changeset status to ensure changes have appropriate version bumps
- Build success for all packages
- Publish readiness via changesets publish --dry-run

This provides focused, relevant validation without unnecessary checks, ensuring smooth releases while keeping CI fast and maintainable.
