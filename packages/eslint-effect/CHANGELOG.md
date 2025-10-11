# @codeforbreakfast/eslint-effect

## 0.7.0

### Minor Changes

- [#248](https://github.com/CodeForBreakfast/eventsourcing/pull/248) [`bd1cc0e`](https://github.com/CodeForBreakfast/eventsourcing/commit/bd1cc0eddcf8aaae9614bf7df643b56f944c1728) Thanks [@GraemeF](https://github.com/GraemeF)! - Added `no-intermediate-effect-variables` rule to detect single-use intermediate variables in pipe chains. The rule encourages composing Effect/Stream/pipe operations in a single chain for better readability, while allowing variables that are genuinely reused multiple times. The rule is smart enough to exclude execution results (`runSync`, `runPromise`) and factory methods (`Schema.decode`) which return plain values or functions rather than Effects. This rule is included in the `pipeStrict` config preset.

- [#253](https://github.com/CodeForBreakfast/eventsourcing/pull/253) [`e03308f`](https://github.com/CodeForBreakfast/eventsourcing/commit/e03308f5b2a05de661ab05e804b0568cd6878848) Thanks [@GraemeF](https://github.com/GraemeF)! - Added new `prefer-effect-if-over-match-boolean` lint rule that enforces using `Effect.if` for boolean conditionals instead of `Match.value`. This rule helps distinguish between simple boolean branching (where `Effect.if` is clearer) and true pattern matching scenarios (where `Match.value` excels). Updated the `prefer-match-over-ternary` rule to work harmoniously with this new rule, focusing on non-boolean pattern matching use cases.

### Patch Changes

- [#246](https://github.com/CodeForBreakfast/eventsourcing/pull/246) [`212e229`](https://github.com/CodeForBreakfast/eventsourcing/commit/212e229e36ffefe76bf77ef12fb84fa01275d7cc) Thanks [@GraemeF](https://github.com/GraemeF)! - Fixed ESLint configuration to properly handle TypeScript declaration files. This resolves parsing errors that occurred when ESLint attempted to parse generated `.d.ts` files that were not included in TypeScript project configurations.

## 0.6.0

### Minor Changes

- [#235](https://github.com/CodeForBreakfast/eventsourcing/pull/235) [`1291e92`](https://github.com/CodeForBreakfast/eventsourcing/commit/1291e92ea26360c9071d07775d8dd57f799fdf9c) Thanks [@GraemeF](https://github.com/GraemeF)! - The `no-switch-statement` rule (renamed from `no-switch-on-tag`) now forbids ALL switch statements in strict mode, not just switches on `_tag`. Switch statements are imperative and don't provide exhaustiveness checking. Use `Match.value` for type-safe, exhaustive pattern matching on discriminated unions instead.

### Patch Changes

- [#232](https://github.com/CodeForBreakfast/eventsourcing/pull/232) [`328c762`](https://github.com/CodeForBreakfast/eventsourcing/commit/328c7623d162b4def2558db94297c81193da314e) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix `prefer-schema-validation-over-assertions` rule to allow safe `as const` type assertions. The rule now correctly distinguishes between unsafe type casts (which should use Schema validation) and safe const assertions used for literal type narrowing in discriminated unions.

## 0.5.1

### Patch Changes

- [#230](https://github.com/CodeForBreakfast/eventsourcing/pull/230) [`edc306f`](https://github.com/CodeForBreakfast/eventsourcing/commit/edc306f9e10377560102b4c90dca2d8cdb358bdd) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix no-unnecessary-function-alias rule to allow computed member expressions

  The rule now correctly excludes aliases for computed member expressions (bracket notation) like `const firstEvent = events[0]` or `const command = args[0]`. These aliases provide semantic value by giving meaningful names to array/object access patterns and should not be flagged as unnecessary.

## 0.5.0

### Minor Changes

- [#229](https://github.com/CodeForBreakfast/eventsourcing/pull/229) [`7a6b022`](https://github.com/CodeForBreakfast/eventsourcing/commit/7a6b0222ad29d49cca2bc99d47eda0538d1f0e5a) Thanks [@GraemeF](https://github.com/GraemeF)! - Added two new ESLint rules to enforce functional programming best practices:
  - `no-eta-expansion` - Detects unnecessary function wrappers (eta-expansion) that only pass parameters directly to another function. Encourages point-free style by flagging patterns like `(x) => fn(x)` which can be simplified to just `fn`. This helps reduce code noise and improve readability in functional compositions.
  - `no-unnecessary-function-alias` - Detects unnecessary function aliases that provide no semantic value. When a constant is assigned directly to another function without adding clarity or abstraction, it should be inlined at the call site. The rule is configurable with a `maxReferences` option to allow aliases that improve code reuse.

  Both rules are included in the recommended configuration and support ESLint's disable comments for legitimate use cases where the expanded form adds necessary clarity.

### Patch Changes

- [#227](https://github.com/CodeForBreakfast/eventsourcing/pull/227) [`9634b47`](https://github.com/CodeForBreakfast/eventsourcing/commit/9634b47f99e559022c30336bdac98254a7b6d770) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved the `suggest-currying-opportunity` rule to be more conservative and avoid problematic suggestions:
  - By default, the rule no longer suggests currying when it would require reordering parameters (which can break semantic ordering). This can be enabled with the `allowReordering` option.
  - The rule now limits currying depth to single-level by default to prevent unreadable multi-level currying like `(a) => (b) => (c) => ...`. This can be configured with the `maxCurriedParams` option (max 3).
  - Updated the rule message to be clearer about the benefits of currying in pipe contexts.

  Fixed the `no-curried-calls` rule to properly catch all curried function call patterns:
  - The rule now detects both member expression patterns (`Schema.decode()()`) and plain identifier patterns (`foo()()`).
  - This works in tandem with `no-nested-pipe` to encourage extraction of named, composable functions instead of inline arrow functions with complex logic.
  - Forces proper functional decomposition and creates reusable, testable function compositions.

  These changes reduce false positives in the currying suggestion rule while strengthening enforcement of idiomatic Effect pipe composition patterns.

## 0.4.0

### Minor Changes

- [#217](https://github.com/CodeForBreakfast/eventsourcing/pull/217) [`fd4e89e`](https://github.com/CodeForBreakfast/eventsourcing/commit/fd4e89eb6f2081ec83f7390ac5fedb107ec71112) Thanks [@GraemeF](https://github.com/GraemeF)! - Added `prefer-effect-platform` rule to encourage using @effect/platform APIs over native Node.js, Bun, and Deno platform APIs. The rule detects and warns against:
  - File system operations: Suggests using `FileSystem` from @effect/platform instead of `node:fs`, `Bun.file()`, or `Deno.readFile()`
  - HTTP operations: Suggests using `HttpClient` from @effect/platform instead of `fetch()` or `node:http/https`
  - Path operations: Suggests using `Path` from @effect/platform instead of `node:path`
  - Command execution: Suggests using `Command` from @effect/platform instead of `node:child_process`, `Bun.spawn()`, or `Deno.Command()`
  - Terminal I/O: Suggests using `Terminal` from @effect/platform instead of `console` methods or `process.stdout/stderr`
  - Process access: Suggests using platform Runtime instead of direct `process.env`, `process.cwd()`, etc.

  This rule is now enabled by default in the recommended configuration to help teams build platform-independent Effect applications.

## 0.3.1

### Patch Changes

- [#212](https://github.com/CodeForBreakfast/eventsourcing/pull/212) [`6f018d1`](https://github.com/CodeForBreakfast/eventsourcing/commit/6f018d19f0cb318c3e79251af72f333d88feb51b) Thanks [@GraemeF](https://github.com/GraemeF)! - Fixed npm publication configuration. The package now includes the required `publishConfig.access` setting to allow publication to the public npm registry. This was preventing the package from being published successfully.

## 0.3.0

### Minor Changes

- [#208](https://github.com/CodeForBreakfast/eventsourcing/pull/208) [`15e3756`](https://github.com/CodeForBreakfast/eventsourcing/commit/15e37562fa5c207fa3801d3a05aa1c2f9f9b6ae7) Thanks [@GraemeF](https://github.com/GraemeF)! - Expose syntax restrictions as named ESLint rules for easier configuration

  Rules previously bundled in `no-restricted-syntax` are now available as individual named rules that can be easily enabled or disabled:

  **New named rules:**
  - `effect/no-classes` - Forbid classes except Effect tags/errors/schemas
  - `effect/no-runSync` - Forbid Effect.runSync in production code
  - `effect/no-runPromise` - Forbid Effect.runPromise in production code
  - `effect/prefer-andThen` - Prefer Effect.andThen() over Effect.flatMap(() => ...)
  - `effect/prefer-as` - Prefer Effect.as() over Effect.map(() => value)
  - `effect/no-gen` - Forbid Effect.gen (used in `noGen` config)

  **Before:**

  ```javascript
  // Had to manipulate no-restricted-syntax arrays
  rules: {
    'no-restricted-syntax': [
      'error',
      ...effectPlugin.configs.recommended.rules['no-restricted-syntax']
        .slice(1)
        .filter(restriction => ...)
    ]
  }
  ```

  **After:**

  ```javascript
  // Simply disable by rule name
  {
    ...effectPlugin.configs.recommended,
    rules: {
      'effect/no-runPromise': 'off',
      'effect/no-runSync': 'off',
    }
  }
  ```

  This makes it much easier to customize which rules are enabled for different file patterns (e.g., allowing `runPromise` in application entry points while forbidding it in library code).

### Patch Changes

- [#211](https://github.com/CodeForBreakfast/eventsourcing/pull/211) [`6c1f10d`](https://github.com/CodeForBreakfast/eventsourcing/commit/6c1f10dc95b18cf554d1614c6d31535920f0a767) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve nested pipe detection and add test enforcement rules

  **Breaking behavior change in `no-nested-pipes` rule (formerly `no-multiple-pipes`):**

  The rule now only flags truly nested pipe calls (where one pipe is used as an argument to another pipe), instead of flagging any function with multiple sequential pipe calls.

  **Before:**

  ```typescript
  // This was incorrectly flagged as an error
  const result1 = pipe(42, (x) => x + 1);
  const result2 = pipe(result1, (x) => x * 2); // ❌ Error
  ```

  **After:**

  ```typescript
  // Multiple sequential pipes are now allowed
  const result1 = pipe(42, (x) => x + 1);
  const result2 = pipe(result1, (x) => x * 2); // ✅ OK

  // Only nested pipes are flagged
  const bad = pipe(
    pipe(42, (x) => x + 1), // ❌ Error - nested pipe
    (x) => x * 2
  );
  ```

  **New buntest rules:**
  - `buntest/no-runPromise-in-tests` - Enforces using `it.effect()` instead of `Effect.runPromise()` in test files for better error handling and test isolation

  **Migration guide:**

  If you were relying on the old `no-multiple-pipes` behavior, you'll need to update your ESLint config to use the new rule name `no-nested-pipes`. The rule is less strict now and only catches genuinely problematic nested pipe patterns.

## 0.2.0

### Minor Changes

- [#205](https://github.com/CodeForBreakfast/eventsourcing/pull/205) [`0a7382a`](https://github.com/CodeForBreakfast/eventsourcing/commit/0a7382a55578bbdd2350ad624b0333ff209fbf1d) Thanks [@GraemeF](https://github.com/GraemeF)! - New package: ESLint rules and configurations for Effect projects

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

### Patch Changes

- [#207](https://github.com/CodeForBreakfast/eventsourcing/pull/207) [`7b902b9`](https://github.com/CodeForBreakfast/eventsourcing/commit/7b902b9e5a86a60534640a4358e974a4b0cd2527) Thanks [@GraemeF](https://github.com/GraemeF)! - Complete test coverage for all ESLint rules

  Added comprehensive test coverage ensuring all custom rules and syntax restrictions are properly tested. This includes adding a missing test case for the curried function call restriction and consolidating all test fixtures into the eslint-effect package.

- [#206](https://github.com/CodeForBreakfast/eventsourcing/pull/206) [`322a7ab`](https://github.com/CodeForBreakfast/eventsourcing/commit/322a7aba4778b3f2e1cf4aa6ad4abc37414af8a7) Thanks [@GraemeF](https://github.com/GraemeF)! - CI workflow now uses concurrency groups to prevent duplicate workflow runs when the release bot updates PRs. This eliminates wasted compute resources from race conditions in GitHub's API-based commit handling.
