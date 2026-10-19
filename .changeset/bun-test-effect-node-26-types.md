---
'@codeforbreakfast/bun-test-effect': patch
---

The assertion helpers now type-check against `@types/node` 26, whose `node:assert` typings no longer accept an optional string message. Their behaviour is unchanged: a message you pass still becomes the assertion error's message, and leaving it out still gives Node's default.
