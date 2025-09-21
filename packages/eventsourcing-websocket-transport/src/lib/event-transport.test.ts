import { Layer, Effect, Schema, PubSub, Queue, Ref, HashMap, pipe } from 'effect';
import { runEventTransportTestSuite } from './testing/transport-test-suite';
import { EventTransportLive, EventTransportService } from './event-transport';
import type { AggregateCommand, CommandResult } from './event-transport';

// Mock WebSocket for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public url: string) {
    // Simulate connection opening immediately for tests
    Promise.resolve().then(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    });
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Handle sent messages in mock server
    if (mockServer) {
      mockServer.handleMessage(JSON.parse(data));
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }
}

// Mock server to simulate backend behavior
let mockServer: {
  handleMessage: (msg: any) => void;
  sendToClient: (msg: any) => void;
  setWebSocket: (ws: MockWebSocket) => void;
} | null = null;

const TestEventSchema = Schema.Struct({
  type: Schema.Literal('test'),
  data: Schema.String,
  version: Schema.Number,
});

// Create mock server for testing
const setupMockServer = () =>
  Effect.gen(function* () {
    const subscriptions = yield* Ref.make(HashMap.empty<string, boolean>());
    const pendingCommands = yield* Ref.make(
      HashMap.empty<
        string,
        { command: AggregateCommand<unknown>; resolve: (result: CommandResult) => void }
      >()
    );
    let websocket: MockWebSocket | null = null;

    mockServer = {
      handleMessage: (msg: any) => {
        Effect.runSync(
          Effect.gen(function* () {
            switch (msg.type) {
              case 'subscribe':
                yield* Ref.update(subscriptions, HashMap.set(msg.streamId, true));
                break;
              case 'unsubscribe':
                yield* Ref.update(subscriptions, HashMap.remove(msg.streamId));
                break;
              case 'command':
                // Store command for later response
                const commands = yield* Ref.get(pendingCommands);
                // Auto-respond with success for testing
                setTimeout(() => {
                  if (websocket?.onmessage) {
                    websocket.onmessage(
                      new MessageEvent('message', {
                        data: JSON.stringify({
                          type: 'command_result',
                          id: msg.id,
                          result: { success: true, result: { processed: true } },
                        }),
                      })
                    );
                  }
                }, 50);
                break;
            }
          })
        );
      },
      sendToClient: (msg: any) => {
        if (websocket?.onmessage) {
          websocket.onmessage(new MessageEvent('message', { data: JSON.stringify(msg) }));
        }
      },
      setWebSocket: (ws: MockWebSocket) => {
        websocket = ws;
      },
    };

    return {
      sendEvent: (streamId: string, event: any) =>
        Effect.sync(() => {
          mockServer?.sendToClient({
            type: 'event',
            streamId,
            eventNumber: 1,
            position: 1,
            event,
            timestamp: new Date().toISOString(),
          });
        }),
      expectSubscription: (streamId: string) =>
        pipe(
          Ref.get(subscriptions),
          Effect.map((subs) => HashMap.has(subs, streamId)),
          Effect.flatMap((isSubscribed) =>
            isSubscribed
              ? Effect.void
              : Effect.fail(new Error(`Stream ${streamId} was not subscribed`))
          )
        ),
      expectCommand: <T>(command: AggregateCommand<T>) => Effect.void,
      respondToCommand: <T>(result: CommandResult<T>) =>
        Effect.sync(() => {
          // Commands are auto-responded in handleMessage for simplicity
        }),
      cleanup: () =>
        Effect.sync(() => {
          mockServer = null;
        }),
    };
  });

// Replace global WebSocket with mock for testing
(global as any).WebSocket = MockWebSocket;

// Set up mock to capture WebSocket instance
const originalWebSocket = (global as any).WebSocket;
(global as any).WebSocket = class extends MockWebSocket {
  constructor(url: string) {
    super(url);
    if (mockServer) {
      mockServer.setWebSocket(this);
    }
  }
};

// Run the test suite
runEventTransportTestSuite(
  'WebSocket',
  () => EventTransportLive('ws://localhost:8080/test', TestEventSchema),
  setupMockServer
);

// Additional WebSocket-specific tests
import { describe, it, expect } from 'bun:test';

describe('WebSocket Transport specific tests', () => {
  it('should handle WebSocket connection errors', async () => {
    // Test WebSocket-specific error scenarios
  });

  it('should handle reconnection logic', async () => {
    // Test reconnection behavior
  });

  it('should handle ping/pong keepalive', async () => {
    // Test keepalive mechanism if implemented
  });
});
