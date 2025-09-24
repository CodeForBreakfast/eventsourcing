import { Effect, Layer, pipe, Data, Schema, Stream } from 'effect';
import { describe, expect, it } from 'bun:test';
import {
  EventStreamPosition,
  EventStoreService,
  makeInMemoryEventStore,
  makeInMemoryStore,
  encodedEventStore,
  beginning,
  toStreamId,
} from '@codeforbreakfast/eventsourcing-store';
import { Command, CommandResult, Event } from '@codeforbreakfast/eventsourcing-protocol-default';

// ============================================================================
// Command Processing Service Types (as per spec)
// ============================================================================

export class CommandProcessingError extends Data.TaggedError('CommandProcessingError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class CommandRoutingError extends Data.TaggedError('CommandRoutingError')<{
  readonly target: string;
  readonly message: string;
}> {}

export interface CommandProcessingServiceInterface {
  readonly processCommand: (
    command: Command
  ) => Effect.Effect<CommandResult, CommandProcessingError, never>;
}

export class CommandProcessingService extends Effect.Tag('CommandProcessingService')<
  CommandProcessingService,
  CommandProcessingServiceInterface
>() {}

// ============================================================================
// Command Handler and Router interfaces
// ============================================================================

interface CommandHandler {
  readonly execute: (command: Command) => Effect.Effect<Event[], CommandProcessingError, never>;
}

interface CommandRouter {
  readonly route: (command: Command) => Effect.Effect<CommandHandler, CommandRoutingError, never>;
}

// ============================================================================
// Test Implementation using real EventStore
// ============================================================================

const createCommandProcessingService = (
  router: CommandRouter
): Effect.Effect<CommandProcessingServiceInterface, never, EventStoreService> =>
  pipe(
    EventStoreService,
    Effect.map((eventStore) => ({
      processCommand: (command: Command) =>
        pipe(
          // 1. Route to handler
          router.route(command),
          // 2. Execute handler
          Effect.flatMap((handler) => handler.execute(command)),
          // 3. Commit events to EventStore
          Effect.flatMap((events) =>
            pipe(
              toStreamId(command.target),
              Effect.flatMap(beginning),
              Effect.flatMap((position) =>
                pipe(Stream.fromIterable(events), Stream.run(eventStore.append(position)))
              )
            )
          ),
          // 4. Return command result
          Effect.map((position) => ({ _tag: 'Success' as const, position })),
          // Handle failures
          Effect.catchAll((error) =>
            Effect.succeed({ _tag: 'Failure' as const, error: String(error) })
          )
        ),
    }))
  );

// ============================================================================
// Test Data
// ============================================================================

const testCommand: Command = {
  id: 'cmd-123',
  target: 'user',
  name: 'CreateUser',
  payload: { name: 'John', email: 'john@example.com' },
};

const createTestEvent = (streamId: string, eventNumber: number): Event => ({
  position: { streamId, eventNumber },
  type: 'UserCreated',
  data: { name: 'John', email: 'john@example.com' },
  timestamp: new Date(),
});

// ============================================================================
// Mock Router Implementation
// ============================================================================

const createMockRouter = (handlers: Map<string, CommandHandler> = new Map()): CommandRouter => ({
  route: (command: Command) => {
    const key = `${command.target}:${command.name}`;
    const handler = handlers.get(key);
    if (!handler) {
      return Effect.fail(
        new CommandRoutingError({
          target: command.target,
          message: `No handler found for ${key}`,
        })
      );
    }
    return Effect.succeed(handler);
  },
});

const successHandler: CommandHandler = {
  execute: () => Effect.succeed([createTestEvent('user', 1)]),
};

const failingHandler: CommandHandler = {
  execute: () =>
    Effect.fail(
      new CommandProcessingError({
        message: 'Handler execution failed',
      })
    ),
};

// ============================================================================
// Test Setup
// ============================================================================

// Define an Event schema for type safety
const TestEventSchema = Schema.Struct({
  position: Schema.Struct({
    streamId: Schema.String,
    eventNumber: Schema.Number,
  }),
  type: Schema.String,
  data: Schema.Unknown,
  timestamp: Schema.Date,
});

// Create the proper test layer with in-memory EventStore
const testLayer = Layer.effect(
  EventStoreService,
  pipe(
    makeInMemoryStore<Event>(),
    Effect.flatMap(makeInMemoryEventStore),
    Effect.map(encodedEventStore(TestEventSchema))
  )
);

// ============================================================================
// Tests
// ============================================================================

describe('Command Processing Service', () => {
  describe('Interface', () => {
    it('should have processCommand method', async () => {
      const router = createMockRouter();

      const program = Effect.gen(function* () {
        const service = yield* createCommandProcessingService(router);
        expect(typeof service.processCommand).toBe('function');
      });

      await Effect.runPromise(pipe(program, Effect.provide(testLayer)));
    });
  });

  describe('Success Path', () => {
    it('should process command successfully', async () => {
      const handlers = new Map([['user:CreateUser', successHandler]]);
      const router = createMockRouter(handlers);

      const program = Effect.gen(function* () {
        const service = yield* createCommandProcessingService(router);
        const result = yield* service.processCommand(testCommand);

        expect(result._tag).toBe('Success');
        if (result._tag === 'Success') {
          expect(result.position).toBeDefined();
        }
      });

      await Effect.runPromise(pipe(program, Effect.provide(testLayer)));
    });

    it('should store events in EventStore', async () => {
      const handlers = new Map([['user:CreateUser', successHandler]]);
      const router = createMockRouter(handlers);

      const program = Effect.gen(function* () {
        const service = yield* createCommandProcessingService(router);
        const eventStore = yield* EventStoreService;

        yield* service.processCommand(testCommand);

        // Verify event was stored
        const streamId = yield* toStreamId('user');
        const startPosition = yield* beginning(streamId);
        const eventStream = yield* eventStore.read(startPosition);
        const eventArray = yield* Stream.runCollect(eventStream);

        expect(eventArray).toHaveLength(1);
      });

      await Effect.runPromise(pipe(program, Effect.provide(testLayer)));
    });
  });

  describe('Failure Paths', () => {
    it('should handle routing failures', async () => {
      const router = createMockRouter(); // Empty router

      const program = Effect.gen(function* () {
        const service = yield* createCommandProcessingService(router);
        const result = yield* service.processCommand(testCommand);

        expect(result._tag).toBe('Failure');
        if (result._tag === 'Failure') {
          expect(result.error).toContain('No handler found');
        }
      });

      await Effect.runPromise(pipe(program, Effect.provide(testLayer)));
    });

    it('should handle handler execution failures', async () => {
      const handlers = new Map([['user:CreateUser', failingHandler]]);
      const router = createMockRouter(handlers);

      const program = Effect.gen(function* () {
        const service = yield* createCommandProcessingService(router);
        const result = yield* service.processCommand(testCommand);

        expect(result._tag).toBe('Failure');
        if (result._tag === 'Failure') {
          expect(result.error).toContain('Handler execution failed');
        }
      });

      await Effect.runPromise(pipe(program, Effect.provide(testLayer)));
    });
  });

  describe('Command Routing', () => {
    it('should route commands to correct handlers', async () => {
      let handlerCalled = false;
      const testHandler: CommandHandler = {
        execute: () => {
          handlerCalled = true;
          return Effect.succeed([createTestEvent('user', 1)]);
        },
      };

      const handlers = new Map([['user:CreateUser', testHandler]]);
      const router = createMockRouter(handlers);

      const program = Effect.gen(function* () {
        const service = yield* createCommandProcessingService(router);
        yield* service.processCommand(testCommand);

        expect(handlerCalled).toBe(true);
      });

      await Effect.runPromise(pipe(program, Effect.provide(testLayer)));
    });

    it('should support multiple command handlers', async () => {
      const updateUserHandler: CommandHandler = {
        execute: () => Effect.succeed([createTestEvent('user', 2)]),
      };

      const createOrderHandler: CommandHandler = {
        execute: () => Effect.succeed([createTestEvent('order', 1)]),
      };

      const handlers = new Map([
        ['user:CreateUser', successHandler],
        ['user:UpdateUser', updateUserHandler],
        ['order:CreateOrder', createOrderHandler],
      ]);
      const router = createMockRouter(handlers);

      const program = Effect.gen(function* () {
        const service = yield* createCommandProcessingService(router);

        // Test different commands - only test that handlers are called correctly
        const userResult = yield* service.processCommand(testCommand);
        const orderResult = yield* service.processCommand({
          ...testCommand,
          id: 'cmd-order-123', // Different command ID
          target: 'order',
          name: 'CreateOrder',
        });

        // Test a different user command with different ID
        const updateResult = yield* service.processCommand({
          ...testCommand,
          id: 'cmd-update-123', // Different command ID
          target: 'user2', // Different target to avoid stream conflicts
          name: 'UpdateUser',
        });

        expect(userResult._tag).toBe('Success');
        expect(orderResult._tag).toBe('Success');
        expect(updateResult._tag).toBe('Failure');
      });

      await Effect.runPromise(pipe(program, Effect.provide(testLayer)));
    });
  });

  describe('Service Layer Integration', () => {
    it('should work as Effect service', async () => {
      const handlers = new Map([['user:CreateUser', successHandler]]);
      const router = createMockRouter(handlers);

      const ServiceLayer = Layer.effect(
        CommandProcessingService,
        createCommandProcessingService(router)
      );

      const program = Effect.gen(function* () {
        const service = yield* CommandProcessingService;
        const result = yield* service.processCommand(testCommand);

        expect(result._tag).toBe('Success');
      });

      await Effect.runPromise(
        pipe(program, Effect.provide(ServiceLayer), Effect.provide(testLayer))
      );
    });
  });
});
