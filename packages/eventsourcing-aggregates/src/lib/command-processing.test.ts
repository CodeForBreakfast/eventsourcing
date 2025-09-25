import { Effect, Layer, pipe, Stream } from 'effect';
import { describe, expect, it } from '@codeforbreakfast/buntest';
import {
  EventStreamPosition,
  EventStoreService,
  beginning,
  toStreamId,
  Event,
} from '@codeforbreakfast/eventsourcing-store';
import {
  makeInMemoryEventStore,
  makeInMemoryStore,
} from '@codeforbreakfast/eventsourcing-store-inmemory';
import { Command } from '@codeforbreakfast/eventsourcing-commands';
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
  execute: () => Effect.succeed([createTestEvent('user-1', 1)]),
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

// ============================================================================
// Tests
// ============================================================================

describe('Command Processing Service', () => {
  it.effect('should have processCommand method', () => {
    const router = createMockRouter();

    return pipe(
      createCommandProcessingService(router),
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
      createCommandProcessingService(router),
      Effect.flatMap((service) => service.processCommand(testCommand)),
      Effect.map((result) => {
        expect(result._tag).toBe('Success');
        if (result._tag === 'Success') {
          expect(result.position).toBeDefined();
        }
      }),
      Effect.provide(testLayer)
    );
  });

  it.effect('should store events in EventStore', () => {
    const handlers = new Map([['user:CreateUser', successHandler]]);
    const router = createMockRouter(handlers);

    return pipe(
      createCommandProcessingService(router),
      Effect.flatMap((service) =>
        pipe(
          EventStoreService,
          Effect.flatMap((eventStore) =>
            pipe(
              service.processCommand(testCommand),
              Effect.flatMap(() =>
                pipe(
                  toStreamId('user-1'),
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
        )
      ),
      Effect.provide(testLayer)
    );
  });

  it.effect('should handle routing failures', () => {
    const router = createMockRouter();

    return pipe(
      createCommandProcessingService(router),
      Effect.flatMap((service) => service.processCommand(testCommand)),
      Effect.map((result) => {
        expect(result._tag).toBe('Failure');
        if (result._tag === 'Failure') {
          expect(result.error).toContain('No handler found');
        }
      }),
      Effect.provide(testLayer)
    );
  });

  it.effect('should handle handler execution failures', () => {
    const handlers = new Map([['user:CreateUser', failingHandler]]);
    const router = createMockRouter(handlers);

    return pipe(
      createCommandProcessingService(router),
      Effect.flatMap((service) => service.processCommand(testCommand)),
      Effect.map((result) => {
        expect(result._tag).toBe('Failure');
        if (result._tag === 'Failure') {
          expect(result.error).toContain('Handler execution failed');
        }
      }),
      Effect.provide(testLayer)
    );
  });

  it.effect('should route commands to correct handlers', () => {
    let handlerCalled = false;
    const testHandler: CommandHandler = {
      execute: () => {
        handlerCalled = true;
        return Effect.succeed([createTestEvent('user', 1)]);
      },
    };

    const handlers = new Map([['user:CreateUser', testHandler]]);
    const router = createMockRouter(handlers);

    return pipe(
      createCommandProcessingService(router),
      Effect.flatMap((service) => service.processCommand(testCommand)),
      Effect.map(() => {
        expect(handlerCalled).toBe(true);
      }),
      Effect.provide(testLayer)
    );
  });

  it.effect('should support multiple command handlers', () => {
    const updateUserHandler: CommandHandler = {
      execute: () => Effect.succeed([createTestEvent('user-2', 1)]),
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
      target: 'nonexistent',
      name: 'NonExistentCommand',
    };

    const testCommands = [testCommand, orderCommand, updateCommand];

    return pipe(
      createCommandProcessingService(router),
      Effect.flatMap((service) =>
        pipe(
          Effect.all(testCommands.map((cmd) => service.processCommand(cmd))),
          Effect.map((results) => results)
        )
      ),
      Effect.map(([userResult, orderResult, updateResult]) => {
        expect(userResult._tag).toBe('Success');
        expect(orderResult._tag).toBe('Success');
        expect(updateResult._tag).toBe('Failure');
      }),
      Effect.provide(testLayer)
    );
  });

  it.effect('should work as Effect service', () => {
    const handlers = new Map([['user:CreateUser', successHandler]]);
    const router = createMockRouter(handlers);

    const ServiceLayer = Layer.effect(
      CommandProcessingService,
      createCommandProcessingService(router)
    );

    return pipe(
      CommandProcessingService,
      Effect.flatMap((service) => service.processCommand(testCommand)),
      Effect.map((result) => {
        expect(result._tag).toBe('Success');
      }),
      Effect.provide(ServiceLayer),
      Effect.provide(testLayer)
    );
  });
});
