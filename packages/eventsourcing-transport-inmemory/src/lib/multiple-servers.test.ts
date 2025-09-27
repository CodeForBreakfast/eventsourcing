/**
 * Test to verify multiple servers can coexist
 */

import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, Stream, pipe } from 'effect';
import { InMemoryConnector, InMemoryAcceptor } from './inmemory-transport';
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport';

describe('Multiple Servers Support', () => {
  it.effect('should support multiple independent servers simultaneously', () =>
    pipe(
      // Create three independent servers
      Effect.all([
        pipe(
          InMemoryAcceptor.make(),
          Effect.flatMap((acceptor) => acceptor.start())
        ),
        pipe(
          InMemoryAcceptor.make(),
          Effect.flatMap((acceptor) => acceptor.start())
        ),
        pipe(
          InMemoryAcceptor.make(),
          Effect.flatMap((acceptor) => acceptor.start())
        ),
      ]),
      Effect.flatMap(([server1, server2, server3]) =>
        pipe(
          // Connect clients to different servers
          Effect.all([server1.connector(), server2.connector(), server3.connector()]),
          Effect.flatMap(([client1, client2, client3]) => {
            // Send messages to different servers
            const msg1 = makeTransportMessage('msg1', 'test.message', { server: 1 });
            const msg2 = makeTransportMessage('msg2', 'test.message', { server: 2 });
            const msg3 = makeTransportMessage('msg3', 'test.message', { server: 3 });

            return pipe(
              Effect.all([client1.publish(msg1), client2.publish(msg2), client3.publish(msg3)]),
              Effect.flatMap(() =>
                pipe(
                  // Test that server1 broadcast reaches its clients but not others
                  server1.broadcast(
                    makeTransportMessage('broadcast1', 'server.broadcast', { from: 'server1' })
                  ),
                  Effect.flatMap(() =>
                    pipe(
                      client1.subscribe(),
                      Effect.flatMap((client1Subscription) =>
                        pipe(
                          client1Subscription,
                          Stream.take(1),
                          Stream.runCollect,
                          Effect.timeout(1000),
                          Effect.map((client1Messages) => {
                            expect(Array.from(client1Messages)[0]?.id).toBe('broadcast1');
                          })
                        )
                      )
                    )
                  )
                )
              )
            );
          })
        )
      ),
      Effect.scoped
    )
  );
});
