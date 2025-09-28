---
'@codeforbreakfast/eventsourcing-store-inmemory': minor
'@codeforbreakfast/eventsourcing-aggregates': patch
---

Export InMemoryStore as namespace following Effect patterns

**BREAKING CHANGE**: InMemoryStore is now exported as a namespace module instead of individual exports.

Before:

```typescript
import { make } from '@codeforbreakfast/eventsourcing-store-inmemory';
const store = await make();
```

After:

```typescript
import { InMemoryStore } from '@codeforbreakfast/eventsourcing-store-inmemory';
const store = await InMemoryStore.make();
```

This change aligns with Effect library conventions where modules like Queue, Ref, etc. are exported as namespaces containing their functions.
