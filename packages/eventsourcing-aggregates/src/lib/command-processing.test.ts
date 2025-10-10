import { Effect, Layer, pipe, Stream, Schema, Context, Brand } from 'effect';
import { describe, expect, it } from '@codeforbreakfast/buntest';
import { beginning, toStreamId, type EventStore } from '@codeforbreakfast/eventsourcing-store';
import {
  makeInMemoryEventStore,
  InMemoryStore,
} from '@codeforbreakfast/eventsourcing-store-inmemory';
import {
  type WireCommand,
  type CommandResult,
  isCommandSuccess,
  isCommandFailure,
  type CommandFailure,
} from '@codeforbreakfast/eventsourcing-commands';
import { CommandProcessingError, CommandRoutingError } from './commandProcessingErrors';
import { CommandProcessingService } from './commandProcessingService';
import { CommandHandler, CommandRouter } from './commandHandling';
import { createCommandProcessingService } from './commandProcessingFactory';

// ============================================================================
// Test Domain Events
// ============================================================================

const UnknownErrorSchema = Schema.Struct({
  _tag: Schema.Literal('UnknownError'),
  commandId: Schema.String,
  message: Schema.String,
});

const isUnknownError: (
  error: CommandFailure['error']
) => error is Extract<CommandFailure['error'], { readonly _tag: 'UnknownError' }> =
  Schema.is(UnknownErrorSchema);

const UserCreated = Schema.Struct({
  type: Schema.Literal('UserCreated'),
  data: Schema.Struct({
    name: Schema.String,
    email: Schema.String,
  }),
});

const OrderCreated = Schema.Struct({
  type: Schema.Literal('OrderCreated'),
  data: Schema.Struct({
    orderId: Schema.String,
  }),
});

const TestEvent = Schema.Union(UserCreated, OrderCreated);
type TestEvent = typeof TestEvent.Type;

const TestEventStore = Context.GenericTag<EventStore<TestEvent>, EventStore<TestEvent>>(
  'TestEventStore'
);

// ============================================================================
// Test Data
// ============================================================================

const testCommand: WireCommand = {
  id: 'cmd-123',
  target: 'user',
  name: 'CreateUser',
  payload: { name: 'John', email: 'john@example.com' },
};

const createTestEvent = (): TestEvent => ({
  type: 'UserCreated' as const,
  data: { name: 'John', email: 'john@example.com' },
});

// ============================================================================
// Mock Router Implementation
// ============================================================================

const createMockRouter = (
  handlers: ReadonlyMap<string, CommandHandler<TestEvent>> = new Map()
): CommandRouter<TestEvent> => ({
  route: (command: Readonly<WireCommand>) => {
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

const successHandler: CommandHandler<TestEvent> = {
  execute: () => Effect.succeed([createTestEvent()]),
};

const failingHandler: CommandHandler<TestEvent> = {
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

const testLayer = Layer.effect(
  TestEventStore,
  pipe(InMemoryStore.make<TestEvent>(), Effect.flatMap(makeInMemoryEventStore))
);

// ============================================================================
// Tests
// ============================================================================

describe('Command Processing Service', () => {
  it.effect('should have processCommand method', () => {
    const router = createMockRouter();

    return pipe(
      router,
      createCommandProcessingService(TestEventStore),
      Effect.map((service) => {
        expect(typeof service.processCommand).toBe('function');
      }),
      Effect.provide(testLayer)
    );
  });

  it.effect('should process command successfully', () => {
    const handlers = new Map([['user:CreateUser', successHandler]]);
    const router = createMockRouter(handlers);

    return pipe(
      router,
      createCommandProcessingService(TestEventStore),
      Effect.flatMap((service) => service.processCommand(testCommand)),
      Effect.map((result) => {
        if (isCommandSuccess(result)) {
          expect(result.position).toBeDefined();
        } else {
          expect(true).toBe(false);
        }
      }),
      Effect.provide(testLayer)
    );
  });

  it.effect('should store events in EventStore', () => {
    const handlers = new Map([['user:CreateUser', successHandler]]);
    const router = createMockRouter(handlers);

    const collectEventsFromStream =
      (eventStore: EventStore<TestEvent>) =>
      (startPosition: {
        readonly streamId: string & Brand.Brand<'EventStreamId'>;
        readonly eventNumber: number;
      }) =>
        pipe(
          startPosition,
          eventStore.read,
          Stream.runCollect,
          Effect.map((eventArray) => {
            expect(eventArray).toHaveLength(1);
          })
        );

    const readEventsFromStore = (eventStore: EventStore<TestEvent>) =>
      pipe(
        'user',
        toStreamId,
        Effect.flatMap(beginning),
        Effect.flatMap(collectEventsFromStream(eventStore))
      );

    const processCommandAndReadEvents =
      (service: {
        readonly processCommand: (
          command: Readonly<WireCommand>
        ) => Effect.Effect<CommandResult, CommandProcessingError, never>;
      }) =>
      (eventStore: EventStore<TestEvent>) =>
        pipe(testCommand, service.processCommand, Effect.andThen(readEventsFromStore(eventStore)));

    const processCommandAndVerify = (service: {
      readonly processCommand: (
        command: Readonly<WireCommand>
      ) => Effect.Effect<CommandResult, CommandProcessingError, never>;
    }) => pipe(TestEventStore, Effect.flatMap(processCommandAndReadEvents(service)));

    return pipe(
      router,
      createCommandProcessingService(TestEventStore),
      Effect.flatMap(processCommandAndVerify),
      Effect.provide(testLayer)
    );
  });

  it.effect('should handle routing failures', () => {
    const router = createMockRouter();

    return pipe(
      router,
      createCommandProcessingService(TestEventStore),
      Effect.flatMap((service) => service.processCommand(testCommand)),
      Effect.map((result) => {
        if (isCommandFailure(result)) {
          if (isUnknownError(result.error)) {
            expect(result.error.message).toContain('No handler found');
          } else {
            expect(true).toBe(false);
          }
        } else {
          expect(true).toBe(false);
        }
      }),
      Effect.provide(testLayer)
    );
  });

  it.effect('should handle handler execution failures', () => {
    const handlers = new Map([['user:CreateUser', failingHandler]]);
    const router = createMockRouter(handlers);

    return pipe(
      router,
      createCommandProcessingService(TestEventStore),
      Effect.flatMap((service) => service.processCommand(testCommand)),
      Effect.map((result) => {
        if (isCommandFailure(result)) {
          if (isUnknownError(result.error)) {
            expect(result.error.message).toContain('Handler execution failed');
          } else {
            expect(true).toBe(false);
          }
        } else {
          expect(true).toBe(false);
        }
      }),
      Effect.provide(testLayer)
    );
  });

  it.effect('should route commands to correct handlers', () => {
    let handlerCalled = false;
    const testHandler: CommandHandler<TestEvent> = {
      execute: () => {
        handlerCalled = true;
        return Effect.succeed([createTestEvent()]);
      },
    };

    const handlers = new Map([['user:CreateUser', testHandler]]);
    const router = createMockRouter(handlers);

    return pipe(
      router,
      createCommandProcessingService(TestEventStore),
      Effect.flatMap((service) => service.processCommand(testCommand)),
      Effect.tap(() => {
        expect(handlerCalled).toBe(true);
      }),
      Effect.provide(testLayer)
    );
  });

  it.effect('should support multiple command handlers', () => {
    const updateUserHandler: CommandHandler<TestEvent> = {
      execute: () => Effect.succeed([createTestEvent()]),
    };

    const createOrderHandler: CommandHandler<TestEvent> = {
      execute: () =>
        Effect.succeed([{ type: 'OrderCreated' as const, data: { orderId: 'order-1' } }]),
    };

    const handlers = new Map([
      ['user:CreateUser', successHandler],
      ['user:UpdateUser', updateUserHandler],
      ['order:CreateOrder', createOrderHandler],
    ]);
    const router = createMockRouter(handlers);

    const orderCommand: WireCommand = {
      ...testCommand,
      id: 'cmd-order-123',
      target: 'order',
      name: 'CreateOrder',
    };

    const updateCommand: WireCommand = {
      ...testCommand,
      id: 'cmd-update-123',
      target: 'nonexistent',
      name: 'NonExistentCommand',
    };

    const testCommands = [testCommand, orderCommand, updateCommand] as const;

    const processAllCommands = (service: {
      readonly processCommand: (
        command: Readonly<WireCommand>
      ) => Effect.Effect<CommandResult, CommandProcessingError, never>;
    }) => Effect.all(testCommands.map(service.processCommand));

    return pipe(
      router,
      createCommandProcessingService(TestEventStore),
      Effect.flatMap(processAllCommands),
      Effect.map(([userResult, orderResult, updateResult]) => {
        expect(isCommandSuccess(userResult!)).toBe(true);
        expect(isCommandSuccess(orderResult!)).toBe(true);
        expect(isCommandFailure(updateResult!)).toBe(true);
      }),
      Effect.provide(testLayer)
    );
  });

  it.effect('should work as Effect service', () => {
    const handlers = new Map([['user:CreateUser', successHandler]]);
    const router = createMockRouter(handlers);
    /* eslint-disable effect/no-intermediate-effect-variables -- Effect and Layer variables needed to avoid nested pipes */
    const serviceEffect = pipe(router, createCommandProcessingService(TestEventStore));
    const ServiceLayer = Layer.effect(CommandProcessingService, serviceEffect);
    /* eslint-enable effect/no-intermediate-effect-variables -- Re-enable rule after Layer creation */

    return pipe(
      CommandProcessingService,
      Effect.flatMap((service) => service.processCommand(testCommand)),
      Effect.map((result) => {
        expect(isCommandSuccess(result)).toBe(true);
      }),
      Effect.provide(ServiceLayer),
      Effect.provide(testLayer)
    );
  });
});
