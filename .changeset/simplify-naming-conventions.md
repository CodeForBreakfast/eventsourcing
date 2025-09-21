---
'@codeforbreakfast/eventsourcing-store': minor
---

Simplify and improve API naming conventions

### Breaking Changes

- Renamed `OptimizedStreamHandler` to `StreamHandler` - there was no non-optimized version, making the "Optimized" prefix misleading
- Renamed `EnhancedEventStore` interface to `SubscribableEventStore` - explicitly describes what it adds over the base EventStore
- Renamed factory functions to follow Effect-ts conventions:
  - `inMemoryEventStore` → `makeInMemoryEventStore`
  - `enhancedInMemoryEventStore` → `makeSubscribableInMemoryEventStore`

### Migration Guide

Update your imports and usage:

```typescript
// Before
import {
  OptimizedStreamHandler,
  OptimizedStreamHandlerLive,
  enhancedInMemoryEventStore,
} from '@codeforbreakfast/eventsourcing-store';

// After
import {
  StreamHandler,
  StreamHandlerLive,
  makeSubscribableInMemoryEventStore,
} from '@codeforbreakfast/eventsourcing-store';
```

These changes make the API more predictable and easier to understand by removing unnecessary marketing terms and following consistent naming patterns.
