# Knip Technical Debt

## Context

When replacing depcheck with knip, we discovered several code quality issues that need addressing.

## Fixed Issues ✅

- Fixed 2 unresolved imports in test files (wrong import paths)
- Fixed duplicate export of StreamEndMovedError

## Remaining Issues to Address

### Unused Internal Exports (21)

These exports are not part of the public API and are not used internally:

**eventsourcing-store package:**

- InMemorySubscriptionManager, makeInMemorySubscriptionManager, InMemorySubscriptionManagerLive
- ConnectionManager (SQL), withConnectionHealth, EventStreamTracker
- makeChannelName, makeEventRowService
- Various Live layers: DatabaseInfrastructureLive, EventTrackingLive, SubscriptionManagementLive, NotificationInfrastructureLive
- SqlEventStore, SqlEventStoreLive, makeSqlEventStoreWithSubscriptionManager
- SubscriptionManagerServiceTag
- Streaming ConnectionManager and related exports

**Recommendation:**
These should be reviewed to determine if they:

1. Can be removed (dead code)
2. Should be exposed via public API
3. Are kept for future use (mark with @internal JSDoc)

## Running Full Analysis

To see all issues: `bun run knip`
To see only dependency issues: `bun run knip --dependencies`
