---
'@codeforbreakfast/eventsourcing-store-postgres': patch
---

Refactor to use `EventStreamPosition` type throughout the codebase instead of separate `streamId` and `eventNumber` parameters. This change improves type safety and API consistency by consolidating stream position information into a single, well-defined type.

**Breaking changes:**

- `EventStreamTracker.processEvent` now accepts `position: EventStreamPosition` instead of separate `streamId` and `eventNumber` parameters
- `SubscriptionManagerService.publishToAllEvents` now accepts `position: EventStreamPosition` instead of separate `streamId` and `eventNumber` parameters
- Internal subscription types now use `{ position: EventStreamPosition; event: string }` instead of `{ streamId: EventStreamId; eventNumber: number; event: string }`

**Migration guide:**
Replace separate streamId/eventNumber parameters with EventStreamPosition:

```typescript
// Before
tracker.processEvent(streamId, eventNumber, event);
subscriptionManager.publishToAllEvents(streamId, eventNumber, event);

// After
tracker.processEvent({ streamId, eventNumber }, event);
subscriptionManager.publishToAllEvents({ streamId, eventNumber }, event);
```
