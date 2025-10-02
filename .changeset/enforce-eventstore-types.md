---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-aggregates': patch
---

EventStore, ProjectionStore, and SnapshotStore service tags now require explicit type parameters, preventing accidental use of `unknown` types. This improves type safety by ensuring you always specify the event, state, or snapshot types when creating service instances.
