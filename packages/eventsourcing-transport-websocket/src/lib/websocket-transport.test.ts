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
import type { ConnectedTransport } from '@codeforbreakfast/eventsourcing-transport-contracts';
import { WebSocketConnector } from './websocket-transport.js';
import { makeMessageId, TransportError } from '@codeforbreakfast/eventsourcing-transport-contracts';

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

const MockWebSocketConstants = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

const createMockWebSocketState = (url: string): MockWebSocketState => ({
  readyState: MockWebSocketConstants.CONNECTING,
  url,
  onopen: null,
  onclose: null,
  onerror: null,
  onmessage: null,
  messages: Effect.runSync(Queue.unbounded<string>()),
  isConnected: false,
});

const simulateOpen = (
  stateRef: Ref.Ref<MockWebSocketState>,
  instance: MockWebSocketInstance
): void => {
  Effect.runSync(
    Ref.update(stateRef, (s) => ({
      ...s,
      readyState: MockWebSocketConstants.OPEN,
      isConnected: true,
    }))
  );

  if (instance.onopen) {
    instance.onopen(new Event('open'));
  }
};

const simulateError = (
  stateRef: Ref.Ref<MockWebSocketState>,
  instance: MockWebSocketInstance
): void => {
  Effect.runSync(
    Ref.update(stateRef, (s) => ({
      ...s,
      readyState: MockWebSocketConstants.CLOSED,
      isConnected: false,
    }))
  );

  if (instance.onerror) {
    instance.onerror(new Event('error'));
  }
};

type MockWebSocketInstance = {
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  readyState: number;
  url: string;
  send: (data: string) => void;
  close: () => void;
  simulateDisconnect: () => void;
  simulateReconnect: () => void;
};

function MockWebSocket(url: string): MockWebSocketInstance {
  const initialState = createMockWebSocketState(url);
  const stateRef = Effect.runSync(Ref.make(initialState));

  const instance: MockWebSocketInstance = {
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,

    get readyState(): number {
      return Effect.runSync(
        pipe(
          Ref.get(stateRef),
          Effect.map((s) => s.readyState)
        )
      );
    },

    get url(): string {
      return initialState.url;
    },

    send(data: string): void {
      const currentState = Effect.runSync(Ref.get(stateRef));
      if (currentState.readyState !== MockWebSocketConstants.OPEN) {
        throw new Error('WebSocket is not open');
      }

      setTimeout(() => {
        if (instance.onmessage) {
          instance.onmessage(new MessageEvent('message', { data }));
        }
      }, 0);
    },

    close(): void {
      Effect.runSync(
        Ref.update(stateRef, (s) => ({
          ...s,
          readyState: MockWebSocketConstants.CLOSED,
          isConnected: false,
        }))
      );

      if (instance.onclose) {
        instance.onclose(new CloseEvent('close'));
      }
    },

    simulateDisconnect(): void {
      Effect.runSync(
        Ref.update(stateRef, (s) => ({
          ...s,
          readyState: MockWebSocketConstants.CLOSED,
          isConnected: false,
        }))
      );

      if (instance.onclose) {
        instance.onclose(new CloseEvent('close', { code: 1006, reason: 'Connection lost' }));
      }
    },

    simulateReconnect(): void {
      simulateOpen(stateRef, instance);
    },
  };

  // Track this instance globally for test utilities
  (global as any).lastCreatedWebSocket = instance;

  // Simulate async connection
  setTimeout(() => {
    if (url.includes('invalid')) {
      simulateError(stateRef, instance);
    } else {
      simulateOpen(stateRef, instance);
    }
  }, 10);

  return instance;
}

// Add static constants to the function
(MockWebSocket as any).CONNECTING = MockWebSocketConstants.CONNECTING;
(MockWebSocket as any).OPEN = MockWebSocketConstants.OPEN;
(MockWebSocket as any).CLOSING = MockWebSocketConstants.CLOSING;
(MockWebSocket as any).CLOSED = MockWebSocketConstants.CLOSED;

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
          metadata: message.metadata || {},
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
      return pipe(
        WebSocketConnector.connect(url),
        Effect.map(adaptConnectedTransport),
        Effect.mapError(
          (error) =>
            new TransportError({
              message: error.message,
              cause: error.cause,
            })
        )
      );
    },

    // WebSocket-specific test utilities
    simulateDisconnect: () =>
      Effect.sync(() => {
        const mockWs = (global as any).lastCreatedWebSocket as MockWebSocketInstance;
        if (mockWs) {
          mockWs.simulateDisconnect();
        }
      }),

    simulateReconnect: () =>
      Effect.sync(() => {
        const mockWs = (global as any).lastCreatedWebSocket as MockWebSocketInstance;
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

import { describe, it, expect } from 'bun:test';

describe('WebSocket Transport - Implementation Specific', () => {
  it('should use mock WebSocket in tests', () => {
    const ws = new (global as any).WebSocket('ws://test.com');
    expect(typeof ws.send).toBe('function');
    expect(typeof ws.close).toBe('function');
    expect(typeof ws.url).toBe('string');
  });

  it('should handle WebSocket-specific connection URLs', async () => {
    await Effect.runPromise(
      Effect.scoped(
        pipe(
          WebSocketConnector.connect('ws://localhost:8080/socket'),
          Effect.flatMap((transport) =>
            pipe(
              transport.connectionState,
              Stream.take(1),
              Stream.runHead,
              Effect.tap((state) => {
                expect(state._tag).toBe('Some');
                if (state._tag === 'Some') {
                  expect(state.value).toBe('connected');
                }
                return Effect.void;
              })
            )
          )
        )
      )
    );
  });

  it('should handle wss:// URLs', async () => {
    await Effect.runPromise(
      Effect.scoped(
        pipe(
          WebSocketConnector.connect('wss://secure.example.com/socket'),
          Effect.flatMap((transport) =>
            pipe(
              transport.connectionState,
              Stream.take(1),
              Stream.runHead,
              Effect.tap((state) => {
                expect(state._tag).toBe('Some');
                return Effect.void;
              })
            )
          )
        )
      )
    );
  });
});
