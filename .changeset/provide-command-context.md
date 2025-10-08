---
'@codeforbreakfast/eventsourcing-aggregates': major
'@codeforbreakfast/eventsourcing-transport-websocket': minor
---

Automatic metadata enrichment: Commands now emit bare business events. The framework automatically enriches events with metadata (occurredAt, origin) before persisting them. This separates business logic from infrastructure concerns.

**Breaking Changes:**

1. **Event definitions no longer include metadata field**
   - Events are now pure business data
   - Metadata is added automatically by the framework at commit time

2. **Commands return bare events, not enriched events**
   - Remove all `eventMetadata<TInitiator>()` calls from command functions
   - Commands return `Event[]`, framework stores `EventRecord<Event, TOrigin>[]`

3. **Metadata field renamed: `originator` → `origin`**
   - More flexible naming to support various origin types (userId, system, API context, etc.)

4. **EventStore type parameter changes**
   - Before: `EventStore<TodoEvent>` (metadata baked into event type)
   - After: `EventStore<EventRecord<TodoEvent, UserId>>` (framework adds metadata wrapper)

5. **applyEvent receives bare events without metadata**
   - Functions that rebuild state from events now receive bare `TEvent` (no metadata)
   - Focus on business data only - metadata is infrastructure concern
   - applyEvent signature: `(event: TEvent) => Effect<State, Error>`

**New Exports:**

- `EventRecord<TEvent, TOrigin>` - Type for framework-enriched events with metadata
- `EventMetadata<TOrigin>` - Type for event metadata structure

**WebSocket Transport:**

- Added optional `authenticateConnection` callback for secure connection authentication
- Authentication metadata flows to `ClientConnection.metadata`
