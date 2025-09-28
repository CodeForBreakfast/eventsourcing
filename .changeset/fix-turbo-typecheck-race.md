---
'@codeforbreakfast/eventsourcing': patch
---

Fixed flaky build issue where typecheck would randomly fail for packages using TypeScript project references. The turbo configuration now ensures dependencies are built before running typecheck, eliminating race conditions in the build pipeline.
