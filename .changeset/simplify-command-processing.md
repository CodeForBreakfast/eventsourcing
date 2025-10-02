---
'@codeforbreakfast/eventsourcing-aggregates': patch
---

Improved readability of command processing by reducing nested pipe calls. The command processing factory now uses Effect.all to run independent effects in parallel with descriptive names, making the code flow clearer while maintaining identical behavior.
