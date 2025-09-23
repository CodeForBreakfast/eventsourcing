/**
 * Test the simplified implementation
 */

import { describe, it, expect } from 'vitest';
import { Effect, Stream, pipe } from 'effect';
import { SimpleInMemoryConnector, SimpleInMemoryAcceptor } from './inmemory-transport';

describe('Simple InMemory Transport', () => {
  it('should connect successfully', async () => {
    await Effect.runPromise(
      Effect.scoped(
        pipe(
          SimpleInMemoryAcceptor.make({ serverId: 'simple-test' }),
          Effect.flatMap((acceptor) => acceptor.start()),
          Effect.flatMap(() => SimpleInMemoryConnector.connect('inmemory://simple-test')),
          Effect.flatMap((clientTransport) =>
            pipe(
              Stream.take(clientTransport.connectionState, 1),
              Stream.runCollect,
              Effect.map((states) => {
                const state = Array.from(states)[0];
                expect(['connecting', 'connected']).toContain(state);
              })
            )
          )
        )
      )
    );
  });

  it('should handle server connections', async () => {
    await Effect.runPromise(
      Effect.scoped(
        pipe(
          SimpleInMemoryAcceptor.make({ serverId: 'simple-server-test' }),
          Effect.flatMap((acceptor) => acceptor.start()),
          Effect.flatMap((serverTransport) =>
            pipe(
              SimpleInMemoryConnector.connect('inmemory://simple-server-test'),
              Effect.flatMap(() =>
                pipe(
                  Stream.take(serverTransport.connections, 1),
                  Stream.runCollect,
                  Effect.map((connections) => {
                    const connection = Array.from(connections)[0];
                    expect(connection).toBeDefined();
                    expect(connection.clientId).toBeDefined();
                    expect(connection.transport).toBeDefined();
                  })
                )
              )
            )
          )
        )
      )
    );
  });
});
