---
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-websocket': patch
---

Protocol operations now automatically create Effect spans for distributed tracing. All commands, subscriptions, events, and results include W3C Trace Context fields (traceId, parentId). The protocol creates spans named 'protocol.send-command', 'protocol.subscribe', 'server-protocol.send-result', and 'server-protocol.publish-event' with relevant attributes, enabling end-to-end tracing across the event sourcing system.
