---
'@codeforbreakfast/eslint-effect': minor
---

New package: ESLint rules and configurations for Effect projects

This package provides custom ESLint rules and pre-configured rule sets to enforce functional programming best practices and idiomatic Effect code patterns in your TypeScript projects.

**Custom Rules:**

- `no-unnecessary-pipe-wrapper` - Detects unnecessary function wrappers around single pipe operations
- `prefer-match-tag` - Enforces `Match.tag()` over `Match.when()` for `_tag` discriminators (auto-fixable)
- `prefer-match-over-conditionals` - Encourages declarative `Match` patterns over imperative conditionals in Effect callbacks
- `prefer-schema-validation-over-assertions` - Discourages type assertions in favor of runtime validation with `Schema.decodeUnknown`

**Configuration Presets:**

- `effectSyntaxRestrictions` - Forbids Effect.gen, classes (except service tags), runSync/runPromise, direct \_tag access, and enforces Effect.andThen/as patterns
- `simplePipeSyntaxRestrictions` - Ensures consistent pipe usage, forbids curried calls, nested pipes, and multiple pipes per function
- `functionalImmutabilityRules` - Leverages eslint-plugin-functional with Effect-aware configuration for readonly types, no let bindings, and immutable data patterns

The package makes no assumptions about how rules should be configured for test files - consumers define their own test-specific rules based on their testing needs.
