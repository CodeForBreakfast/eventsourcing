---
'@codeforbreakfast/eslint-effect': minor
---

Added comprehensive suite of Effect simplification rules to help developers write cleaner, more idiomatic Effect code.

**New rules for common Effect patterns:**

- `prefer-as` - Suggests using `Effect.as` instead of `Effect.map(() => value)` for simpler value replacement
- `prefer-as-some` - Suggests `Effect.asSome` instead of `Effect.map(Option.some)`
- `prefer-as-some-error` - Suggests `Effect.asSomeError` instead of `Effect.mapError(Option.some)`
- `prefer-as-void` - Suggests `Effect.asVoid` instead of `Effect.map(() => undefined)` or similar patterns
- `prefer-succeed-none` - Suggests `Effect.succeedNone` instead of `Effect.succeed(Option.none())`
- `prefer-ignore` - Suggests `Effect.ignore` instead of manually ignoring errors with `Effect.catchAll(() => Effect.void)`
- `prefer-ignore-logged` - Suggests `Effect.ignoreLogged` instead of logging errors then ignoring them
- `prefer-flatten` - Suggests `Effect.flatten` instead of `Effect.flatMap(identity)`
- `prefer-zip-left` - Suggests `Effect.zipLeft` instead of sequencing with first value using `Effect.flatMap`
- `prefer-zip-right` - Suggests `Effect.zipRight` instead of sequencing with second value using `Effect.flatMap`
- `prefer-from-nullable` - Suggests `Effect.fromNullable` instead of `Effect.succeed + Effect.flatMap(Option.match)`
- `prefer-get-or-else` - Suggests `Option.getOrElse` instead of `Option.match` with identity function
- `prefer-get-or-null` - Suggests `Option.getOrNull` instead of `Option.match` returning null

**Enhanced existing rules:**

- `prefer-andThen` - Now supports auto-fixing for multiple Effect types (Option, Either, Exit, Stream, etc.)
- `prefer-as` - Enhanced with more pattern detection and auto-fix capabilities

**Testing improvements:**

- Added isolated test linting configuration to prevent rule conflicts in test files
- Added per-file rule enablement config for better test organization

All new rules include auto-fix capabilities where applicable and are enabled in the `recommended` configuration.
