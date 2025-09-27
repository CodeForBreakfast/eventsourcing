# @codeforbreakfast/eventsourcing-store-inmemory

## 1.0.0

### Major Changes

- [#105](https://github.com/CodeForBreakfast/eventsourcing/pull/105) [`f5c1710`](https://github.com/CodeForBreakfast/eventsourcing/commit/f5c1710a3140cd380409e1e2c89919ce068826e1) Thanks [@GraemeF](https://github.com/GraemeF)! - Extract in-memory EventStore implementation into separate package

  The in-memory EventStore implementation has been moved from `@codeforbreakfast/eventsourcing-store` to its own dedicated `@codeforbreakfast/eventsourcing-store-inmemory` package for better architectural separation.

  **Benefits:**
  - **Cleaner Architecture**: Core package contains only abstractions and interfaces
  - **Better Modularity**: In-memory implementation is self-contained with its own documentation
  - **Improved Separation**: Clear boundaries between core types and specific implementations
  - **Enhanced Maintainability**: Each package has focused responsibilities

### Patch Changes

- Updated dependencies [[`0c99b22`](https://github.com/CodeForBreakfast/eventsourcing/commit/0c99b22849ba2a0b9211790b0f3334c3a7a0471e), [`fe2cf43`](https://github.com/CodeForBreakfast/eventsourcing/commit/fe2cf43ea701843ef79df0f2de936fb0c2b3f91a), [`ebf5c45`](https://github.com/CodeForBreakfast/eventsourcing/commit/ebf5c45bb8037da2a43997ac749b9c60e4097e4b), [`d4063a3`](https://github.com/CodeForBreakfast/eventsourcing/commit/d4063a351d83d2830e27dfc88972559de74096db), [`f5c1710`](https://github.com/CodeForBreakfast/eventsourcing/commit/f5c1710a3140cd380409e1e2c89919ce068826e1), [`ac05ab4`](https://github.com/CodeForBreakfast/eventsourcing/commit/ac05ab403201412f768752a8a139dc152d0a9902), [`b8fa706`](https://github.com/CodeForBreakfast/eventsourcing/commit/b8fa706fa4a99772979dca89079205dbd257e3dc), [`136d160`](https://github.com/CodeForBreakfast/eventsourcing/commit/136d1609ddb84a2e5b67fd3d0ba918386ae183ce)]:
  - @codeforbreakfast/eventsourcing-store@1.0.0
