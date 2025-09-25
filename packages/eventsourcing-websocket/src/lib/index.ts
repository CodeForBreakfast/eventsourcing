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
} from '@codeforbreakfast/eventsourcing-protocol';
import type { TransportError, ConnectionError } from '@codeforbreakfast/eventsourcing-transport';
import type { Scope } from 'effect/Scope';

/**
 * Connect to a WebSocket event sourcing server
 */
export const connect = (
  url: string
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
 * Make WebSocket protocol layer
 */
export const makeWebSocketProtocolLayer = (
  url: string
): Layer.Layer<Protocol, TransportError | ConnectionError, Scope> => {
  return pipe(
    WebSocketConnector.connect(url),
    Effect.map((transport) => ProtocolLive(transport)),
    Layer.unwrapScoped
  );
};
