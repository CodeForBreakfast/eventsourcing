/**
 * WebSocket Transport Tests
 *
 * Tests the WebSocket transport implementation against the simplified transport contracts.
 * Uses mock WebSocket for Node.js testing environment.
 */

import { Effect, Scope, Stream, Ref, Queue, pipe } from 'effect';
import type {
  TransportTestContext,
  ConnectedTransportTestInterface,
  TransportMessage,
  ConnectionState,
} from '@codeforbreakfast/eventsourcing-testing-contracts';
import { runTransportContractTests } from '@codeforbreakfast/eventsourcing-testing-contracts';
import type {
  ConnectedTransport,
  TransportError,
  ConnectionError,
} from '@codeforbreakfast/eventsourcing-transport-contracts';
import { WebSocketConnector } from './websocket-transport.js';
import { makeMessageId } from '@codeforbreakfast/eventsourcing-transport-contracts';

// =============================================================================
// Mock WebSocket Implementation
// =============================================================================

type MockWebSocketState = {
  readonly readyState: number;
  readonly url: string;
  readonly onopen: ((event: Event) => void) | null;
  readonly onclose: ((event: CloseEvent) => void) | null;
  readonly onerror: ((event: Event) => void) | null;
  readonly onmessage: ((event: MessageEvent) => void) | null;
  readonly messages: Queue.Queue<string>;
  readonly isConnected: boolean;
};

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  private state: MockWebSocketState;
  private stateRef: Ref.Ref<MockWebSocketState>;

  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(url: string) {
    // Initialize state synchronously for now
    this.state = {
      readyState: MockWebSocket.CONNECTING,
      url,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      messages: Effect.runSync(Queue.unbounded<string>()),
      isConnected: false,
    };

    this.stateRef = Effect.runSync(Ref.make(this.state));

    // Track this instance globally for test utilities
    (global as any).lastCreatedWebSocket = this;

    // Simulate async connection
    setTimeout(() => {
      if (url.includes('invalid')) {
        this.simulateError();
      } else {
        this.simulateOpen();
      }
    }, 10);
  }

  get readyState(): number {
    return Effect.runSync(
      pipe(
        Ref.get(this.stateRef),
        Effect.map((s) => s.readyState)
      )
    );
  }

  get url(): string {
    return this.state.url;
  }

  send(data: string): void {
    const currentState = Effect.runSync(Ref.get(this.stateRef));
    if (currentState.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }

    // Echo the message back for testing
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage(new MessageEvent('message', { data }));
      }
    }, 0);
  }

  close(): void {
    Effect.runSync(
      Ref.update(this.stateRef, (s) => ({
        ...s,
        readyState: MockWebSocket.CLOSED,
        isConnected: false,
      }))
    );

    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  private simulateOpen(): void {
    Effect.runSync(
      Ref.update(this.stateRef, (s) => ({
        ...s,
        readyState: MockWebSocket.OPEN,
        isConnected: true,
      }))
    );

    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  private simulateError(): void {
    Effect.runSync(
      Ref.update(this.stateRef, (s) => ({
        ...s,
        readyState: MockWebSocket.CLOSED,
        isConnected: false,
      }))
    );

    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  // Test helper methods
  simulateDisconnect(): void {
    Effect.runSync(
      Ref.update(this.stateRef, (s) => ({
        ...s,
        readyState: MockWebSocket.CLOSED,
        isConnected: false,
      }))
    );

    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: 1006, reason: 'Connection lost' }));
    }
  }

  simulateReconnect(): void {
    this.simulateOpen();
  }
}

// Install mock globally for tests
(global as any).WebSocket = MockWebSocket;

// =============================================================================
// Transport Adapter
// =============================================================================

/**
 * Adapter that converts ConnectedTransport to ConnectedTransportTestInterface.
 * Handles the MessageId branding difference between the interfaces.
 */
function adaptConnectedTransport(
  transport: ConnectedTransport<
    import('@codeforbreakfast/eventsourcing-transport-contracts').TransportMessage
  >
): ConnectedTransportTestInterface {
  return {
    connectionState: transport.connectionState,

    publish: (message: TransportMessage) => {
      // Convert test message to transport message by branding the id
      const transportMessage: import('@codeforbreakfast/eventsourcing-transport-contracts').TransportMessage =
        {
          ...message,
          id: makeMessageId(message.id),
        };
      return transport.publish(transportMessage);
    },

    subscribe: (filter?: (msg: TransportMessage) => boolean) => {
      return pipe(
        transport.subscribe(
          filter
            ? (msg) => {
                // Convert transport message back to test message for filter
                const testMessage: TransportMessage = {
                  ...msg,
                  id: msg.id as string, // Remove branding for test interface
                };
                return filter(testMessage);
              }
            : undefined
        ),
        Effect.map((stream) =>
          Stream.map(stream, (msg) => ({
            ...msg,
            id: msg.id as string, // Remove branding for test interface
          }))
        )
      );
    },
  };
}

// =============================================================================
// Test Context Setup
// =============================================================================

/**
 * Creates the test context for WebSocket transport tests
 */
function createWebSocketTestContext(): Effect.Effect<TransportTestContext> {
  return Effect.succeed({
    createConnectedTransport: (url: string) => {
      const connector = new WebSocketConnector();
      return pipe(connector.connect(url), Effect.map(adaptConnectedTransport));
    },

    // WebSocket-specific test utilities
    simulateDisconnect: () =>
      Effect.sync(() => {
        // For the mock WebSocket, we can trigger disconnect through the global mock
        const mockWs = (global as any).lastCreatedWebSocket as MockWebSocket;
        if (mockWs) {
          mockWs.simulateDisconnect();
        }
      }),

    simulateReconnect: () =>
      Effect.sync(() => {
        const mockWs = (global as any).lastCreatedWebSocket as MockWebSocket;
        if (mockWs) {
          mockWs.simulateReconnect();
        }
      }),
  });
}

// =============================================================================
// Run Contract Tests
// =============================================================================

runTransportContractTests('WebSocket', createWebSocketTestContext);

// =============================================================================
// WebSocket-Specific Tests
// =============================================================================

import { describe, it, expect, beforeEach } from 'bun:test';
import { Duration } from 'effect';

describe('WebSocket Transport - Implementation Specific', () => {
  it('should use mock WebSocket in tests', () => {
    const ws = new (global as any).WebSocket('ws://test.com');
    expect(ws).toBeInstanceOf(MockWebSocket);
  });

  it('should handle WebSocket-specific connection URLs', async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const connector = new WebSocketConnector();
          const transport = yield* connector.connect('ws://localhost:8080/socket');

          // Should be connected
          const state = yield* pipe(transport.connectionState, Stream.take(1), Stream.runHead);

          expect(state._tag).toBe('Some');
          if (state._tag === 'Some') {
            expect(state.value).toBe('connected');
          }
        })
      )
    );
  });

  it('should handle wss:// URLs', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const connector = new WebSocketConnector();
          const transport = yield* connector.connect('wss://secure.example.com/socket');

          const state = yield* pipe(transport.connectionState, Stream.take(1), Stream.runHead);

          expect(state._tag).toBe('Some');
        })
      )
    );
  });
});
