import { Effect, Context, Chunk, pipe, Layer } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import { toStreamId } from '@codeforbreakfast/eventsourcing-store';
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
  CommandDispatcherService<any>
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
  AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, any>,
  ServerError
> => {
  const methodName = toCamelCase(command.name);

  for (const config of aggregates) {
    const root = config.root;
    const commands = root.commands as Record<string, unknown>;
    if (methodName in commands && typeof commands[methodName] === 'function') {
      return Effect.succeed(
        root as AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, any>
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

/**
 * Load aggregate state, execute command, commit events, publish to event bus
 *
 * This is the core pipeline: Load → Execute → Commit → Publish
 *
 * @internal
 */
const processCommand = <TEvent extends Record<string, unknown>, TMetadata>(
  aggregate: AggregateRoot<string, unknown, TEvent, TMetadata, Record<string, unknown>, any>,
  command: ReadonlyDeep<WireCommand>,
  eventBus: EventBusService
) =>
  pipe(
    // 1. Load aggregate state
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
    Effect.flatMap((state) =>
      pipe(
        // 2. Execute command
        executeAggregateCommand(aggregate, command),
        Effect.flatMap((events) =>
          pipe(
            // 3. Commit events
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
                })(
                  'commitEvents',
                  `Failed to commit events: ${String(error)}`,
                  error
                ) as ServerError
            ),
            Effect.andThen(
              // 4. Publish events to event bus
              pipe(
                events,
                Effect.forEach((event, index) =>
                  eventBus.publish({
                    streamId: command.target,
                    event,
                    position: state.nextEventNumber + index,
                  } as DomainEvent)
                ),
                Effect.asVoid
              )
            ),
            Effect.as({
              _tag: 'Success' as const,
              position: {
                streamId: toStreamId(command.target),
                eventNumber: state.nextEventNumber + events.length,
              },
            })
          )
        )
      )
    ),
    Effect.catchAll(
      (error): Effect.Effect<CommandResult, never> =>
        Effect.succeed<CommandResult>({
          _tag: 'Failure' as const,
          error: {
            _tag: 'ExecutionError',
            commandId: command.id,
            commandName: command.name,
            message: error.reason,
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
export const makeCommandDispatcher = <TEvent extends Record<string, unknown>, TMetadata>(config: {
  readonly aggregates: ReadonlyArray<AggregateConfig<TEvent, TMetadata>>;
}): Effect.Effect<CommandDispatcherService<any>, never, EventBus> =>
  pipe(
    EventBus,
    Effect.map(
      (eventBus): CommandDispatcherService<any> => ({
        dispatch: (command: ReadonlyDeep<WireCommand>): Effect.Effect<CommandResult, never, any> =>
          pipe(
            findAggregateForCommand<TEvent, TMetadata>(command, config.aggregates),
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
          ) as Effect.Effect<CommandResult, never, any>,
      })
    )
  );

/**
 * Creates a Layer for CommandDispatcher service
 */
export const CommandDispatcherLive = <TEvent extends Record<string, unknown>, TMetadata>(config: {
  readonly aggregates: ReadonlyArray<AggregateConfig<TEvent, TMetadata>>;
}) => Layer.effect(CommandDispatcher, makeCommandDispatcher<TEvent, TMetadata>(config));
