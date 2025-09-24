import { Effect, Layer, pipe, Stream } from 'effect';
import { describe, expect, it } from 'bun:test';
import {
  EventStreamPosition,
  EventStoreService,
  makeInMemoryEventStore,
  makeInMemoryStore,
  beginning,
  toStreamId,
} from '@codeforbreakfast/eventsourcing-store';
import { Command, Event } from '@codeforbreakfast/eventsourcing-protocol-default';
import { CommandProcessingError, CommandRoutingError } from './commandProcessingErrors';
import { CommandProcessingService } from './commandProcessingService';
import { CommandHandler, CommandRouter } from './commandHandling';
import { createCommandProcessingService } from './commandProcessingFactory';

// ============================================================================
// Test Implementation
// ============================================================================

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
  position: { streamId, eventNumber } as EventStreamPosition,
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

const testLayer = Layer.effect(
  EventStoreService,
  pipe(makeInMemoryStore<unknown>(), Effect.flatMap(makeInMemoryEventStore))
);

const runTest = <A, E>(effect: Effect.Effect<A, E, EventStoreService>): Promise<A> =>
  Effect.runPromise(pipe(effect, Effect.provide(testLayer)));

// ============================================================================
// Tests
// ============================================================================

describe('Command Processing Service', () => {
  describe('Interface', () => {
    it('should have processCommand method', async () => {
      const router = createMockRouter();

      const program = pipe(
        createCommandProcessingService(router),
        Effect.map((service) => {
          expect(typeof service.processCommand).toBe('function');
        })
      );

      await runTest(program);
    });
  });

  describe('Success Path', () => {
    it('should process command successfully', async () => {
      const handlers = new Map([['user:CreateUser', successHandler]]);
      const router = createMockRouter(handlers);

      const program = pipe(
        createCommandProcessingService(router),
        Effect.flatMap((service) => service.processCommand(testCommand)),
        Effect.map((result) => {
          expect(result._tag).toBe('Success');
          if (result._tag === 'Success') {
            expect(result.position).toBeDefined();
          }
        })
      );

      await runTest(program);
    });

    it('should store events in EventStore', async () => {
      const handlers = new Map([['user:CreateUser', successHandler]]);
      const router = createMockRouter(handlers);

      const program = pipe(
        Effect.all([createCommandProcessingService(router), EventStoreService]),
        Effect.flatMap(([service, eventStore]) =>
          pipe(
            service.processCommand(testCommand),
            Effect.flatMap(() =>
              pipe(
                toStreamId('user'),
                Effect.flatMap(beginning),
                Effect.flatMap((startPosition) =>
                  pipe(
                    eventStore.read(startPosition),
                    Stream.runCollect,
                    Effect.map((eventArray) => {
                      expect(eventArray).toHaveLength(1);
                    })
                  )
                )
              )
            )
          )
        )
      );

      await runTest(program);
    });
  });

  describe('Failure Paths', () => {
    it('should handle routing failures', async () => {
      const router = createMockRouter();

      const program = pipe(
        createCommandProcessingService(router),
        Effect.flatMap((service) => service.processCommand(testCommand)),
        Effect.map((result) => {
          expect(result._tag).toBe('Failure');
          if (result._tag === 'Failure') {
            expect(result.error).toContain('No handler found');
          }
        })
      );

      await runTest(program);
    });

    it('should handle handler execution failures', async () => {
      const handlers = new Map([['user:CreateUser', failingHandler]]);
      const router = createMockRouter(handlers);

      const program = pipe(
        createCommandProcessingService(router),
        Effect.flatMap((service) => service.processCommand(testCommand)),
        Effect.map((result) => {
          expect(result._tag).toBe('Failure');
          if (result._tag === 'Failure') {
            expect(result.error).toContain('Handler execution failed');
          }
        })
      );

      await runTest(program);
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

      const program = pipe(
        createCommandProcessingService(router),
        Effect.flatMap((service) => service.processCommand(testCommand)),
        Effect.map(() => {
          expect(handlerCalled).toBe(true);
        })
      );

      await runTest(program);
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

      const orderCommand: Command = {
        ...testCommand,
        id: 'cmd-order-123',
        target: 'order',
        name: 'CreateOrder',
      };

      const updateCommand: Command = {
        ...testCommand,
        id: 'cmd-update-123',
        target: 'user2',
        name: 'UpdateUser',
      };

      const program = pipe(
        createCommandProcessingService(router),
        Effect.flatMap((service) =>
          pipe(
            Effect.all([
              service.processCommand(testCommand),
              service.processCommand(orderCommand),
              service.processCommand(updateCommand),
            ]),
            Effect.map(([userResult, orderResult, updateResult]) => {
              expect(userResult._tag).toBe('Success');
              expect(orderResult._tag).toBe('Success');
              expect(updateResult._tag).toBe('Failure');
            })
          )
        )
      );

      await runTest(program);
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

      const program = pipe(
        CommandProcessingService,
        Effect.flatMap((service) => service.processCommand(testCommand)),
        Effect.map((result) => {
          expect(result._tag).toBe('Success');
        })
      );

      await Effect.runPromise(
        pipe(program, Effect.provide(ServiceLayer), Effect.provide(testLayer))
      );
    });
  });
});
