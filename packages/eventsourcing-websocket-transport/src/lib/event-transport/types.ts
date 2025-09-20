/**
 * WebSocket Event Transport Types
 *
 * Domain-agnostic types for event streaming over WebSocket connections.
 * These types integrate with the existing eventstore infrastructure.
 */

import {
  Effect,
  Stream,
  Data,
  Schema,
  Option,
  HashMap,
  Queue,
  Fiber,
  Array,
  pipe,
} from 'effect';
import type {
  EventStreamId,
  EventStreamPosition,
  EventNumber,
} from '@codeforbreakfast/eventsourcing-store';
import type { WebSocketUrl, ConnectionStatus } from '../types';
import type {
  ConnectedWebSocket,
  ConnectingWebSocket,
} from '../webSocketConnection';
import type { TransportConfig } from './interface';

// ============================================================================
// Error Hierarchy - Specific errors for each failure mode
// ============================================================================

// Legacy error types (kept for backwards compatibility)
export class TransportConnectionError extends Data.TaggedError(
  'TransportConnectionError',
)<
  Readonly<{
    reason: string;
    code?: string;
    url?: WebSocketUrl;
  }>
> {}

export class TransportSubscriptionError extends Data.TaggedError(
  'TransportSubscriptionError',
)<
  Readonly<{
    reason: string;
    streamId?: EventStreamId;
    position?: EventStreamPosition;
  }>
> {}

export class TransportCommandError extends Data.TaggedError(
  'TransportCommandError',
)<
  Readonly<{
    reason: string;
    command?: unknown;
    aggregateId?: string;
  }>
> {}

// New improved error types
export class NetworkError extends Data.TaggedError('NetworkError')<
  Readonly<{
    url: WebSocketUrl;
    code?: string;
    retriable: boolean;
  }>
> {}

export class ProtocolError extends Data.TaggedError('ProtocolError')<
  Readonly<{
    message: string;
    received: unknown;
  }>
> {}

export class SubscriptionError extends Data.TaggedError('SubscriptionError')<
  Readonly<{
    streamId: EventStreamId;
    reason: 'not-found' | 'unauthorized' | 'invalid-position';
    position?: EventStreamPosition;
  }>
> {}

export class CommandError extends Data.TaggedError('CommandError')<
  Readonly<{
    aggregateId: string;
    commandName: string;
    reason: 'timeout' | 'rejected' | 'invalid';
    details?: string;
  }>
> {}

export type TransportError =
  | NetworkError
  | ProtocolError
  | SubscriptionError
  | CommandError;

// Event wrapper that includes stream metadata
export interface StreamEvent<T> {
  readonly streamId: EventStreamId;
  readonly eventNumber: EventNumber;
  readonly position: EventStreamPosition;
  readonly event: T;
  readonly timestamp: Date;
}

// Command structure for sending to aggregates
export interface AggregateCommand<T = unknown> {
  readonly aggregateId: string;
  readonly aggregateName: string;
  readonly commandName: string;
  readonly payload: T;
  readonly metadata?: Record<string, unknown>;
}

// Command result from aggregate
export interface CommandResult<T = unknown> {
  readonly success: boolean;
  readonly result?: T;
  readonly error?: string;
  readonly position?: EventStreamPosition;
}

// Subscription options
export interface SubscriptionOptions {
  readonly fromPosition?: EventStreamPosition;
  readonly fromEnd?: boolean;
  readonly bufferSize?: number;
}

// Multi-stream subscription request
export interface StreamSubscription {
  readonly streamId: EventStreamId;
  readonly options?: SubscriptionOptions;
}

/**
 * WebSocket Event Transport Interface
 *
 * Provides domain-agnostic event streaming capabilities over WebSocket.
 * Designed to work with any event-sourced system using the eventstore infrastructure.
 */
export interface WebSocketEventTransport<TEvent = unknown> {
  /**
   * Connect to the WebSocket endpoint
   * @param url - The WebSocket URL to connect to
   * @returns Effect that completes when connected
   */
  readonly connect: (
    url: WebSocketUrl,
  ) => Effect.Effect<void, TransportConnectionError>;

  /**
   * Disconnect from the WebSocket
   * @returns Effect that completes when disconnected
   */
  readonly disconnect: () => Effect.Effect<void, TransportConnectionError>;

  /**
   * Subscribe to a single event stream
   * @param streamId - The ID of the stream to subscribe to
   * @param options - Subscription options (position, buffer size, etc.)
   * @returns Stream of events from the subscribed stream
   */
  readonly subscribeToStream: (
    streamId: EventStreamId,
    options?: SubscriptionOptions,
  ) => Stream.Stream<StreamEvent<TEvent>, TransportSubscriptionError>;

  /**
   * Subscribe to multiple event streams
   * @param subscriptions - Array of stream subscriptions
   * @returns Stream of events from all subscribed streams
   */
  readonly subscribeToStreams: (
    subscriptions: Readonly<Array<StreamSubscription>>,
  ) => Stream.Stream<StreamEvent<TEvent>, TransportSubscriptionError>;

  /**
   * Send a command to an aggregate
   * @param command - The command to send
   * @returns Effect with the command result
   */
  readonly sendCommand: <TPayload, TResult>(
    command: AggregateCommand<TPayload>,
  ) => Effect.Effect<CommandResult<TResult>, TransportCommandError>;

  /**
   * Get the current connection status
   * @returns Stream of connection status updates
   */
  readonly connectionStatus: () => Stream.Stream<ConnectionStatus, never>;

  /**
   * Check if currently connected
   * @returns Effect with boolean indicating connection state
   */
  readonly isConnected: () => Effect.Effect<boolean>;
}

// Protocol messages for WebSocket communication
export const ProtocolMessageSchema = Schema.Union(
  // Client -> Server messages
  Schema.Struct({
    type: Schema.Literal('subscribe'),
    streamId: Schema.String,
    position: Schema.optional(Schema.Number),
    fromEnd: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({
    type: Schema.Literal('unsubscribe'),
    streamId: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('command'),
    id: Schema.String,
    aggregateId: Schema.String,
    aggregateName: Schema.String,
    commandName: Schema.String,
    payload: Schema.Unknown,
    metadata: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.Unknown }),
    ),
  }),
  // Server -> Client messages
  Schema.Struct({
    type: Schema.Literal('event'),
    streamId: Schema.String,
    eventNumber: Schema.Number,
    event: Schema.Unknown,
    timestamp: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('subscribed'),
    streamId: Schema.String,
    position: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal('unsubscribed'),
    streamId: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('command_result'),
    id: Schema.String,
    success: Schema.Boolean,
    result: Schema.optional(Schema.Unknown),
    error: Schema.optional(Schema.String),
    position: Schema.optional(Schema.Number),
  }),
  Schema.Struct({
    type: Schema.Literal('error'),
    code: Schema.String,
    message: Schema.String,
    details: Schema.optional(Schema.Unknown),
  }),
);

export type ProtocolMessage = Schema.Schema.Type<typeof ProtocolMessageSchema>;

// Helper type guards for protocol messages
export const isEventMessage = (
  msg: ProtocolMessage,
): msg is Extract<ProtocolMessage, { type: 'event' }> => msg.type === 'event';

export const isCommandResultMessage = (
  msg: ProtocolMessage,
): msg is Extract<ProtocolMessage, { type: 'command_result' }> =>
  msg.type === 'command_result';

export const isErrorMessage = (
  msg: ProtocolMessage,
): msg is Extract<ProtocolMessage, { type: 'error' }> => msg.type === 'error';

export const isSubscribedMessage = (
  msg: ProtocolMessage,
): msg is Extract<ProtocolMessage, { type: 'subscribed' }> =>
  msg.type === 'subscribed';

// ============================================================================
// Subscription State - Clear lifecycle with no invalid combinations
// ============================================================================

export type SubscriptionState<TEvent> =
  | SubscriptionRequested
  | SubscriptionActive<TEvent>
  | SubscriptionFailed;

export interface SubscriptionRequested {
  readonly _tag: 'subscription-requested';
  readonly streamId: EventStreamId;
  readonly startFrom: SubscriptionStartPosition;
  readonly requestedAt: Date;
}

export interface SubscriptionActive<TEvent> {
  readonly _tag: 'subscription-active';
  readonly streamId: EventStreamId;
  readonly currentPosition: EventStreamPosition;
  readonly eventQueue: Queue.Queue<StreamEvent<TEvent>>;
  readonly subscribedAt: Date;
}

export interface SubscriptionFailed {
  readonly _tag: 'subscription-failed';
  readonly streamId: EventStreamId;
  readonly error: SubscriptionError;
  readonly failedAt: Date;
  readonly canRetry: boolean;
}

export type SubscriptionStartPosition =
  | Readonly<{ _tag: 'from-beginning' }>
  | Readonly<{ _tag: 'from-position'; position: EventStreamPosition }>
  | Readonly<{ _tag: 'from-end' }>;

// ============================================================================
// Command State - Track lifecycle of commands
// ============================================================================

export type CommandState<TPayload, TResult> =
  | CommandPending<TPayload, TResult>
  | CommandCompleted<TResult>
  | CommandFailed;

export interface CommandPending<TPayload, TResult = unknown> {
  readonly _tag: 'command-pending';
  readonly id: CommandId;
  readonly command: AggregateCommand<TPayload>;
  readonly sentAt: Date;
  readonly resultQueue: Queue.Queue<CommandResult<TResult>>;
}

export interface CommandCompleted<TResult> {
  readonly _tag: 'command-completed';
  readonly id: CommandId;
  readonly result: CommandResult<TResult>;
  readonly completedAt: Date;
}

export interface CommandFailed {
  readonly _tag: 'command-failed';
  readonly id: CommandId;
  readonly error: CommandError;
  readonly failedAt: Date;
}

export type CommandId = string & Readonly<{ _brand: 'CommandId' }>;

// ============================================================================
// Transport State - Main state machine with clear transitions
// ============================================================================

export type TransportState<TEvent> =
  | TransportDisconnected
  | TransportConnecting
  | TransportConnected<TEvent>
  | TransportReconnecting<TEvent>;

export interface TransportDisconnected {
  readonly _tag: 'transport-disconnected';
  readonly config: Required<TransportConfig>;
  readonly lastDisconnectReason?: DisconnectReason;
}

export interface TransportConnecting {
  readonly _tag: 'transport-connecting';
  readonly config: Required<TransportConfig>;
  readonly connection: ConnectingWebSocket;
  readonly attempt: ReconnectAttempt;
}

export interface TransportConnected<TEvent> {
  readonly _tag: 'transport-connected';
  readonly config: Required<TransportConfig>;
  readonly connection: ConnectedWebSocket;
  readonly subscriptions: HashMap.HashMap<
    EventStreamId,
    SubscriptionState<TEvent>
  >;
  readonly commands: HashMap.HashMap<CommandId, CommandState<unknown, unknown>>;
  readonly receiveLoop: ReceiveLoop;
  readonly connectedAt: Date;
}

export interface TransportReconnecting<TEvent> {
  readonly _tag: 'transport-reconnecting';
  readonly config: Required<TransportConfig>;
  readonly previousSubscriptions: HashMap.HashMap<
    EventStreamId,
    SubscriptionActive<TEvent>
  >;
  readonly pendingCommands: HashMap.HashMap<CommandId, CommandPending<unknown>>;
  readonly attempt: ReconnectAttempt;
  readonly nextRetryAt: Date;
}

export interface ReconnectAttempt {
  readonly count: number;
  readonly firstAttemptAt: Date;
  readonly lastAttemptAt: Date;
}

export interface ReceiveLoop {
  readonly stream: Stream.Stream<string, NetworkError>;
  readonly fiber: Fiber.RuntimeFiber<void, NetworkError>;
}

export interface DisconnectReason {
  readonly code: 'user-requested' | 'error' | 'server-disconnect';
  readonly message?: string;
}

// ============================================================================
// State Transition Functions - Type-safe state machines
// ============================================================================

export const disconnectedToConnecting = (
  state: Readonly<TransportDisconnected>,
  connection: Readonly<ConnectingWebSocket>,
): TransportConnecting => ({
  _tag: 'transport-connecting',
  config: state.config,
  connection,
  attempt: {
    count: 1,
    firstAttemptAt: new Date(),
    lastAttemptAt: new Date(),
  },
});

export const connectingToConnected = <TEvent>(
  state: Readonly<TransportConnecting>,
  connection: Readonly<ConnectedWebSocket>,
  receiveLoop: Readonly<ReceiveLoop>,
): TransportConnected<TEvent> => ({
  _tag: 'transport-connected',
  config: state.config,
  connection,
  subscriptions: HashMap.empty(),
  commands: HashMap.empty(),
  receiveLoop,
  connectedAt: new Date(),
});

export const connectedToReconnecting = <TEvent>(
  state: Readonly<TransportConnected<TEvent>>,
  _reason: Readonly<DisconnectReason>,
): TransportReconnecting<TEvent> => ({
  _tag: 'transport-reconnecting',
  config: state.config,
  previousSubscriptions: pipe(
    state.subscriptions,
    HashMap.filter(
      (sub): sub is SubscriptionActive<TEvent> =>
        sub._tag === 'subscription-active',
    ),
  ),
  pendingCommands: pipe(
    state.commands,
    HashMap.filter(
      (cmd): cmd is CommandPending<unknown> => cmd._tag === 'command-pending',
    ),
  ),
  attempt: {
    count: 1,
    firstAttemptAt: new Date(),
    lastAttemptAt: new Date(),
  },
  nextRetryAt: new Date(Date.now() + state.config.reconnectDelayMs),
});

export const reconnectingToConnecting = (
  state: Readonly<TransportReconnecting<unknown>>,
  connection: Readonly<ConnectingWebSocket>,
): TransportConnecting => ({
  _tag: 'transport-connecting',
  config: state.config,
  connection,
  attempt: {
    ...state.attempt,
    count: state.attempt.count + 1,
    lastAttemptAt: new Date(),
  },
});

export const anyToDisconnected = (
  state: Readonly<TransportState<unknown>>,
  reason: Readonly<DisconnectReason>,
): TransportDisconnected => ({
  _tag: 'transport-disconnected',
  config: state.config,
  lastDisconnectReason: reason,
});

// ============================================================================
// Utility functions for working with states
// ============================================================================

export const isConnected = <TEvent>(
  state: TransportState<TEvent>,
): state is TransportConnected<TEvent> => state._tag === 'transport-connected';

export const canSendCommands = <TEvent>(
  state: TransportState<TEvent>,
): state is TransportConnected<TEvent> => state._tag === 'transport-connected';

export const hasActiveSubscription = <TEvent>(
  state: Readonly<TransportConnected<TEvent>>,
  streamId: EventStreamId,
): boolean => {
  const sub = HashMap.get(state.subscriptions, streamId);
  return Option.isSome(sub) && sub.value._tag === 'subscription-active';
};

export const getActiveSubscriptions = <TEvent>(
  state: Readonly<TransportConnected<TEvent>>,
): ReadonlyArray<SubscriptionActive<TEvent>> =>
  pipe(
    HashMap.values(state.subscriptions),
    (values) => Array.fromIterable(values),
    Array.filter(
      (sub): sub is SubscriptionActive<TEvent> =>
        sub._tag === 'subscription-active',
    ),
  );
