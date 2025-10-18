---
'@codeforbreakfast/eventsourcing-aggregates': minor
---

Add `defineAggregateEventStore` factory function for creating standardized event store tags.

This factory provides a consistent, type-safe way to create EventStore tags for aggregates with deterministic keys:

\`\`\`typescript
import { defineAggregateEventStore } from '@codeforbreakfast/eventsourcing-aggregates';

export const TodoEventStore = defineAggregateEventStore<TodoEvent, UserId>('Todo');
\`\`\`

The factory automatically generates the tag identifier as `{AggregateName}/EventStore`, reducing boilerplate and ensuring consistent naming across all aggregates.
