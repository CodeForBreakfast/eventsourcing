---
'@codeforbreakfast/eventsourcing-protocol': patch
---

Renamed protocol message types to use `Protocol*` prefix for clearer layer separation. Protocol-level message types (`ProtocolCommand`, `ProtocolCommandResult`, `ProtocolEvent`, `ProtocolSubscribe`, `ProtocolIncoming`) are now clearly distinguished from the public Wire API (`WireCommand`) and transport layer (`TransportMessage`). This improves code clarity by making the internal protocol implementation details explicit.
