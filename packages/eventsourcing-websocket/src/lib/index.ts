/**
 * @codeforbreakfast/eventsourcing-websocket
 *
 * Batteries-included WebSocket event sourcing package.
 * Combines WebSocket transport with default protocol for rapid development.
 */

import { Effect, Layer, pipe } from 'effect';
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import {
  Protocol,
  ProtocolLive,
  type ProtocolService,
} from '@codeforbreakfast/eventsourcing-protocol-default';
import type {
  TransportError,
  ConnectionError,
} from '@codeforbreakfast/eventsourcing-transport-contracts';
import type { Scope } from 'effect/Scope';

export const DefaultWebSocketConfig = {
  reconnectAttempts: 3,
  reconnectDelayMs: 1000,
} as const;

export interface WebSocketConnectOptions {
  readonly config?: Partial<typeof DefaultWebSocketConfig>;
}

/**
 * Connect to a WebSocket event sourcing server
 */
export const connect = (
  url: string,
  _options?: WebSocketConnectOptions
): Effect.Effect<ProtocolService, TransportError | ConnectionError, Protocol | Scope> => {
  // Create the layer stack
  const protocolLayer = pipe(
    WebSocketConnector.connect(url),
    Effect.map((transport) => ProtocolLive(transport)),
    Layer.unwrapScoped
  );

  // Return protocol service that depends on the layer
  return pipe(
    Effect.Do,
    Effect.bind('_', () => Layer.build(protocolLayer)),
    Effect.bind('protocol', () => Protocol),
    Effect.map(({ protocol }) => protocol)
  );
};

/**
 * Create protocol stack as layer
 */
export const createWebSocketProtocolStack = (
  url: string
): Layer.Layer<Protocol, TransportError | ConnectionError, Scope> => {
  return pipe(
    WebSocketConnector.connect(url),
    Effect.map((transport) => ProtocolLive(transport)),
    Layer.unwrapScoped
  );
};

/**
 * Create protocol connector layer (alias for createWebSocketProtocolStack)
 */
export const createWebSocketConnectorLayer = (url: string) => createWebSocketProtocolStack(url);

export const WebSocketEventSourcingInfo = {
  name: '@codeforbreakfast/eventsourcing-websocket',
  description: 'Batteries-included WebSocket event sourcing package',
  version: '0.1.0',
} as const;
