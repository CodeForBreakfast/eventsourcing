---
'@codeforbreakfast/eventsourcing-transport-websocket': patch
'@codeforbreakfast/eventsourcing-protocol': patch
---

Improved code quality by configuring ESLint to recognize Effect types as immutable-by-contract and removing unnecessary ESLint suppressions. This change has no runtime impact but improves code maintainability.

**WebSocket Transport**: Fixed mutation anti-patterns by replacing type-cast mutations with proper Effect immutable data structures (HashMap, HashSet, Ref). All 21 ESLint suppressions across websocket transport files have been removed.

**Protocol**: Removed 15 unnecessary ESLint suppressions that are no longer needed with the improved ESLint configuration.

**ESLint Configuration**: Configured functional programming rules to understand that Effect types (Ref, Queue, HashMap, HashSet, Stream, PubSub) are immutable-by-contract despite containing internal mutable state managed through controlled APIs.
