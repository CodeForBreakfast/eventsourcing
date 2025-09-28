# @codeforbreakfast/eventsourcing-store-inmemory

## 0.2.0

### Minor Changes

- [#105](https://github.com/CodeForBreakfast/eventsourcing/pull/105) [`f5c1710`](https://github.com/CodeForBreakfast/eventsourcing/commit/f5c1710a3140cd380409e1e2c89919ce068826e1) Thanks [@GraemeF](https://github.com/GraemeF)! - Extract in-memory EventStore implementation into separate package

  The in-memory EventStore implementation has been moved from `@codeforbreakfast/eventsourcing-store` to its own dedicated `@codeforbreakfast/eventsourcing-store-inmemory` package for better architectural separation.

  **Benefits:**
  - **Cleaner Architecture**: Core package contains only abstractions and interfaces
  - **Better Modularity**: In-memory implementation is self-contained with its own documentation
  - **Improved Separation**: Clear boundaries between core types and specific implementations
  - **Enhanced Maintainability**: Each package has focused responsibilities

- [#120](https://github.com/CodeForBreakfast/eventsourcing/pull/120) [`1ab2f4e`](https://github.com/CodeForBreakfast/eventsourcing/commit/1ab2f4e3f6f3ff19eb6a52ed6a1095dd94209247) Thanks [@GraemeF](https://github.com/GraemeF)! - Export InMemoryStore as namespace following Effect patterns

  **BREAKING CHANGE**: InMemoryStore is now exported as a namespace module instead of individual exports.

  Before:

  ```typescript
  import { make } from '@codeforbreakfast/eventsourcing-store-inmemory';
  const store = await make();
  ```

  After:

  ```typescript
  import { InMemoryStore } from '@codeforbreakfast/eventsourcing-store-inmemory';
  const store = await InMemoryStore.make();
  ```

  This change aligns with Effect library conventions where modules like Queue, Ref, etc. are exported as namespaces containing their functions.

### Patch Changes

- [#125](https://github.com/CodeForBreakfast/eventsourcing/pull/125) [`5a503fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a503fa89418682ae5bc1a4202918869743fdcc6) Thanks [@GraemeF](https://github.com/GraemeF)! - Ensure pre-1.0 packages use minor version bumps instead of major

  Updated changeset configurations to use minor version bumps as the maximum for all pre-1.0 packages, following semantic versioning best practices for pre-release versions. This ensures breaking changes are communicated through minor version increments rather than major version bumps while packages are still in initial development.

- [#119](https://github.com/CodeForBreakfast/eventsourcing/pull/119) [`2b3f3d6`](https://github.com/CodeForBreakfast/eventsourcing/commit/2b3f3d6dc0a4b69aa6384ad65e3bd54d98c23840) Thanks [@GraemeF](https://github.com/GraemeF)! - Enforce functional programming patterns through ESLint rules and refactor InMemoryStore
  - Added ESLint rule to ban class declarations except for Effect-sanctioned patterns (service tags, error classes, and Schema classes)
  - Refactored InMemoryStore from a class to a functional factory pattern following Effect library conventions
  - The InMemoryStore API remains unchanged - this is an internal implementation improvement

- Updated dependencies [[`0c99b22`](https://github.com/CodeForBreakfast/eventsourcing/commit/0c99b22849ba2a0b9211790b0f3334c3a7a0471e), [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a), [`93158e5`](https://github.com/CodeForBreakfast/eventsourcing/commit/93158e5a220dd84f479f42b968a984d28a10fb7b), [`5a503fa`](https://github.com/CodeForBreakfast/eventsourcing/commit/5a503fa89418682ae5bc1a4202918869743fdcc6), [`ebf5c45`](https://github.com/CodeForBreakfast/eventsourcing/commit/ebf5c45bb8037da2a43997ac749b9c60e4097e4b), [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db), [`f5c1710`](https://github.com/CodeForBreakfast/eventsourcing/commit/f5c1710a3140cd380409e1e2c89919ce068826e1), [`ac05ab4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac05ab403201412f768752a8a139dc152d0a9902), [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc), [`136d160`](https://github.com/CodeForBreakfast/eventsourcing/commit/136d1609ddb84a2e5b67fd3d0ba918386ae183ce)]:
  - @codeforbreakfast/eventsourcing-store@0.7.0
