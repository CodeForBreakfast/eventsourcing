---
'@codeforbreakfast/eventsourcing-aggregates': major
'@codeforbreakfast/eventsourcing-transport-websocket': minor
---

Automatic metadata enrichment for event sourcing. Commands now emit bare business events, and the framework automatically enriches them with metadata (occurredAt, origin) before persisting. This keeps domain logic pure and separates business concerns from infrastructure.

**Breaking Changes:**

- Commands return bare events (`TEvent[]`) without metadata
- Framework enriches events to `EventRecord<TEvent, TOrigin>` during commit
- Metadata field renamed: `originator` → `origin`
- `applyEvent` receives bare `TEvent` (metadata stripped during load)
- EventStore type now explicit: `EventStore<EventRecord<TEvent, TOrigin>>`

**New Exports:**

- `EventRecord<TEvent, TOrigin>` - Enriched events with metadata wrapper
- `EventMetadata<TOrigin>` - Event metadata structure (occurredAt, origin)

**WebSocket Transport:**

- Added optional `authenticateConnection` callback for secure connection authentication
- Authentication metadata flows to `ClientConnection.metadata`
