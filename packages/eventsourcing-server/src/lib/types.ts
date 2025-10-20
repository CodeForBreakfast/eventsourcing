import { Effect, Context, Stream, Scope, Data } from 'effect';
import type { ReadonlyDeep } from 'type-fest';
import { WireCommand, CommandResult } from '@codeforbreakfast/eventsourcing-commands';
import { EventStreamId } from '@codeforbreakfast/eventsourcing-store';
import type { AggregateRoot } from '@codeforbreakfast/eventsourcing-aggregates';

/**
 * Error types for server operations
 */
export class ServerError extends Data.TaggedError('ServerError')<{
  readonly operation: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * Domain event with stream context
 * This is the internal representation after events are committed
 */
export interface DomainEvent<TEvent = unknown> {
  readonly streamId: string;
  readonly event: TEvent;
  readonly position: number;
}

/**
 * Configuration for a single aggregate root
 * Supports both simple and advanced configurations
 */
export type AggregateConfig<
  TEvent extends Record<string, unknown> = Record<string, unknown>,
  TMetadata = unknown,
> =
  | {
      readonly root: AggregateRoot<string, unknown, TEvent, TMetadata, unknown, unknown>;
    }
  | {
      readonly root: AggregateRoot<string, unknown, TEvent, TMetadata, unknown, unknown>;
      readonly eventStoreOverride?: Context.Tag<unknown, unknown>;
    };

/**
 * Configuration for a process manager
 * Process managers react to events and trigger commands
 */
export interface ProcessManagerConfig<
  TEvent = unknown,
  // @ts-expect-error - TMetadata parameter is used by ServerRuntimeConfig but not in this interface body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used by ServerRuntimeConfig
  TMetadata = unknown,
> {
  /** Descriptive name for logging and debugging */
  readonly name: string;

  /** Event type to react to (matches event.type field) */
  readonly on: string;

  /**
   * Command to execute when event occurs
   * Returns an array of events to commit
   */
  readonly execute: (
    event: TEvent,
    context: { readonly streamId: string }
  ) => Effect.Effect<ReadonlyArray<unknown>, Error>;

  /**
   * Target aggregate stream for the command
   * Can be derived from the triggering event
   */
  readonly target: (event: TEvent, context: { readonly streamId: string }) => string;
}

/**
 * Main configuration for the server runtime
 */
export interface ServerRuntimeConfig<
  TEvent extends Record<string, unknown> = Record<string, unknown>,
  TMetadata = unknown,
> {
  /** Aggregate root configurations */
  readonly aggregates: ReadonlyArray<AggregateConfig<TEvent, TMetadata>>;

  /** Optional process managers */
  readonly processManagers?: ReadonlyArray<ProcessManagerConfig<TEvent, TMetadata>>;

  /** Optional command initiator for system-triggered commands */
  readonly systemUser?: TMetadata;
}

/**
 * Event bus service for internal pub/sub
 */
export interface EventBusService<TEvent = unknown> {
  /**
   * Publish an event to all subscribers
   */
  readonly publish: (event: DomainEvent<TEvent>) => Effect.Effect<void, never, never>;

  /**
   * Subscribe to events matching a filter
   * Returns a scoped stream that cleans up on scope closure
   */
  readonly subscribe: <TFilteredEvent extends TEvent>(
    filter: (event: TEvent) => event is TFilteredEvent
  ) => Effect.Effect<Stream.Stream<DomainEvent<TFilteredEvent>, never, never>, never, Scope.Scope>;
}

/**
 * Command dispatcher service
 * Routes commands to appropriate aggregate handlers
 */
export interface CommandDispatcherService<R = never> {
  /**
   * Execute a wire command
   * Returns the command result (success with position or failure with error)
   */
  readonly dispatch: (command: ReadonlyDeep<WireCommand>) => Effect.Effect<CommandResult, never, R>;
}

/**
 * Server runtime interface returned by makeServerRuntime
 */
export interface ServerRuntime<TEvent = unknown> {
  /**
   * Handle ServerProtocol commands and events
   * This is the main entry point that wires everything together
   */
  readonly handleProtocol: (protocol: {
    readonly onWireCommand: Stream.Stream<WireCommand, never, never>;
    readonly sendResult: (
      commandId: string,
      result: ReadonlyDeep<CommandResult>
    ) => Effect.Effect<void, unknown, never>;
    readonly publishEvent: (
      event: ReadonlyDeep<{ readonly streamId: EventStreamId } & Record<string, unknown>>
    ) => Effect.Effect<void, unknown, never>;
  }) => Effect.Effect<never, ServerError, Scope.Scope | unknown>;

  /**
   * Access to the event bus for custom integrations
   */
  readonly eventBus: EventBusService<TEvent>;

  /**
   * For testing: execute commands directly
   */
  readonly executeCommand: (command: WireCommand) => Effect.Effect<CommandResult, never>;
}
