# @codeforbreakfast/eventsourcing-server

## 0.2.3

### Patch Changes

- [#360](https://github.com/CodeForBreakfast/eventsourcing/pull/360) [`524e2b3`](https://github.com/CodeForBreakfast/eventsourcing/commit/524e2b36befc0239d661f60ae7b92f3f47f761ee) Thanks [@renovate](https://github.com/apps/renovate)! - Update Effect ecosystem dependencies to latest versions:
  - effect: 3.18.4 -> 3.19.9
  - @effect/platform: 0.92.1 -> 0.93.6
  - @effect/platform-bun: 0.81.1 -> 0.86.0
  - @effect/sql: 0.46.0 -> 0.48.6
  - @effect/sql-pg: 0.47.0 -> 0.49.7
  - @effect/cli: 0.71.0 -> 0.72.1
  - @effect/experimental: 0.56.0 -> 0.57.11

  Added new peer dependencies required by @effect/platform-bun:
  - @effect/cluster: 0.55.0
  - @effect/rpc: 0.72.2
  - @effect/workflow: 0.15.0

- Updated dependencies [[`524e2b3`](https://github.com/CodeForBreakfast/eventsourcing/commit/524e2b36befc0239d661f60ae7b92f3f47f761ee)]:
  - @codeforbreakfast/eventsourcing-store@0.9.3

## 0.2.2

### Patch Changes

- [#381](https://github.com/CodeForBreakfast/eventsourcing/pull/381) [`9849132`](https://github.com/CodeForBreakfast/eventsourcing/commit/9849132e78732f795aa15d3d8053baae92e97d0b) Thanks [@GraemeF](https://github.com/GraemeF)! - Rename package from `@codeforbreakfast/buntest` to `@codeforbreakfast/bun-test-effect` and prepare for public npm release.

  **Migration:** Update your imports from `@codeforbreakfast/buntest` to `@codeforbreakfast/bun-test-effect`.

  This release makes the package publicly available on npm with:
  - Effect-aware test runners (`it.effect`, `it.scoped`, `it.live`, `it.scopedLive`)
  - Layer sharing across tests with `it.layer()`
  - Effect-native assertions (`expectSome`, `expectNone`, `expectRight`, `expectLeft`, `assertEqual`)
  - ESLint rules for Effect testing best practices
  - Silent logger utility for suppressing test output

- Updated dependencies [[`9849132`](https://github.com/CodeForBreakfast/eventsourcing/commit/9849132e78732f795aa15d3d8053baae92e97d0b)]:
  - @codeforbreakfast/eventsourcing-store@0.9.2

## 0.2.1

### Patch Changes

- [#337](https://github.com/CodeForBreakfast/eventsourcing/pull/337) [`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4) Thanks [@GraemeF](https://github.com/GraemeF)! - Bump version for dependency updates

  Internal dependencies were updated with test refactorings. No functional changes to this package.

- [#354](https://github.com/CodeForBreakfast/eventsourcing/pull/354) [`3d61dac`](https://github.com/CodeForBreakfast/eventsourcing/commit/3d61dac5fde62ce278d5b85198b25252382e4c13) Thanks [@GraemeF](https://github.com/GraemeF)! - EventBus now handles exceptions thrown by subscriber filter functions gracefully

  When a subscriber's filter function throws an exception, that subscriber will silently skip the event instead of crashing the entire EventBus. Other subscribers continue to receive events normally. This improves resilience and prevents one misbehaving subscriber from affecting the entire event distribution system.

- [#351](https://github.com/CodeForBreakfast/eventsourcing/pull/351) [`fdf9e19`](https://github.com/CodeForBreakfast/eventsourcing/commit/fdf9e19b3bad31e396e8a000ae5ab1a91000b845) Thanks [@GraemeF](https://github.com/GraemeF)! - Add test coverage for historical events before EventBus layer creation. Verifies that events written to the store before the EventBus layer exists are not delivered to subscribers.

- [#348](https://github.com/CodeForBreakfast/eventsourcing/pull/348) [`274486f`](https://github.com/CodeForBreakfast/eventsourcing/commit/274486f5b7b3935451f9e6aa782423b8259cc90d) Thanks [@GraemeF](https://github.com/GraemeF)! - Add integration test verifying EventBus correctly handles late-arriving subscribers. The test confirms that subscribers joining an already-running EventBus only receive events published after their subscription, not historical events from the PubSub.

- Updated dependencies [[`06235ad`](https://github.com/CodeForBreakfast/eventsourcing/commit/06235ad9ac3d06dc1d0b513d48f585cff696c6b4)]:
  - @codeforbreakfast/eventsourcing-store@0.9.1

## 0.2.0

### Minor Changes

- [#334](https://github.com/CodeForBreakfast/eventsourcing/pull/334) [`dd2fd10`](https://github.com/CodeForBreakfast/eventsourcing/commit/dd2fd10e752b12b328b38f52802c008e7b00d117) Thanks [@GraemeF](https://github.com/GraemeF)! - Add EventBus implementation for cross-stream event distribution

  This change introduces a new EventBus component that provides a centralized mechanism for distributing events from the event store to multiple independent subscribers. The EventBus subscribes to all events via `EventStore.subscribeAll()` and broadcasts them to registered consumers.

  **What changed:**
  - Added `EventBus` interface with `subscribe()` method
  - Implemented `makeEventBus()` factory function that creates a Layer providing EventBus
  - EventBus internally manages a single `subscribeAll()` subscription and broadcasts to multiple consumers
  - Each subscriber receives an independent `Stream.Stream<StreamEvent<T>, EventStoreError>`
  - Subscriptions are properly cleaned up when their scopes close

  **Use cases:**

  The EventBus is ideal for scenarios where you need multiple independent components to react to the same stream of events without each creating their own expensive `subscribeAll()` subscription:
  - Multiple projection builders processing the same event stream
  - Real-time event notification systems
  - Event monitoring and logging systems
  - Analytics or audit trail processors

  **Usage:**

  ```typescript
  import { EventBus, makeEventBus } from '@codeforbreakfast/eventsourcing-server';

  // Create and provide the EventBus layer
  const EventBusLive = makeEventBus<MyEvent>();

  const program = Effect.gen(function* () {
    const eventBus = yield* EventBus;

    // Subscribe to all events
    const eventStream = yield* eventBus.subscribe();

    // Process events
    yield* Stream.runForEach(eventStream, (streamEvent) =>
      Console.log(`Received event: ${streamEvent.event.type}`)
    );
  }).pipe(Effect.provide(EventBusLive), Effect.provide(EventStoreLive));
  ```

  **Technical notes:**
  - The EventBus creates a single internal `subscribeAll()` subscription on first subscriber
  - Events are broadcast to all active subscribers via a PubSub hub
  - Clean shutdown is handled via Effect's scoped resource management
  - The implementation is transport-agnostic and works with any EventStore implementation
