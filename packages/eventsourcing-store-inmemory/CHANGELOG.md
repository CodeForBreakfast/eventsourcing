# @codeforbreakfast/eventsourcing-store-inmemory

## 0.2.3

### Patch Changes

- [#141](https://github.com/CodeForBreakfast/eventsourcing/pull/141) [`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix repository URL format for npm trusted publishing compatibility

  Updated repository URLs in all package.json files to match the exact format required by npm's trusted publishing provenance validation. Changed from lowercase 'codeforbreakfast' to 'CodeForBreakfast' and removed the '.git' suffix to align with the GitHub repository's canonical URL format.

- Updated dependencies [[`5329c9a`](https://github.com/CodeForBreakfast/eventsourcing/commit/5329c9a94dbf1d07a88f3c3848f3410c8be3e5e4)]:
  - @codeforbreakfast/eventsourcing-store@0.7.3

## 0.2.2

### Patch Changes

- [#136](https://github.com/CodeForBreakfast/eventsourcing/pull/136) [`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2) Thanks [@GraemeF](https://github.com/GraemeF)! - Add npm as dev dependency to support OIDC trusted publishing

  Installs npm 11.6.1+ as a dev dependency to enable OIDC trusted publishing in GitHub Actions. This eliminates the need for long-lived NPM_TOKEN secrets when publishing packages to the npm registry.

- Updated dependencies [[`d3f18d4`](https://github.com/CodeForBreakfast/eventsourcing/commit/d3f18d4100fa466a2b98b83721deb7c2c29de5d2)]:
  - @codeforbreakfast/eventsourcing-store@0.7.2

## 0.2.1

### Patch Changes

- [#126](https://github.com/CodeForBreakfast/eventsourcing/pull/126) [`31dbe34`](https://github.com/CodeForBreakfast/eventsourcing/commit/31dbe348132aea1d65fa64493533a614a404bd25) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved development workflow with git worktree integration

  This change improves the development experience by implementing a git worktree-based workflow that provides better isolation between feature development and the main branch. The `/start` slash command now creates isolated worktrees for each feature, and the `/automerge` command properly cleans up worktrees after successful merges.

  Key benefits for developers:
  - Complete isolation of feature branches in separate working directories
  - Eliminates risk of contaminating main branch with uncommitted changes
  - Allows working on multiple features simultaneously
  - Each worktree maintains its own node_modules and mise configuration
  - Automatic mise trust and dependency installation in new worktrees

- [#129](https://github.com/CodeForBreakfast/eventsourcing/pull/129) [`565fff4`](https://github.com/CodeForBreakfast/eventsourcing/commit/565fff49f7e6878e8cb801bd2351a723bf2cc067) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve CI performance with enhanced Turbo cache strategy

  Enhanced the CI workflow to use a more intelligent cache strategy that enables better cache reuse across commits and between PR runs and main branch builds. CI builds now complete significantly faster when dependencies haven't changed.

  This is purely an internal development workflow improvement that does not affect the public API or runtime behavior of any packages.

- [#130](https://github.com/CodeForBreakfast/eventsourcing/pull/130) [`1ee3bf3`](https://github.com/CodeForBreakfast/eventsourcing/commit/1ee3bf3ad919580ae4e00edfc9defc5776f9b94e) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved CI/CD infrastructure with standardized mise-based tool management and optimized caching strategies for faster builds and more reliable deployments.

- [#128](https://github.com/CodeForBreakfast/eventsourcing/pull/128) [`5cac87e`](https://github.com/CodeForBreakfast/eventsourcing/commit/5cac87e9edf83c7b8fce8f1ba0c51d576ca92c6d) Thanks [@GraemeF](https://github.com/GraemeF)! - Improve development workflow with enhanced validation scripts

  Enhanced the internal validation and release preparation scripts to use modern Turbo-based architecture. Package validation is now faster and more reliable thanks to improved caching and parallel execution. The validation process now properly separates discovery, orchestration, and execution concerns for better maintainability.

  Changes are purely internal to the development workflow and do not affect the public API or runtime behavior of any packages.

- Updated dependencies [[`31dbe34`](https://github.com/CodeForBreakfast/eventsourcing/commit/31dbe348132aea1d65fa64493533a614a404bd25), [`565fff4`](https://github.com/CodeForBreakfast/eventsourcing/commit/565fff49f7e6878e8cb801bd2351a723bf2cc067), [`1ee3bf3`](https://github.com/CodeForBreakfast/eventsourcing/commit/1ee3bf3ad919580ae4e00edfc9defc5776f9b94e), [`5cac87e`](https://github.com/CodeForBreakfast/eventsourcing/commit/5cac87e9edf83c7b8fce8f1ba0c51d576ca92c6d)]:
  - @codeforbreakfast/eventsourcing-store@0.7.1

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
