---
'@codeforbreakfast/buntest': patch
'@codeforbreakfast/eventsourcing-store': patch
'@codeforbreakfast/eventsourcing-store-postgres': patch
---

Configure logger to be silent during tests to reduce output noise

Reduces test output verbosity by configuring the Effect logger to be silent during test runs. This change:

- Adds a `silentLogger` export to `@codeforbreakfast/buntest` for consistent test logger configuration
- Replaces verbose logger configurations in test files with the shared silent logger
- Eliminates noisy INFO and ERROR logs during test execution while preserving actual test results
- Improves developer experience by making test output cleaner and more readable

Users will see significantly less log output when running tests, making it easier to focus on test results and failures.
