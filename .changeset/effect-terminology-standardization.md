---
'@codeforbreakfast/eventsourcing-aggregates': minor
'@codeforbreakfast/eventsourcing-projections': minor
'@codeforbreakfast/eventsourcing-store': minor
'@codeforbreakfast/eventsourcing-store-postgres': minor
'@codeforbreakfast/eventsourcing-testing-contracts': minor
'@codeforbreakfast/eventsourcing-transport-inmemory': minor
'@codeforbreakfast/eventsourcing-transport-websocket': minor
'@codeforbreakfast/eventsourcing-websocket': minor
---

**BREAKING**: Standardize API naming to follow Effect conventions

This release eliminates duplicate APIs and ensures consistent Effect terminology throughout the codebase:

### Breaking Changes

**Factory Functions** (follow Effect `make*` convention):

- `createAggregateRoot` → `makeAggregateRoot`
- `createProjectionEventStore` → `makeProjectionEventStore`
- `createWebSocketProtocolStack` → `makeWebSocketProtocolLayer`
- All test utilities now use `make*` prefix (`createTestMessage` → `makeTestMessage`, etc.)

**Test Interface Methods**:

- `createTransportPair` → `makeTransportPair`
- `createServer` → `makeServer`
- `createClient` → `makeClient`
- `createMockClient` → `makeMockClient`
- And all other test factory methods

**Removed Redundant Exports**:

- Eliminated `EventStore as EventStoreServiceInterface` type alias
- Removed internal aliases (`DatabaseInfrastructureLive`, `SubscriptionManagementLive`)
- Removed unused `createWebSocketConnectorLayer` wrapper function

### Migration Guide

**For Application Code**:

```typescript
// Before
import { createAggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';
const MyAggregate = createAggregateRoot(/* ... */);

// After
import { makeAggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';
const MyAggregate = makeAggregateRoot(/* ... */);
```

**For WebSocket Usage**:

```typescript
// Before
import { createWebSocketProtocolStack } from '@codeforbreakfast/eventsourcing-websocket';
const layer = createWebSocketProtocolStack(url);

// After
import { makeWebSocketProtocolLayer } from '@codeforbreakfast/eventsourcing-websocket';
const layer = makeWebSocketProtocolLayer(url);
```

**For Test Code**:

```typescript
// Before
import {
  createTestMessage,
  createMockTransport,
} from '@codeforbreakfast/eventsourcing-testing-contracts';

// After
import {
  makeTestMessage,
  makeMockTransport,
} from '@codeforbreakfast/eventsourcing-testing-contracts';
```

This cleanup eliminates API confusion and ensures developers have single, canonical names for each piece of functionality following proper Effect patterns.
