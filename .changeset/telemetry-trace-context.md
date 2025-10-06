---
'@codeforbreakfast/eventsourcing-protocol': patch
---

Protocol messages now include W3C Trace Context fields (traceId, parentId) for distributed tracing support. When running within an Effect span context, the protocol automatically propagates trace IDs through commands, subscriptions, events, and results. When no span context is available, random trace IDs are generated to maintain backward compatibility.
