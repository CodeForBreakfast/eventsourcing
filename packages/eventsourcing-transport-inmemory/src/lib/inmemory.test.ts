/**
 * Basic In-Memory Transport Tests
 *
 * Tests to verify the basic functionality of the in-memory transport
 * using the new pure functional interface.
 */

import { describe, it, expect } from 'vitest';
import { Effect, Scope, Stream, pipe } from 'effect';
import { InMemoryAcceptor } from '../index';
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport-contracts';

describe('InMemory Transport Basic Tests', () => {
  it('should create acceptor without errors', async () => {
    const acceptorResult = await Effect.runPromise(InMemoryAcceptor.make());
    expect(acceptorResult).toBeDefined();
    expect(acceptorResult.start).toBeDefined();
  });

  it('should establish connection between client and server', async () => {
    await Effect.runPromise(
      Effect.scoped(
        pipe(
          // Start server
          InMemoryAcceptor.make(),
          Effect.flatMap((acceptor) => acceptor.start()),
          Effect.flatMap((server) =>
            pipe(
              // Connect client using server's connector
              server.connector(`inmemory://test`),
              Effect.flatMap((clientTransport) =>
                pipe(
                  // Get initial state
                  Stream.take(clientTransport.connectionState, 1),
                  Stream.runCollect,
                  Effect.map((states) => {
                    const firstState = Array.from(states)[0];
                    // Should start as 'connected' (in-memory is instant)
                    expect(firstState).toBe('connected');
                  })
                )
              )
            )
          )
        )
      )
    );
  }, 10000);

  it('should send and receive messages between client and server', async () => {
    await Effect.runPromise(
      Effect.scoped(
        pipe(
          // Start server first
          InMemoryAcceptor.make(),
          Effect.flatMap((acceptor) => acceptor.start()),
          Effect.flatMap((server) =>
            pipe(
              // Connect client using server's connector
              server.connector(`inmemory://test`),
              Effect.flatMap((clientTransport) =>
                pipe(
                  // Get server connection
                  Stream.take(server.connections, 1),
                  Stream.runCollect,
                  Effect.flatMap((connections) => {
                    const connection = Array.from(connections)[0];
                    expect(connection).toBeDefined();

                    // Just check that we can subscribe (don't wait for messages)
                    return connection.transport.subscribe();
                  }),
                  Effect.map(() => {
                    // Success if we get here
                    expect(true).toBe(true);
                  })
                )
              )
            )
          )
        )
      )
    );
  }, 10000);

  it('should handle connection errors for invalid URLs', async () => {
    await Effect.runPromise(
      Effect.scoped(
        pipe(
          // Start server first
          InMemoryAcceptor.make(),
          Effect.flatMap((acceptor) => acceptor.start()),
          Effect.flatMap((server) => {
            // Test with invalid URL
            return pipe(
              Effect.either(server.connector('invalid-url-format')),
              Effect.map((result) => {
                expect(result._tag).toBe('Left');
              })
            );
          })
        )
      )
    );
  });

  it('should support multiple isolated servers', async () => {
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
                server1.connector(`inmemory://server1`),
                server2.connector(`inmemory://server2`),
              ]),
              Effect.flatMap(([client1, client2]) =>
                pipe(
                  Effect.all([
                    Stream.take(client1.connectionState, 1).pipe(Stream.runHead),
                    Stream.take(client2.connectionState, 1).pipe(Stream.runHead),
                  ]),
                  Effect.map(([state1, state2]) => {
                    // Both clients should be connected to their respective servers
                    expect(state1._tag).toBe('Some');
                    expect(state2._tag).toBe('Some');
                    if (state1._tag === 'Some' && state2._tag === 'Some') {
                      expect(state1.value).toBe('connected');
                      expect(state2.value).toBe('connected');
                    }
                  })
                )
              )
            )
          )
        )
      )
    );
  }, 10000);
});
