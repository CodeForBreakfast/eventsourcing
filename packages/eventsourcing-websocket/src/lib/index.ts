/**
 * @codeforbreakfast/eventsourcing-websocket
 *
 * Batteries-included WebSocket event sourcing package.
 * Combines WebSocket transport with default protocol for rapid development.
 */

import { Context, Effect, Layer, pipe } from 'effect';
import type { Scope } from 'effect/Scope';
import { WebSocketConnector } from '@codeforbreakfast/eventsourcing-transport-websocket';
import { Protocol, ProtocolLive } from '@codeforbreakfast/eventsourcing-protocol';
import type { TransportError, ConnectionError } from '@codeforbreakfast/eventsourcing-transport';

const buildProtocolLayer = (
  layer: Layer.Layer<Protocol, TransportError | ConnectionError, Scope>
): Effect.Effect<Context.Tag.Service<typeof Protocol>, TransportError | ConnectionError, Scope> =>
  pipe(
    layer,
    Layer.build,
    Effect.map((context) => Context.get(context, Protocol))
  );

/**
 * Connect to a WebSocket event sourcing server
 */
export const connect = (
  url: string
): Effect.Effect<Context.Tag.Service<typeof Protocol>, TransportError | ConnectionError, Scope> => {
  return pipe(
    url,
    WebSocketConnector.connect,
    Effect.andThen(buildProtocolLayer(makeWebSocketProtocolLayer(url)))
  );
};

/**
 * Make WebSocket protocol layer
 */
export const makeWebSocketProtocolLayer = (
  url: string
): Layer.Layer<Protocol, TransportError | ConnectionError, Scope> => {
  return Layer.unwrapScoped(pipe(url, WebSocketConnector.connect, Effect.map(ProtocolLive)));
};
