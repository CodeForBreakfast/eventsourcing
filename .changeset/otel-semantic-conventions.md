---
'@codeforbreakfast/eventsourcing-protocol': patch
---

Improved OpenTelemetry span naming and attributes to follow semantic conventions. Protocol spans now use standardized naming (`eventsourcing.Protocol/<method>`) and include proper RPC and messaging attributes for better observability and integration with OTEL tooling.
