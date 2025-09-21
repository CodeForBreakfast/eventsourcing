---
'@codeforbreakfast/eventsourcing-store': patch
---

Export InMemoryStore class and make function for testing support

The `InMemoryStore` class and `make` function (exported as `makeInMemoryStore`) are now available from the main package exports. This allows users to create in-memory event stores for testing scenarios without needing to access internal module paths.

## New exports

- `InMemoryStore` - The class for managing in-memory event storage
- `makeInMemoryStore` - Factory function to create a new InMemoryStore instance

## Example usage

```typescript
import { Effect } from 'effect';
import {
  InMemoryStore,
  makeInMemoryStore,
  makeInMemoryEventStore,
} from '@codeforbreakfast/eventsourcing-store';

// Create an in-memory store for testing
const store = await Effect.runPromise(makeInMemoryStore<MyEventType>());
const eventStore = await Effect.runPromise(makeInMemoryEventStore(store));
```
