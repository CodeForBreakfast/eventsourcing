/**
 * This file demonstrates how the new functional design makes invalid states unrepresentable.
 *
 * Try to uncomment the commented lines below to see TypeScript compilation errors!
 */

import { Schema, Effect, pipe } from 'effect';
import {
  connect,
  EventTransportConnector,
  EventTransportConnectorLive,
  ConnectedTransport,
} from '../src/lib/event-transport';

// Define a test event schema
const TestEvent = Schema.Struct({
  type: Schema.Literal('test'),
  data: Schema.String,
});

// IMPOSSIBLE TO USE BEFORE CONNECTION
// ===================================

// With the old design, you could have an EventTransport object and call methods on it
// even if it wasn't connected. Now, you MUST connect first to get a ConnectedTransport.

// ❌ THIS IS IMPOSSIBLE - there's no way to get a ConnectedTransport without connecting
// const transport = magicallyGetTransport(); // This function doesn't exist
// transport.subscribe({ streamId: 'test', eventNumber: 0 }); // Would fail

// ✅ THE ONLY WAY - Must explicitly connect
const validUsage = pipe(
  // 1. Connect returns an Effect that resolves to ConnectedTransport
  connect('ws://localhost:8080', TestEvent),

  // 2. Use Effect.flatMap to work with the connected transport
  Effect.flatMap((connectedTransport) =>
    pipe(
      // Now we can safely use the transport because TypeScript guarantees it's connected
      connectedTransport.subscribe({
        streamId: 'test-stream' as any, // Cast for demo
        eventNumber: 0,
      }),

      Effect.flatMap((eventStream) =>
        // Process the stream or send commands
        connectedTransport.sendCommand({
          aggregate: {
            position: { streamId: 'user-123' as any, eventNumber: 5 },
            name: 'User',
          },
          commandName: 'RegisterUser',
          payload: { email: 'test@example.com' },
        })
      ),

      // Clean up the connection
      Effect.ensuring(connectedTransport.disconnect())
    )
  ),

  // Automatic resource cleanup
  Effect.scoped
);

// USING WITH SERVICES
// ===================

// The connector service provides a connect function
const serviceUsage = pipe(
  // Get the connector from the service
  EventTransportConnector,
  Effect.flatMap((connector) =>
    // Call connect to get a ConnectedTransport
    connector.connect('ws://localhost:8080')
  ),
  Effect.flatMap((connectedTransport) =>
    // Now use the connected transport
    connectedTransport.subscribe({
      streamId: 'test' as any,
      eventNumber: 0,
    })
  ),
  Effect.scoped
);

// DEMONSTRATE TYPE SAFETY
// ========================

// This function REQUIRES a ConnectedTransport - you cannot pass anything else
const doSomethingWithTransport = (transport: ConnectedTransport<any>) =>
  // TypeScript guarantees this transport is connected and safe to use
  transport.subscribe({ streamId: 'test' as any, eventNumber: 0 });

// ❌ YOU CANNOT DO THIS - there's no way to create a ConnectedTransport without connecting
// const fakeTransport = {}; // This is not a ConnectedTransport
// doSomethingWithTransport(fakeTransport); // ❌ TypeScript error!

// ✅ YOU MUST DO THIS - Connect first, then use
const correctUsage = pipe(
  connect('ws://localhost:8080', TestEvent),
  Effect.flatMap(
    (realTransport) => doSomethingWithTransport(realTransport) // ✅ TypeScript is happy
  ),
  Effect.scoped
);

/**
 * KEY BENEFITS:
 *
 * 1. IMPOSSIBLE TO CALL METHODS BEFORE CONNECTING
 *    - The types literally prevent this at compile time
 *
 * 2. CLEAR INTENTIONS
 *    - connect() clearly shows connection is required
 *    - ConnectedTransport clearly shows it's ready to use
 *
 * 3. PROPER ERROR HANDLING
 *    - Connection errors happen at connection time
 *    - Methods on ConnectedTransport can focus on business logic
 *
 * 4. RESOURCE SAFETY
 *    - Scoped effects ensure proper cleanup
 *    - No leaked connections or resources
 */

export { validUsage, serviceUsage, correctUsage };
