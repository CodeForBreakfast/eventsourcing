/**
 * @codeforbreakfast/eventsourcing-websocket
 *
 * Batteries-included WebSocket event sourcing package.
 * Combines WebSocket transport with default protocol for rapid development.
 */

import { Context, Effect, Layer, pipe } from 'effect';
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import { Protocol, ProtocolLive } from '@codeforbreakfast/eventsourcing-protocol';
import type { TransportError, ConnectionError } from '@codeforbreakfast/eventsourcing-transport';
import type { Scope } from 'effect/Scope';

/**
 * Connect to a WebSocket event sourcing server
 */
export const connect = (
  url: string
): Effect.Effect<
  Context.Tag.Service<typeof Protocol>,
  TransportError | ConnectionError,
  Protocol | Scope
> => {
  // Create the layer stack
  const protocolLayer = pipe(
    url,
    WebSocketConnector.connect,
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
    url,
    WebSocketConnector.connect,
    Effect.map((transport) => ProtocolLive(transport)),
    Layer.unwrapScoped
  );
};
