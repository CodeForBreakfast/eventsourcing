/**
 * Test to verify multiple servers can coexist
 */

import { describe, test, expect } from 'bun:test';
import { Effect, Stream, pipe } from 'effect';
import { InMemoryConnector, InMemoryAcceptor } from './inmemory-transport';
import { makeTransportMessage } from '@codeforbreakfast/eventsourcing-transport';

describe('Multiple Servers Support', () => {
  test('should support multiple independent servers simultaneously', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          // Create three independent servers
          const server1 = yield* pipe(
            InMemoryAcceptor.make(),
            Effect.flatMap((acceptor) => acceptor.start())
          );

          const server2 = yield* pipe(
            InMemoryAcceptor.make(),
            Effect.flatMap((acceptor) => acceptor.start())
          );

          const server3 = yield* pipe(
            InMemoryAcceptor.make(),
            Effect.flatMap((acceptor) => acceptor.start())
          );

          // Connect clients to different servers
          const client1 = yield* server1.connector();
          const client2 = yield* server2.connector();
          const client3 = yield* server3.connector();

          // Also connect multiple clients to the same server
          const client1b = yield* server1.connector();

          // Set up message subscriptions
          const server1Messages = yield* pipe(
            server1.connections,
            Stream.take(2), // Two clients connected to server1
            Stream.runCollect
          );

          // Send messages to different servers
          const msg1 = makeTransportMessage('msg1', 'test.message', { server: 1 });
          const msg2 = makeTransportMessage('msg2', 'test.message', { server: 2 });
          const msg3 = makeTransportMessage('msg3', 'test.message', { server: 3 });

          yield* client1.publish(msg1);
          yield* client2.publish(msg2);
          yield* client3.publish(msg3);

          // Verify servers are independent
          const server1Connection = Array.from(server1Messages)[0];
          if (!server1Connection) throw new Error('No connection to server1');

          const server1Stream = yield* server1Connection.transport.subscribe();
          const receivedOnServer1 = yield* pipe(
            server1Stream,
            Stream.take(1),
            Stream.runCollect,
            Effect.timeout(1000)
          );

          // Server 1 should only receive msg1
          expect(Array.from(receivedOnServer1)[0]?.id).toBe('msg1');

          // Broadcast from server2 should not affect server1 clients
          yield* server2.broadcast(
            makeTransportMessage('broadcast2', 'server.broadcast', { from: 'server2' })
          );

          // Client1 (connected to server1) should not receive server2's broadcast
          const client1Subscription = yield* client1.subscribe();
          const client1Messages = yield* pipe(
            client1Subscription,
            Stream.take(1),
            Stream.runCollect,
            Effect.timeout(100),
            Effect.either
          );

          // Should timeout as no message arrives
          expect(client1Messages._tag).toBe('Left');

          // But broadcast from server1 should reach its clients
          yield* server1.broadcast(
            makeTransportMessage('broadcast1', 'server.broadcast', { from: 'server1' })
          );

          const client1bSubscription = yield* client1b.subscribe();
          const client1bMessages = yield* pipe(
            client1bSubscription,
            Stream.take(1),
            Stream.runCollect,
            Effect.timeout(1000)
          );

          expect(Array.from(client1bMessages)[0]?.id).toBe('broadcast1');
        })
      )
    );
  });
});
