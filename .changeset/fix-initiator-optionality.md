---
'@codeforbreakfast/eventsourcing-aggregates': patch
---

Fix command initiator type handling. CommandContextService.getInitiator no longer wraps the initiator in Option - optionality is now controlled by the schema passed to CommandContext. Renamed CurrentUser to CommandContextError.
