# @codeforbreakfast/eventsourcing-protocol-default

## 0.2.2

### Patch Changes

- [#79](https://github.com/CodeForBreakfast/eventsourcing/pull/79) [`5720964`](https://github.com/CodeForBreakfast/eventsourcing/commit/57209643dd18db0fb876d898fd48796042270eaa) Thanks [@GraemeF](https://github.com/GraemeF)! - Fix release pipeline failures caused by TypeScript build issues

  The release process was failing because packages with `workspace:*` dependencies were rebuilding during publish via `prepublishOnly` hooks. This caused TypeScript compilation errors when dependent packages tried to build in parallel without access to their dependencies' declaration files.

  **Solution:**
  - Removed `prepublishOnly` hooks from all packages (turbo already handles build order correctly)
  - Updated release script to use `changeset publish` directly instead of custom turbo publish tasks
  - Ensured all packages are built in dependency order before publishing begins

  This ensures a smooth release process where:
  1. All packages build in correct dependency order (respecting workspace dependencies)
  2. Changesets handles publishing with proper version resolution
  3. No parallel rebuild issues during the publish phase

- [#79](https://github.com/CodeForBreakfast/eventsourcing/pull/79) [`5720964`](https://github.com/CodeForBreakfast/eventsourcing/commit/57209643dd18db0fb876d898fd48796042270eaa) Thanks [@GraemeF](https://github.com/GraemeF)! - Simplified release validation using changesets' native tools. The CI now validates:
  - Changeset status to ensure changes have appropriate version bumps
  - Build success for all packages
  - Publish readiness via changesets publish --dry-run

  This provides focused, relevant validation without unnecessary checks, ensuring smooth releases while keeping CI fast and maintainable.

- Updated dependencies [[`5720964`](https://github.com/CodeForBreakfast/eventsourcing/commit/57209643dd18db0fb876d898fd48796042270eaa), [`5720964`](https://github.com/CodeForBreakfast/eventsourcing/commit/57209643dd18db0fb876d898fd48796042270eaa)]:
  - @codeforbreakfast/eventsourcing-store@0.6.7
  - @codeforbreakfast/eventsourcing-transport-contracts@0.2.2

## 0.2.1

### Patch Changes

- [#73](https://github.com/CodeForBreakfast/eventsourcing/pull/73) [`7cec47a`](https://github.com/CodeForBreakfast/eventsourcing/commit/7cec47a3cf6741febd99f96dec4cadb1923543c2) Thanks [@GraemeF](https://github.com/GraemeF)! - Documentation updates to match current codebase implementation:
  - Fixed incorrect package names and import paths
  - Updated API examples and function signatures
  - Corrected WebSocket usage patterns
  - Removed outdated temporary documentation

- [#74](https://github.com/CodeForBreakfast/eventsourcing/pull/74) [`ff5231c`](https://github.com/CodeForBreakfast/eventsourcing/commit/ff5231c27122a47839b3aedf162c00f30f5e3257) Thanks [@GraemeF](https://github.com/GraemeF)! - Improved CI validation to prevent release failures. The changeset validation now:
  - Detects when code changes are made without changesets (preventing npm republish failures)
  - Checks if package versions already exist on npm
  - Provides clear guidance on creating changesets with consumer-focused messages
  - Distinguishes between code changes (requiring changesets) and documentation-only changes (optional)

- Updated dependencies [[`7cec47a`](https://github.com/CodeForBreakfast/eventsourcing/commit/7cec47a3cf6741febd99f96dec4cadb1923543c2), [`ff5231c`](https://github.com/CodeForBreakfast/eventsourcing/commit/ff5231c27122a47839b3aedf162c00f30f5e3257)]:
  - @codeforbreakfast/eventsourcing-store@0.6.6
  - @codeforbreakfast/eventsourcing-transport-contracts@0.2.1

## 0.2.0

### Minor Changes

- [#67](https://github.com/CodeForBreakfast/eventsourcing/pull/67) [`b7da1d2`](https://github.com/CodeForBreakfast/eventsourcing/commit/b7da1d24b822cf3b7853f659a6df161b7c6126e5) Thanks [@GraemeF](https://github.com/GraemeF)! - Complete refactor of transport layer with proper layered architecture

  ### Transport & Protocol Improvements
  - **New simplified transport contracts** - Minimal Client/Server namespaces with clean separation of concerns
  - **Protocol layer separation** - Clear boundary between data transport and business logic
  - **Functional Effect-based design** - Replaced 3900+ lines of OOP with functional primitives
  - **Zero global state** - All state properly managed through Effect refs

  ### New Packages
  - `@codeforbreakfast/eventsourcing-protocol-default` - Simplified protocol implementation with client/server logic
  - `@codeforbreakfast/eventsourcing-testing-contracts` - Reusable contract tests for transport implementations

  ### Breaking Changes
  - Removed `eventsourcing-protocol-contracts` package (merged into protocol-default)
  - WebSocket transport completely rewritten with new API
  - Transport implementations now use Effect.Tag pattern consistently

  ### Testing Improvements
  - 2000+ lines of comprehensive protocol tests
  - Contract-based testing for all transport implementations
  - Type-safe schema validation throughout

  ### Developer Experience
  - Added `bun run ci` command for local CI validation
  - Simplified API surface with better type inference
  - Consistent error handling across all packages

### Patch Changes

- Updated dependencies [[`b7da1d2`](https://github.com/CodeForBreakfast/eventsourcing/commit/b7da1d24b822cf3b7853f659a6df161b7c6126e5)]:
  - @codeforbreakfast/eventsourcing-transport-contracts@0.2.0
