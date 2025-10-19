import { Effect, Context, Chunk, pipe, Layer } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import type { EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import type { AggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';
import type {
  ServerError,
  AggregateConfig,
  CommandDispatcherService,
  EventBusService,
  DomainEvent,
} from './types';
import { EventBus } from './eventBus';

/**
 * Command Dispatcher service tag
 */
export class CommandDispatcher extends Context.Tag('CommandDispatcher')<
  CommandDispatcher,
  CommandDispatcherService<unknown>
>() {}

/**
 * Convert PascalCase command name to camelCase method name
 *
 * Examples:
 * - "CreateTodo" → "createTodo"
 * - "UpdateUserProfile" → "updateUserProfile"
 * - "DeleteItem" → "deleteItem"
 *
 * @internal
 */
const toCamelCase = (pascalCase: string): string => {
  if (pascalCase.length === 0) return pascalCase;
  return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
};

/**
 * Find the aggregate root that should handle this command
 *
 * Matching logic:
 * Check each aggregate's commands object for a method matching the camelCase command name
 *
 * @internal
 */
const findAggregateForCommand = <TEvent extends Record<string, unknown>, TMetadata>(
  command: ReadonlyDeep<WireCommand>,
  aggregates: ReadonlyArray<AggregateConfig<TEvent, TMetadata>>
): Effect.Effect<
  AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, unknown>,
  ServerError
> => {
  const methodName = toCamelCase(command.name);

  for (const config of aggregates) {
    const root = config.root;
    const commands = root.commands as Record<string, unknown>;
    if (methodName in commands && typeof commands[methodName] === 'function') {
      return Effect.succeed(
        root as AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, unknown>
      );
    }
  }

  return Effect.fail(
    new (class extends Error {
      readonly _tag = 'ServerError';
      constructor(
        readonly operation: string,
        readonly reason: string,
        readonly cause?: unknown
      ) {
        super(`${operation} failed: ${reason}`);
        this.name = 'ServerError';
      }
    })(
      'findAggregate',
      `No aggregate found with command method "${methodName}" for command "${command.name}"`
    ) as ServerError
  );
};

/**
 * Execute a command method on an aggregate
 *
 * @internal
 */
const executeAggregateCommand = <TEvent extends Record<string, unknown>, TMetadata>(
  aggregate: AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, unknown>,
  command: ReadonlyDeep<WireCommand>
): Effect.Effect<ReadonlyArray<TEvent>, ServerError> => {
  const methodName = toCamelCase(command.name);
  const commandMethod = aggregate.commands[methodName];

  if (typeof commandMethod !== 'function') {
    return Effect.fail(
      new (class extends Error {
        readonly _tag = 'ServerError';
        constructor(
          readonly operation: string,
          readonly reason: string,
          readonly cause?: unknown
        ) {
          super(`${operation} failed: ${reason}`);
          this.name = 'ServerError';
        }
      })('executeCommand', `Command method "${methodName}" is not a function`) as ServerError
    );
  }

  return pipe(
    Effect.try({
      try: () => commandMethod(command.target, command.payload),
      catch: (error) =>
        new (class extends Error {
          readonly _tag = 'ServerError';
          constructor(
            readonly operation: string,
            readonly reason: string,
            readonly cause?: unknown
          ) {
            super(`${operation} failed: ${reason}`);
            this.name = 'ServerError';
          }
        })('executeCommand', `Command execution failed: ${String(error)}`, error) as ServerError,
    }),
    Effect.flatMap((result) => {
      // The result should be Effect<ReadonlyArray<TEvent>, Error>
      if (Effect.isEffect(result)) {
        return result as Effect.Effect<ReadonlyArray<TEvent>, Error>;
      }
      return Effect.fail(
        new (class extends Error {
          readonly _tag = 'ServerError';
          constructor(
            readonly operation: string,
            readonly reason: string,
            readonly cause?: unknown
          ) {
            super(`${operation} failed: ${reason}`);
            this.name = 'ServerError';
          }
        })(
          'executeCommand',
          `Command method must return an Effect, got ${typeof result}`
        ) as ServerError
      );
    }),
    Effect.mapError(
      (error): ServerError =>
        new (class extends Error {
          readonly _tag = 'ServerError';
          constructor(
            readonly operation: string,
            readonly reason: string,
            readonly cause?: unknown
          ) {
            super(`${operation} failed: ${reason}`);
            this.name = 'ServerError';
          }
        })('executeCommand', `Command execution failed: ${String(error)}`, error) as ServerError
    )
  );
};

const publishEventsToEventBus = <TEvent extends Record<string, unknown>>(
  events: ReadonlyArray<TEvent>,
  streamId: string,
  baseEventNumber: number,
  eventBus: EventBusService
) =>
  Effect.forEach(events, (event, index) =>
    eventBus.publish({
      streamId,
      event,
      position: baseEventNumber + index,
    } as DomainEvent)
  );

const publishEventsAndReturnSuccess = <TEvent extends Record<string, unknown>>(
  events: ReadonlyArray<TEvent>,
  streamId: string,
  baseEventNumber: number,
  eventBus: EventBusService
) =>
  pipe(
    publishEventsToEventBus(events, streamId, baseEventNumber, eventBus),
    Effect.asVoid,
    Effect.as({
      _tag: 'Success' as const,
      position: {
        streamId: streamId as EventStreamId,
        eventNumber: baseEventNumber + events.length,
      },
    })
  );

const commitEventsAndPublish = <TEvent extends Record<string, unknown>, TMetadata>(
  aggregate: AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, unknown>,
  command: ReadonlyDeep<WireCommand>,
  events: ReadonlyArray<TEvent>,
  state: { readonly nextEventNumber: number },
  eventBus: EventBusService
) =>
  pipe(
    aggregate.commit({
      id: command.target,
      eventNumber: state.nextEventNumber,
      events: Chunk.fromIterable(events),
    }),
    Effect.mapError(
      (error): ServerError =>
        new (class extends Error {
          readonly _tag = 'ServerError';
          constructor(
            readonly operation: string,
            readonly reason: string,
            readonly cause?: unknown
          ) {
            super(`${operation} failed: ${reason}`);
            this.name = 'ServerError';
          }
        })('commitEvents', `Failed to commit events: ${String(error)}`, error) as ServerError
    ),
    Effect.andThen(
      publishEventsAndReturnSuccess(events, command.target, state.nextEventNumber, eventBus)
    )
  );

const executeCommandAndCommit = <TEvent extends Record<string, unknown>, TMetadata>(
  aggregate: AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, unknown>,
  command: ReadonlyDeep<WireCommand>,
  state: { readonly nextEventNumber: number },
  eventBus: EventBusService
) =>
  pipe(
    executeAggregateCommand(aggregate, command),
    Effect.flatMap((events) => commitEventsAndPublish(aggregate, command, events, state, eventBus))
  );

/**
 * Load aggregate state, execute command, commit events, publish to event bus
 *
 * This is the core pipeline: Load → Execute → Commit → Publish
 *
 * @internal
 */
const processCommand = <TEvent extends Record<string, unknown>, TMetadata>(
  aggregate: AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, unknown>,
  command: ReadonlyDeep<WireCommand>,
  eventBus: EventBusService
) =>
  pipe(
    aggregate.load(command.target),
    Effect.mapError(
      (error): ServerError =>
        new (class extends Error {
          readonly _tag = 'ServerError';
          constructor(
            readonly operation: string,
            readonly reason: string,
            readonly cause?: unknown
          ) {
            super(`${operation} failed: ${reason}`);
            this.name = 'ServerError';
          }
        })(
          'loadAggregate',
          `Failed to load aggregate ${command.target}: ${String(error)}`,
          error
        ) as ServerError
    ),
    Effect.flatMap((state) => executeCommandAndCommit(aggregate, command, state, eventBus)),
    Effect.catchAll(
      (error): Effect.Effect<CommandResult, never> =>
        Effect.succeed<CommandResult>({
          _tag: 'Failure' as const,
          error: {
            _tag: 'ExecutionError',
            commandId: command.id,
            commandName: command.name,
            message: 'reason' in error ? error.reason : String(error),
          },
        })
    )
  );

/**
 * Creates a command dispatcher service
 *
 * @example
 * ```typescript
 * const dispatcher = makeCommandDispatcher({
 *   aggregates: [TodoAggregateRoot, UserAggregateRoot],
 * });
 *
 * const program = pipe(
 *   dispatcher,
 *   Effect.flatMap((service) =>
 *     service.dispatch({
 *       id: 'cmd-1',
 *       name: 'CreateTodo',
 *       target: 'todo-123',
 *       payload: { title: 'Buy milk' }
 *     })
 *   ),
 *   Effect.provide(EventBusLive())
 * );
 * ```
 */
const dispatchCommandToAggregate = <TEvent extends Record<string, unknown>, TMetadata>(
  command: ReadonlyDeep<WireCommand>,
  aggregates: ReadonlyArray<AggregateConfig<TEvent, TMetadata>>,
  eventBus: EventBusService
): Effect.Effect<CommandResult, never, unknown> =>
  pipe(
    findAggregateForCommand<TEvent, TMetadata>(command, aggregates),
    Effect.flatMap((aggregate) => processCommand(aggregate, command, eventBus)),
    Effect.catchAll(
      (): Effect.Effect<CommandResult, never> =>
        Effect.succeed<CommandResult>({
          _tag: 'Failure' as const,
          error: {
            _tag: 'HandlerNotFound',
            commandId: command.id,
            commandName: command.name,
            availableHandlers: [],
          },
        })
    )
  );

export const makeCommandDispatcher = <TEvent extends Record<string, unknown>, TMetadata>(config: {
  readonly aggregates: ReadonlyArray<AggregateConfig<TEvent, TMetadata>>;
}): Effect.Effect<CommandDispatcherService<unknown>, never, EventBus> =>
  pipe(
    EventBus,
    Effect.map(
      (eventBus): CommandDispatcherService<unknown> => ({
        dispatch: (command: ReadonlyDeep<WireCommand>) =>
          dispatchCommandToAggregate<TEvent, TMetadata>(command, config.aggregates, eventBus),
      })
    )
  );

/**
 * Creates a Layer for CommandDispatcher service
 */
export const CommandDispatcherLive = <TEvent extends Record<string, unknown>, TMetadata>(config: {
  readonly aggregates: ReadonlyArray<AggregateConfig<TEvent, TMetadata>>;
}) => Layer.effect(CommandDispatcher, makeCommandDispatcher<TEvent, TMetadata>(config));
