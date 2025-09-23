/**
 * Test the pure functional implementation
 */

import { describe, it, expect } from 'vitest';
import { Effect, Stream, pipe } from 'effect';
import { InMemoryAcceptor } from './inmemory-transport';

describe('Pure Functional InMemory Transport', () => {
  it('should connect successfully', async () => {
    await Effect.runPromise(
      Effect.scoped(
        pipe(
          InMemoryAcceptor.make(),
          Effect.flatMap((acceptor) => acceptor.start()),
          Effect.flatMap((server) => server.connector('inmemory://test')),
          Effect.flatMap((clientTransport) =>
            pipe(
              Stream.take(clientTransport.connectionState, 1),
              Stream.runCollect,
              Effect.map((states) => {
                const state = Array.from(states)[0];
                // In-memory connections are instant, so should be 'connected'
                expect(state).toBe('connected');
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
          InMemoryAcceptor.make(),
          Effect.flatMap((acceptor) => acceptor.start()),
          Effect.flatMap((server) =>
            pipe(
              server.connector('inmemory://test'),
              Effect.flatMap(() =>
                pipe(
                  Stream.take(server.connections, 1),
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

  it('should support isolated servers', async () => {
    await Effect.runPromise(
      Effect.scoped(
        pipe(
          Effect.all([
            pipe(
              InMemoryAcceptor.make(),
              Effect.flatMap((acceptor) => acceptor.start())
            ),
            pipe(
              InMemoryAcceptor.make(),
              Effect.flatMap((acceptor) => acceptor.start())
            ),
          ]),
          Effect.flatMap(([server1, server2]) =>
            pipe(
              Effect.all([
                server1.connector('inmemory://test1'),
                server2.connector('inmemory://test2'),
              ]),
              Effect.map(([client1, client2]) => {
                // Both clients should exist and be different instances
                expect(client1).toBeDefined();
                expect(client2).toBeDefined();
                expect(client1).not.toBe(client2);
              })
            )
          )
        )
      )
    );
  });
});
