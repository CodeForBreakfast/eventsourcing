---
'@codeforbreakfast/eslint-effect': minor
---

Added `prefer-effect-platform` rule to encourage using @effect/platform APIs over native Node.js, Bun, and Deno platform APIs. The rule detects and warns against:

- File system operations: Suggests using `FileSystem` from @effect/platform instead of `node:fs`, `Bun.file()`, or `Deno.readFile()`
- HTTP operations: Suggests using `HttpClient` from @effect/platform instead of `fetch()` or `node:http/https`
- Path operations: Suggests using `Path` from @effect/platform instead of `node:path`
- Command execution: Suggests using `Command` from @effect/platform instead of `node:child_process`, `Bun.spawn()`, or `Deno.Command()`
- Terminal I/O: Suggests using `Terminal` from @effect/platform instead of `console` methods or `process.stdout/stderr`
- Process access: Suggests using platform Runtime instead of direct `process.env`, `process.cwd()`, etc.

This rule is now enabled by default in the recommended configuration to help teams build platform-independent Effect applications.
