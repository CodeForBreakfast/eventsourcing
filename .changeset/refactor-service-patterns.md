---
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
'@codeforbreakfast/eventsourcing-transport': patch
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-commands': patch
'@codeforbreakfast/eventsourcing-aggregates': patch
'@codeforbreakfast/eventsourcing-websocket': patch
---

Modernized service definitions to use Effect-TS 2.3+ patterns. Services now use `Context.Tag` instead of `Effect.Tag` with inlined service shapes, providing better type inference and cleaner code. Generic services use the `Context.GenericTag` factory pattern for proper type parameter support.

For most users, these are internal improvements with no breaking changes. If you're directly referencing service types (like `CommandRegistryService`), use `Context.Tag.Service<typeof ServiceName>` to extract the service type instead.
