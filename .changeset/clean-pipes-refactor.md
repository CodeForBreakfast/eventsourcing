---
'@codeforbreakfast/eventsourcing-protocol': patch
'@codeforbreakfast/eventsourcing-testing-contracts': patch
---

Simplify arrow functions in pipe operations

Removed unnecessary arrow functions that were just forwarding parameters to other functions, making the code cleaner and more readable. This includes simplifications like changing `(cmd) => sendCommand(cmd)` to just `sendCommand` and `(msg) => transport.publish(msg)` to `transport.publish`.
