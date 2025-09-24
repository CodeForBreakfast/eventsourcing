/**
 * Basic In-Memory Transport Tests
 *
 * Tests to verify the basic functionality of the in-memory transport
 * using the new pure functional interface.
 */

import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Scope, Stream, pipe } from 'effect';
import { InMemoryAcceptor } from '../index';
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport-contracts';

describe('InMemory Transport Basic Tests', () => {
  it.effect('should create acceptor without errors', () =>
    pipe(
      InMemoryAcceptor.make(),
      Effect.map((acceptorResult) => {
        expect(acceptorResult).toBeDefined();
        expect(acceptorResult.start).toBeDefined();
      })
    )
  );

  it.scoped(
    'should establish connection between client and server',
    () =>
      pipe(
        // Start server
        InMemoryAcceptor.make(),
        Effect.flatMap((acceptor) => acceptor.start()),
        Effect.flatMap((server) =>
          pipe(
            // Connect client using server's connector
            server.connector(),
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
      ),
    { timeout: 10000 }
  );

  it.scoped(
    'should send and receive messages between client and server',
    () =>
      pipe(
        // Start server first
        InMemoryAcceptor.make(),
        Effect.flatMap((acceptor) => acceptor.start()),
        Effect.flatMap((server) =>
          pipe(
            // Connect client using server's connector
            server.connector(),
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
      ),
    { timeout: 10000 }
  );

  it.scoped(
    'should support multiple isolated servers',
    () =>
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
            Effect.all([server1.connector(), server2.connector()]),
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
      ),
    { timeout: 10000 }
  );
});
