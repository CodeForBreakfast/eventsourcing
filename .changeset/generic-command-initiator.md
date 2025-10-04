---
'@codeforbreakfast/eventsourcing-aggregates': minor
---

Make CommandContext and event metadata generic over initiator type. Command initiator is now supplied when creating aggregates and event schemas. The originator field optionality is configurable by the caller.
