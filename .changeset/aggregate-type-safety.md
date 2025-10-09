---
'@codeforbreakfast/eventsourcing-aggregates': patch
---

Improved type safety in aggregate state loading and event committing. The aggregate state's `data` field now correctly preserves its type (e.g., `Option<TodoState>`) instead of being typed as `Option<unknown>`, eliminating the need for type assertions when working with aggregate state. Additionally, `CommitOptions` is now generic over the event type, ensuring type safety throughout the commit pipeline.
